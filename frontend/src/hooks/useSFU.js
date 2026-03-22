// frontend/src/hooks/useSFU.js
/**
 * useSFU — mediasoup-client 기반 SFU 훅
 * 기존 useVideoMeeting의 WebRTC 로직(createPeerConnection 등)을 대체합니다.
 *
 * 설치 필요:
 *   npm install mediasoup-client
 */
import { useRef, useState, useCallback } from 'react';
import * as mediasoupClient from 'mediasoup-client';

/**
 * TURN 서버 credentials 생성 (HMAC-SHA1 시간기반)
 * coturn의 --use-auth-secret 방식과 호환
 */
async function generateTurnCredentials(secret) {
  const ttl = 24 * 3600; // 24시간
  const username = Math.floor(Date.now() / 1000) + ttl;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(username)));
  const credential = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return { username: String(username), credential };
}

export function useSFU({ wsRef, roomId }) {
  const deviceRef        = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const producersRef     = useRef(new Map()); // kind → producer
  const consumersRef     = useRef(new Map()); // consumerId → consumer
  const localStreamRef   = useRef(null);

  const [remoteStreams, setRemoteStreams]     = useState(new Map()); // peerId → { audio, video }
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  // ── 미디어 디바이스 초기화 ──────────────────────────────────
  const getLocalMedia = useCallback(async ({ video = true, audio = true } = {}) => {
    const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
    localStreamRef.current = stream;
    return stream;
  }, []);

  // ── WebSocket 메시지 전송 헬퍼 ────────────────────────────
  const wsSend = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, [wsRef]);

  // ── Promise 응답 대기 헬퍼 ────────────────────────────────
  // WS 메시지는 비동기이므로 응답 type으로 resolve
  const waitForMessage = useCallback((type, timeoutMs = 10000) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeoutMs);
      const handler = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === type) {
          wsRef.current?.removeEventListener('message', handler);
          clearTimeout(timer);
          resolve(data);
        }
        if (data.type === 'sfu_error' && data.request === type.replace('sfu_', '')) {
          wsRef.current?.removeEventListener('message', handler);
          clearTimeout(timer);
          reject(new Error(data.message));
        }
      };
      wsRef.current?.addEventListener('message', handler);
    });
  }, [wsRef]);

  // ── SFU 초기화 (방 입장 시 호출) ─────────────────────────
  const initSFU = useCallback(async () => {
    setConnectionStatus('connecting');
    try {
      // 1. Router RTP Capabilities 요청
      wsSend({ type: 'sfu_get_rtp_capabilities' });
      const { rtpCapabilities } = await waitForMessage('sfu_rtp_capabilities');

      // 2. mediasoup Device 초기화
      const device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities });
      deviceRef.current = device;

      // 3. SFU 방 참가 (현재 producers 목록 수신)
      wsSend({ type: 'sfu_join' });
      const { producers: existingProducers } = await waitForMessage('sfu_joined');

      // 4. Send / Recv Transport 생성
      await _createSendTransport(device);
      await _createRecvTransport(device);

      // 5. 이미 방에 있는 producer들 consume
      for (const prod of existingProducers) {
        await consumeProducer(prod.peerId, prod.producerId, prod.kind);
      }

      setConnectionStatus('connected');
      console.log('SFU initialized');
    } catch (e) {
      setConnectionStatus('failed');
      console.error('SFU init error:', e);
      throw e;
    }
  }, [wsSend, waitForMessage]);

  // ── Send Transport 생성 ───────────────────────────────────
  const _createSendTransport = useCallback(async (device) => {
    wsSend({ type: 'sfu_create_transport', direction: 'send' });
    const params = await waitForMessage('sfu_transport_created');

    const transport = device.createSendTransport({
      id: params.id,
      iceParameters: params.iceParameters,
      iceCandidates: params.iceCandidates,
      dtlsParameters: params.dtlsParameters,
      iceServers: await _getIceServers(),
    });

    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
      wsSend({
        type: 'sfu_connect_transport',
        transportId: transport.id,
        dtlsParameters,
      });
      waitForMessage('sfu_transport_connected').then(callback).catch(errback);
    });

    transport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
      wsSend({
        type: 'sfu_produce',
        transportId: transport.id,
        kind,
        rtpParameters,
        appData,
      });
      waitForMessage('sfu_produced')
        .then(({ id }) => callback({ id }))
        .catch(errback);
    });

    transport.on('connectionstatechange', (state) => {
      console.log(`Send transport state: ${state}`);
      if (state === 'failed') setConnectionStatus('failed');
    });

    sendTransportRef.current = transport;
  }, [wsSend, waitForMessage]);

  // ── Recv Transport 생성 ───────────────────────────────────
  const _createRecvTransport = useCallback(async (device) => {
    wsSend({ type: 'sfu_create_transport', direction: 'recv' });
    // 두 번째 transport_created 메시지를 기다림
    const params = await waitForMessage('sfu_transport_created');

    const transport = device.createRecvTransport({
      id: params.id,
      iceParameters: params.iceParameters,
      iceCandidates: params.iceCandidates,
      dtlsParameters: params.dtlsParameters,
      iceServers: await _getIceServers(),
    });

    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
      wsSend({
        type: 'sfu_connect_transport',
        transportId: transport.id,
        dtlsParameters,
      });
      waitForMessage('sfu_transport_connected').then(callback).catch(errback);
    });

    transport.on('connectionstatechange', (state) => {
      console.log(`Recv transport state: ${state}`);
    });

    recvTransportRef.current = transport;
  }, [wsSend, waitForMessage]);

  // ── 로컬 미디어 송신 시작 ────────────────────────────────
  const startProducing = useCallback(async (stream) => {
    const transport = sendTransportRef.current;
    if (!transport) throw new Error('Send transport not ready');

    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];

    if (audioTrack) {
      const audioProducer = await transport.produce({ track: audioTrack });
      producersRef.current.set('audio', audioProducer);
    }

    if (videoTrack) {
      const videoProducer = await transport.produce({
        track: videoTrack,
        // Simulcast: 3개 레이어 (저/중/고화질)
        encodings: [
          { rid: 'r0', maxBitrate: 100000, scalabilityMode: 'S1T3' },
          { rid: 'r1', maxBitrate: 300000, scalabilityMode: 'S1T3' },
          { rid: 'r2', maxBitrate: 900000, scalabilityMode: 'S1T3' },
        ],
        codecOptions: { videoGoogleStartBitrate: 500 },
      });
      producersRef.current.set('video', videoProducer);
    }
  }, []);

  // ── 타 참가자 미디어 수신 ─────────────────────────────────
  const consumeProducer = useCallback(async (peerId, producerId, kind) => {
    const device = deviceRef.current;
    const transport = recvTransportRef.current;
    if (!device || !transport) return;

    wsSend({
      type: 'sfu_consume',
      producerPeerId: peerId,
      producerId,
      transportId: transport.id,
      rtpCapabilities: device.rtpCapabilities,
    });

    const consumerData = await waitForMessage('sfu_consumed');
    const consumer = await transport.consume({
      id: consumerData.id,
      producerId: consumerData.producerId,
      kind: consumerData.kind,
      rtpParameters: consumerData.rtpParameters,
    });

    consumersRef.current.set(consumer.id, consumer);

    // Remote stream 업데이트
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      const existing = next.get(peerId) || {};
      const stream = existing.stream || new MediaStream();
      stream.addTrack(consumer.track);
      next.set(peerId, {
        ...existing,
        stream,
        username: peerId,  // ← 이 줄 추가
        [`${kind}ConsumerId`]: consumer.id,
      });
      return next;
    });

    // SFU에게 resume 요청 (paused=true로 생성되었으므로)
    wsSend({ type: 'sfu_resume_consumer', consumerId: consumer.id });
    await waitForMessage('sfu_consumer_resumed');

    consumer.on('trackended', () => removeRemoteStream(peerId, kind));
    consumer.on('transportclose', () => removeRemoteStream(peerId, kind));
  }, [wsSend, waitForMessage]);

  // ── 수신 중단 ─────────────────────────────────────────────
  const removeRemoteStream = useCallback((peerId, kind) => {
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      const existing = next.get(peerId);
      if (!existing) return prev;
      if (kind) {
        delete existing[`${kind}ConsumerId`];
        const hasMedia = existing.stream?.getTracks().length > 0;
        if (!hasMedia) next.delete(peerId);
        else next.set(peerId, { ...existing });
      } else {
        next.delete(peerId);
      }
      return next;
    });
  }, []);

  // ── Mute / Unmute ─────────────────────────────────────────
  const muteAudio = useCallback(() => {
    const producer = producersRef.current.get('audio');
    if (!producer) return;
    producer.pause();
    wsSend({ type: 'sfu_producer_pause', producerId: producer.id, kind: 'audio' });
  }, [wsSend]);

  const unmuteAudio = useCallback(() => {
    const producer = producersRef.current.get('audio');
    if (!producer) return;
    producer.resume();
    wsSend({ type: 'sfu_producer_resume', producerId: producer.id, kind: 'audio' });
  }, [wsSend]);

  const muteVideo = useCallback(() => {
    const producer = producersRef.current.get('video');
    if (!producer) return;
    producer.pause();
    wsSend({ type: 'sfu_producer_pause', producerId: producer.id, kind: 'video' });
  }, [wsSend]);

  const unmuteVideo = useCallback(() => {
    const producer = producersRef.current.get('video');
    if (!producer) return;
    producer.resume();
    wsSend({ type: 'sfu_producer_resume', producerId: producer.id, kind: 'video' });
  }, [wsSend]);

  // ── WebSocket 메시지 처리 (컴포넌트에서 onMessage로 연결) ──
  const handleSFUMessage = useCallback(async (data) => {
    switch (data.type) {
      // 새 참가자가 방에 들어옴
      case 'peer_joined':
        console.log(`Peer joined: ${data.username}`);
        break;

      // 새 Producer 발행 — 즉시 consume
      case 'new_producer':
        if (deviceRef.current && recvTransportRef.current) {
          await consumeProducer(data.peerId, data.producerId, data.kind);
        }
        break;

      // 참가자 퇴장
      case 'user_left':
        removeRemoteStream(data.user_id);
        break;

      default:
        break;
    }
  }, [consumeProducer, removeRemoteStream]);

  // ── 정리 ─────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    producersRef.current.forEach((p) => { try { p.close(); } catch (_) {} });
    consumersRef.current.forEach((c) => { try { c.close(); } catch (_) {} });
    sendTransportRef.current?.close();
    recvTransportRef.current?.close();
    producersRef.current.clear();
    consumersRef.current.clear();
    setRemoteStreams(new Map());
    setConnectionStatus('disconnected');
  }, []);

  // ── ICE 서버 설정 (TURN credentials 포함) ────────────────
  async function _getIceServers() {
    const turnUrl    = import.meta.env.VITE_TURN_URL;
    const turnSecret = import.meta.env.VITE_TURN_SECRET;

    const servers = [
      { urls: 'stun:stun.l.google.com:19302' },
    ];

    if (turnUrl && turnSecret) {
      const { username, credential } = await generateTurnCredentials(turnSecret);
      servers.push({ urls: turnUrl, username, credential });
      servers.push({ urls: turnUrl.replace('turn:', 'turns:'), username, credential });
    }

    return servers;
  }

  return {
    localStreamRef,
    remoteStreams,
    connectionStatus,
    getLocalMedia,
    initSFU,
    startProducing,
    consumeProducer,
    removeRemoteStream,
    muteAudio,
    unmuteAudio,
    muteVideo,
    unmuteVideo,
    handleSFUMessage,
    cleanup,
  };
}
