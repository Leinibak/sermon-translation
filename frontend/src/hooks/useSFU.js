// frontend/src/hooks/useSFU.js
/**
 * useSFU — mediasoup-client 기반 SFU 훅
 *
 * [수정 내용] waitForMessage를 addEventListener 방식에서 내부 큐(pendingRef) 방식으로 교체
 *   - 기존 문제: onmessage가 메시지를 먼저 소비한 뒤 addEventListener를 붙이면 이미 지나간
 *     메시지를 받지 못해 "Timeout waiting for sfu_rtp_capabilities" 발생
 *   - 해결: 컴포넌트의 onmessage에서 dispatchSFUMessage()를 먼저 호출하여 큐에 투입하고,
 *     waitForMessage는 큐에서 꺼내는 방식으로 동작
 *   - sfu_transport_created를 direction(send/recv)으로 구분해 두 번 연속 호출 시 뒤섞이지 않게 수정
 */
import { useRef, useState, useCallback } from 'react';
import * as mediasoupClient from 'mediasoup-client';

/**
 * TURN 서버 credentials 생성 (HMAC-SHA1 시간기반)
 * coturn의 --use-auth-secret 방식과 호환
 */
async function generateTurnCredentials(secret) {
  const ttl = 24 * 3600;
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

  // ── [추가] 메시지 큐 ──────────────────────────────────────────
  // key: messageType (+ 선택적 filter key), value: Array<{resolve, reject, timer, filter}>
  const pendingRef = useRef(new Map());

  const [remoteStreams, setRemoteStreams]       = useState(new Map());
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  // ── 미디어 디바이스 초기화 ────────────────────────────────────
  const getLocalMedia = useCallback(async ({ video = true, audio = true } = {}) => {
    const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
    localStreamRef.current = stream;
    return stream;
  }, []);

  // ── WebSocket 메시지 전송 헬퍼 ──────────────────────────────
  const wsSend = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, [wsRef]);

  // ── [교체] 컴포넌트 onmessage에서 호출 → 큐에 투입 ──────────
  // 컴포넌트의 socket.onmessage 안에서 반드시 이 함수를 먼저 호출해야 합니다.
  // 반환값: true = waitForMessage 대기 중이던 Promise가 resolve됨 (이벤트 기반 처리는 불필요)
  //         false = 대기 중인 waiter 없음 (peer_joined, new_producer 등 이벤트 처리 계속 진행)
  const dispatchSFUMessage = useCallback((data) => {
    // sfu_error는 request 필드로 매핑
    if (data.type === 'sfu_error') {
      const targetType = `sfu_${data.request}`;
      const waiters = pendingRef.current.get(targetType);
      if (waiters && waiters.length > 0) {
        // filter 조건 없는 첫 번째 waiter에게 전달
        const idx = waiters.findIndex(w => !w.filter || w.filter(data));
        if (idx !== -1) {
          const { reject, timer } = waiters.splice(idx, 1)[0];
          if (waiters.length === 0) pendingRef.current.delete(targetType);
          clearTimeout(timer);
          reject(new Error(data.message || `SFU error: ${data.request}`));
          return true;
        }
      }
      return false;
    }

    const waiters = pendingRef.current.get(data.type);
    if (!waiters || waiters.length === 0) return false;

    // filter 조건을 통과하는 첫 번째 waiter에게 전달
    const idx = waiters.findIndex(w => !w.filter || w.filter(data));
    if (idx === -1) return false;

    const { resolve, timer } = waiters.splice(idx, 1)[0];
    if (waiters.length === 0) pendingRef.current.delete(data.type);
    clearTimeout(timer);
    resolve(data);
    return true;
  }, []);

  // ── [교체] waitForMessage: 큐에 등록하고 Promise 반환 ────────
  // filter: (data) => boolean — 선택적 필터 (direction 구분 등에 사용)
  const waitForMessage = useCallback((type, timeoutMs = 10000, filter = null) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // 타임아웃 시 큐에서 자신을 제거
        const waiters = pendingRef.current.get(type);
        if (waiters) {
          const idx = waiters.findIndex(w => w.resolve === resolve);
          if (idx !== -1) waiters.splice(idx, 1);
          if (waiters.length === 0) pendingRef.current.delete(type);
        }
        reject(new Error(`Timeout waiting for ${type}`));
      }, timeoutMs);

      if (!pendingRef.current.has(type)) {
        pendingRef.current.set(type, []);
      }
      pendingRef.current.get(type).push({ resolve, reject, timer, filter });
    });
  }, []);

  // ── SFU 초기화 (방 입장 시 호출) ────────────────────────────
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
      //    ※ direction 필터로 sfu_transport_created 응답을 정확히 구분
      await _createSendTransport(device);
      await _createRecvTransport(device);

      // 5. 이미 방에 있는 producer들 consume
      for (const prod of existingProducers) {
        await consumeProducer(prod.peerId, prod.producerId, prod.kind, prod.username);
      }

      setConnectionStatus('connected');
      console.log('✅ SFU initialized');
    } catch (e) {
      setConnectionStatus('failed');
      console.error('SFU init error:', e);
      throw e;
    }
  }, [wsSend, waitForMessage]);

  // ── Send Transport 생성 ─────────────────────────────────────
  const _createSendTransport = useCallback(async (device) => {
    wsSend({ type: 'sfu_create_transport', direction: 'send' });
    // [수정] direction === 'send' 인 응답만 수신
    const params = await waitForMessage(
      'sfu_transport_created',
      10000,
      (d) => d.direction === 'send'
    );

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
      // transportId 필터로 자신의 응답만 수신
      waitForMessage(
        'sfu_transport_connected',
        10000,
        (d) => d.transportId === transport.id
      ).then(callback).catch(errback);
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

  // ── Recv Transport 생성 ─────────────────────────────────────
  const _createRecvTransport = useCallback(async (device) => {
    wsSend({ type: 'sfu_create_transport', direction: 'recv' });
    // [수정] direction === 'recv' 인 응답만 수신
    const params = await waitForMessage(
      'sfu_transport_created',
      10000,
      (d) => d.direction === 'recv'
    );

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
      waitForMessage(
        'sfu_transport_connected',
        10000,
        (d) => d.transportId === transport.id
      ).then(callback).catch(errback);
    });

    transport.on('connectionstatechange', (state) => {
      console.log(`Recv transport state: ${state}`);
    });

    recvTransportRef.current = transport;
  }, [wsSend, waitForMessage]);

  // ── 로컬 미디어 송신 시작 ───────────────────────────────────
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

  // ── 타 참가자 미디어 수신 ───────────────────────────────────
  const consumeProducer = useCallback(async (peerId, producerId, kind) => {
    const device    = deviceRef.current;
    const transport = recvTransportRef.current;
    if (!device || !transport) return;

    wsSend({
      type: 'sfu_consume',
      producerPeerId: peerId,
      producerId,
      transportId: transport.id,
      rtpCapabilities: device.rtpCapabilities,
    });

    // [수정] producerId 필터로 자신의 응답만 수신 (동시 consume 시 뒤섞임 방지)
    const consumerData = await waitForMessage(
      'sfu_consumed',
      10000,
      (d) => d.producerId === producerId
    );

    const consumer = await transport.consume({
      id: consumerData.id,
      producerId: consumerData.producerId,
      kind: consumerData.kind,
      rtpParameters: consumerData.rtpParameters,
    });

    consumersRef.current.set(consumer.id, consumer);

    setRemoteStreams((prev) => {
      const next = new Map(prev);
      const existing = next.get(peerId) || {};
      const stream = existing.stream || new MediaStream();
      stream.addTrack(consumer.track);
      next.set(peerId, {
        ...existing,
        stream,
        // ✅ username이 있으면 사용, 없으면 peerId 폴백
        username: username || existing.username || peerId,
        [`${kind}ConsumerId`]: consumer.id,
      });
      return next;
    });

    // SFU에게 resume 요청 (paused=true로 생성되었으므로)
    wsSend({ type: 'sfu_resume_consumer', consumerId: consumer.id });
    await waitForMessage(
      'sfu_consumer_resumed',
      10000,
      (d) => d.consumerId === consumer.id
    );

    consumer.on('trackended', () => removeRemoteStream(peerId, kind));
    consumer.on('transportclose', () => removeRemoteStream(peerId, kind));
  }, [wsSend, waitForMessage]);

  // ── 수신 중단 ──────────────────────────────────────────────
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

  // ── Mute / Unmute ──────────────────────────────────────────
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

  // ── WebSocket 이벤트 기반 메시지 처리 ─────────────────────
  // peer_joined, new_producer, user_left 등 Promise 대기 없이 이벤트로만 처리하는 타입
  const handleSFUMessage = useCallback(async (data) => {
    switch (data.type) {
      case 'peer_joined':
        console.log(`Peer joined: ${data.username}`);
        break;

      case 'new_producer':
        if (deviceRef.current && recvTransportRef.current) {
          await consumeProducer(data.peerId, data.producerId, data.kind, data.username);
        }
        break;

      case 'user_left':
      // ❌ removeRemoteStream(data.user_id)  → 숫자, key와 불일치
        // ✅ peerId 형식으로 변환
        removeRemoteStream(`user_${data.user_id}`);
        break;

      default:
        break;
    }
  }, [consumeProducer, removeRemoteStream]);

  // ── 정리 ──────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    // 대기 중인 Promise 전부 reject
    pendingRef.current.forEach((waiters) => {
      waiters.forEach(({ reject, timer }) => {
        clearTimeout(timer);
        reject(new Error('SFU cleanup'));
      });
    });
    pendingRef.current.clear();

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

  // ── ICE 서버 설정 ──────────────────────────────────────────
  async function _getIceServers() {
    const turnUrl    = import.meta.env.VITE_TURN_URL;
    const turnSecret = import.meta.env.VITE_TURN_SECRET;

    const servers = [{ urls: 'stun:stun.l.google.com:19302' }];

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
    dispatchSFUMessage,   // ← [추가] 컴포넌트 onmessage에서 반드시 호출
    cleanup,
  };
}