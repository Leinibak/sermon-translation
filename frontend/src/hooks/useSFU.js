// frontend/src/hooks/useSFU.js
/**
 * useSFU — mediasoup-client 기반 SFU 훅
 *
 * [수정 내역]
 * 1. consumeProducer 파라미터에 username 추가 (치명적 버그 수정)
 * 2. _createSendTransport / _createRecvTransport를 useCallback 대신
 *    initSFU 내부 함수로 이동 (클로저 참조 오류 수정)
 * 3. handleSFUMessage의 user_left 처리 — peerId 형식으로 통일
 * 4. initSFU 의존성 배열 정리
 *
 * [2차 수정 — 이번 패치]
 * FIX-1: user_left silent fail — peerId 없을 때 username으로도 Map 검색
 * FIX-2: handleSFUMessage의 track_state — peerId 우선, fallback으로 user_id 키 탐색
 */
import { useRef, useState, useCallback } from 'react';
import * as mediasoupClient from 'mediasoup-client';


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

async function getIceServers() {
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

export function useSFU({ wsRef, roomId }) {
  const pendingProducersRef = useRef([]);
  const deviceRef        = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const producersRef     = useRef(new Map()); // kind → producer
  const consumersRef     = useRef(new Map()); // consumerId → consumer
  const localStreamRef   = useRef(null);

  // 메시지 큐: key = messageType, value = Array<{resolve, reject, timer, filter}>
  const pendingRef = useRef(new Map());

  const [remoteStreams, setRemoteStreams]       = useState(new Map());
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  // ── WebSocket 전송 헬퍼 ─────────────────────────────────────
  const wsSend = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, [wsRef]);

  // ── 메시지 큐 투입 (컴포넌트 onmessage에서 반드시 먼저 호출) ──
  const dispatchSFUMessage = useCallback((data) => {
    // sfu_error → 해당 request 타입의 waiter에게 reject
    if (data.type === 'sfu_error') {
      const targetType = `sfu_${data.request}`;
      const waiters = pendingRef.current.get(targetType);
      if (waiters?.length > 0) {
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
    if (!waiters?.length) return false;

    const idx = waiters.findIndex(w => !w.filter || w.filter(data));
    if (idx === -1) return false;

    const { resolve, timer } = waiters.splice(idx, 1)[0];
    if (waiters.length === 0) pendingRef.current.delete(data.type);
    clearTimeout(timer);
    resolve(data);
    return true;
  }, []);

  // ── 큐 대기 Promise ─────────────────────────────────────────
  const waitForMessage = useCallback((type, timeoutMs = 10000, filter = null) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiters = pendingRef.current.get(type);
        if (waiters) {
          const idx = waiters.findIndex(w => w.resolve === resolve);
          if (idx !== -1) waiters.splice(idx, 1);
          if (waiters.length === 0) pendingRef.current.delete(type);
        }
        reject(new Error(`Timeout waiting for ${type}`));
      }, timeoutMs);

      if (!pendingRef.current.has(type)) pendingRef.current.set(type, []);
      pendingRef.current.get(type).push({ resolve, reject, timer, filter });
    });
  }, []);

  // ── 미디어 초기화 ───────────────────────────────────────────
  const getLocalMedia = useCallback(async ({ video = true, audio = true } = {}) => {
    const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
    localStreamRef.current = stream;
    return stream;
  }, []);

  // ── 원격 스트림 제거 ────────────────────────────────────────
  const removeRemoteStream = useCallback((peerId, kind) => {
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      const existing = next.get(peerId);
      if (!existing) return prev;
      if (kind) {
        // 특정 트랙만 제거
        const consumerId = existing[`${kind}ConsumerId`];
        if (consumerId) {
          const consumer = consumersRef.current.get(consumerId);
          try { consumer?.close(); } catch (_) {}
          consumersRef.current.delete(consumerId);
        }
        delete existing[`${kind}ConsumerId`];
        // 남은 트랙이 없으면 스트림 전체 제거
        const hasAudio = !!existing.audioConsumerId;
        const hasVideo = !!existing.videoConsumerId;
        if (!hasAudio && !hasVideo) {
          next.delete(peerId);
        } else {
          next.set(peerId, { ...existing });
        }
      } else {
        // peerId 전체 제거
        if (existing.audioConsumerId) {
          const c = consumersRef.current.get(existing.audioConsumerId);
          try { c?.close(); } catch (_) {}
          consumersRef.current.delete(existing.audioConsumerId);
        }
        if (existing.videoConsumerId) {
          const c = consumersRef.current.get(existing.videoConsumerId);
          try { c?.close(); } catch (_) {}
          consumersRef.current.delete(existing.videoConsumerId);
        }
        next.delete(peerId);
      }
      return next;
    });
  }, []);

  // ── consumeProducer — username 파라미터 추가 ────────────────
  const consumeProducer = useCallback(async (peerId, producerId, kind, username) => {
    const device    = deviceRef.current;
    const transport = recvTransportRef.current;
    if (!device || !transport) {
      console.warn('consumeProducer: device or recvTransport not ready');
      return;
    }

    try {
      wsSend({
        type: 'sfu_consume',
        producerPeerId: peerId,
        producerId,
        transportId: transport.id,
        rtpCapabilities: device.rtpCapabilities,
      });

      // producerId 필터로 동시 consume 시 응답 뒤섞임 방지
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
          username: username || existing.username || peerId,
          [`${kind}ConsumerId`]: consumer.id,
        });
        return next;
      });

      // SFU는 consumer를 paused=true로 생성하므로 resume 필요
      wsSend({ type: 'sfu_resume_consumer', consumerId: consumer.id });
      await waitForMessage(
        'sfu_consumer_resumed',
        10000,
        (d) => d.consumerId === consumer.id
      );

      consumer.on('trackended', () => removeRemoteStream(peerId, kind));
      consumer.on('transportclose', () => removeRemoteStream(peerId, kind));

      console.log(`✅ Consumed ${kind} from ${username || peerId}`);
    } catch (e) {
      console.error(`consumeProducer error (${kind} from ${peerId}):`, e);
    }
  }, [wsSend, waitForMessage, removeRemoteStream]);

  // ── SFU 초기화 ──────────────────────────────────────────────
  const initSFU = useCallback(async () => {
    setConnectionStatus('connecting');
    try {
      // 1. Router RTP Capabilities
      wsSend({ type: 'sfu_get_rtp_capabilities' });
      const { rtpCapabilities } = await waitForMessage('sfu_rtp_capabilities');

      // 2. mediasoup Device 초기화
      const device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities });
      deviceRef.current = device;

      // 3. SFU 방 참가 (기존 producers 목록 수신)
      wsSend({ type: 'sfu_join' });
      const { producers: existingProducers } = await waitForMessage('sfu_joined');

      const iceServers = await getIceServers();

      // 4. Send Transport 생성 ─────────────────────────────────
      wsSend({ type: 'sfu_create_transport', direction: 'send' });
      const sendParams = await waitForMessage(
        'sfu_transport_created', 10000,
        (d) => d.direction === 'send'
      );

      const sendTransport = device.createSendTransport({
        id: sendParams.id,
        iceParameters: sendParams.iceParameters,
        iceCandidates: sendParams.iceCandidates,
        dtlsParameters: sendParams.dtlsParameters,
        iceServers,
      });

      sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        wsSend({ type: 'sfu_connect_transport', transportId: sendTransport.id, dtlsParameters });
        waitForMessage('sfu_transport_connected', 10000,
          (d) => d.transportId === sendTransport.id
        ).then(callback).catch(errback);
      });

      sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        wsSend({ type: 'sfu_produce', transportId: sendTransport.id, kind, rtpParameters, appData });
        // kind 필터로 audio/video 응답 분리
        waitForMessage('sfu_produced', 10000, (d) => d.kind === kind)
          .then(({ id }) => callback({ id }))
          .catch(errback);
      });

      sendTransport.on('connectionstatechange', (state) => {
        console.log(`Send transport: ${state}`);
        if (state === 'failed') setConnectionStatus('failed');
      });

      sendTransportRef.current = sendTransport;

      // 5. Recv Transport 생성 ─────────────────────────────────
      wsSend({ type: 'sfu_create_transport', direction: 'recv' });
      const recvParams = await waitForMessage(
        'sfu_transport_created', 10000,
        (d) => d.direction === 'recv'
      );

      const recvTransport = device.createRecvTransport({
        id: recvParams.id,
        iceParameters: recvParams.iceParameters,
        iceCandidates: recvParams.iceCandidates,
        dtlsParameters: recvParams.dtlsParameters,
        iceServers,
      });

      recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        wsSend({ type: 'sfu_connect_transport', transportId: recvTransport.id, dtlsParameters });
        waitForMessage('sfu_transport_connected', 10000,
          (d) => d.transportId === recvTransport.id
        ).then(callback).catch(errback);
      });

      recvTransport.on('connectionstatechange', (state) => {
        console.log(`Recv transport: ${state}`);
      });

      recvTransportRef.current = recvTransport;

      // 6. 이미 방에 있는 producers consume
      for (const prod of existingProducers) {
        await consumeProducer(prod.peerId, prod.producerId, prod.kind, prod.username);
      }

      // 큐에 쌓인 new_producer 처리
      const queued = [...pendingProducersRef.current];
      pendingProducersRef.current = [];
      for (const prod of queued) {
        await consumeProducer(prod.peerId, prod.producerId, prod.kind, prod.username);
      }

      setConnectionStatus('connected');
      console.log('✅ SFU initialized');
    } catch (e) {
      setConnectionStatus('failed');
      console.error('SFU init error:', e);
      throw e;
    }
  }, [wsSend, waitForMessage, consumeProducer]);

  // ── 로컬 미디어 송신 시작 ───────────────────────────────────
  const startProducing = useCallback(async (stream) => {
    const transport = sendTransportRef.current;
    if (!transport) throw new Error('Send transport not ready');

    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];

    if (audioTrack) {
      const audioProducer = await transport.produce({ track: audioTrack });
      producersRef.current.set('audio', audioProducer);
      console.log('✅ Audio producing');
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
      console.log('✅ Video producing');
    }
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

  // ── 이벤트 기반 SFU 메시지 처리 ─────────────────────────────
  const handleSFUMessage = useCallback(async (data) => {
    switch (data.type) {
      case 'peer_joined':
        console.log(`Peer joined: ${data.username} (${data.peerId})`);
        break;

      case 'new_producer':
        if (deviceRef.current && recvTransportRef.current) {
          await consumeProducer(data.peerId, data.producerId, data.kind, data.username);
        } else {
          // skip 대신 큐에 저장
          pendingProducersRef.current.push(data);
          console.warn('new_producer queued — SFU not ready yet:', data);
        }
        break;

      case 'track_state': {
        // FIX-2: peerId 우선, 없으면 Map 전체를 순회해 username 또는 user_id로 키 탐색
        setRemoteStreams((prev) => {
          // 백엔드가 peerId를 직접 보내는 경우
          const directKey = data.peerId || (data.user_id ? `user_${data.user_id}` : null);
          const key = directKey && prev.has(directKey)
            ? directKey
            // peerId/user_id 로 못 찾으면 username으로 탐색
            : [...prev.entries()].find(
                ([, v]) => v.username === data.username
              )?.[0];

          if (!key) return prev;

          const next = new Map(prev);
          const existing = next.get(key);
          next.set(key, {
            ...existing,
            isMuted:    data.kind === 'audio' ? !data.enabled : existing.isMuted,
            isVideoOff: data.kind === 'video' ? !data.enabled : existing.isVideoOff,
          });
          return next;
        });
        break;
      }

      // FIX-1: user_left — peerId 없을 때 username으로도 Map 탐색하여 silent fail 방지
      case 'user_left': {
        const directPeerId = data.peerId || (data.user_id ? `user_${data.user_id}` : null);

        setRemoteStreams((prev) => {
          // directPeerId로 직접 확인
          if (directPeerId && prev.has(directPeerId)) {
            removeRemoteStream(directPeerId);
            console.log(`Peer left: ${data.username} (${directPeerId})`);
            return prev; // removeRemoteStream이 내부적으로 setState 호출
          }

          // username으로 fallback 탐색
          const found = [...prev.entries()].find(
            ([, v]) => v.username === data.username
          );
          if (found) {
            const [foundKey] = found;
            removeRemoteStream(foundKey);
            console.log(`Peer left (by username): ${data.username} (${foundKey})`);
          } else {
            console.warn(`user_left: no matching stream for`, data);
          }
          return prev;
        });
        break;
      }

      default:
        break;
    }
  }, [consumeProducer, removeRemoteStream]);

  // ── 정리 ──────────────────────────────────────────────────
  const cleanup = useCallback(() => {
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
    sendTransportRef.current = null;
    recvTransportRef.current = null;
    deviceRef.current = null;
    setRemoteStreams(new Map());
    setConnectionStatus('disconnected');
  }, []);

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
    dispatchSFUMessage,
    cleanup,
  };
}
