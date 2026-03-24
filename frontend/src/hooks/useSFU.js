// frontend/src/hooks/useSFU.js
/**
 * useSFU — mediasoup-client 기반 SFU 훅
 *
 * [수정 내역 — 이번 패치]
 * FIX-B3: consumeProducer 실패 시 3초 후 1회 재시도
 * FIX-B4: user_left 핸들러 — setRemoteStreams 콜백 내 removeRemoteStream() 중첩 호출 제거
 *         (setState 안에서 setState 호출 → 렌더 무한 루프 가능성 수정)
 *         consumer 정리를 setRemoteStreams 콜백 내에서 직접 수행하도록 변경
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

  // ── 메시지 큐 투입 ───────────────────────────────────────────
  const dispatchSFUMessage = useCallback((data) => {
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
      const next     = new Map(prev);
      const existing = next.get(peerId);
      if (!existing) return prev;

      if (kind) {
        const consumerId = existing[`${kind}ConsumerId`];
        if (consumerId) {
          const consumer = consumersRef.current.get(consumerId);
          try { consumer?.close(); } catch (_) {}
          consumersRef.current.delete(consumerId);
        }
        delete existing[`${kind}ConsumerId`];
        const hasAudio = !!existing.audioConsumerId;
        const hasVideo = !!existing.videoConsumerId;
        if (!hasAudio && !hasVideo) {
          next.delete(peerId);
        } else {
          next.set(peerId, { ...existing });
        }
      } else {
        if (existing.audioConsumerId) {
          try { consumersRef.current.get(existing.audioConsumerId)?.close(); } catch (_) {}
          consumersRef.current.delete(existing.audioConsumerId);
        }
        if (existing.videoConsumerId) {
          try { consumersRef.current.get(existing.videoConsumerId)?.close(); } catch (_) {}
          consumersRef.current.delete(existing.videoConsumerId);
        }
        next.delete(peerId);
      }
      return next;
    });
  }, []);

  // ── consumeProducer ─────────────────────────────────────────
  const consumeProducer = useCallback(async (peerId, producerId, kind, username) => {
    const device    = deviceRef.current;
    const transport = recvTransportRef.current;
    if (!device || !transport) {
      console.warn('consumeProducer: device or recvTransport not ready');
      return;
    }

    try {
      wsSend({
        type:            'sfu_consume',
        producerPeerId:  peerId,
        producerId,
        transportId:     transport.id,
        rtpCapabilities: device.rtpCapabilities,
      });

      const consumerData = await waitForMessage(
        'sfu_consumed',
        10000,
        (d) => d.producerId === producerId
      );

      const consumer = await transport.consume({
        id:            consumerData.id,
        producerId:    consumerData.producerId,
        kind:          consumerData.kind,
        rtpParameters: consumerData.rtpParameters,
      });

      consumersRef.current.set(consumer.id, consumer);

      setRemoteStreams((prev) => {
        const next     = new Map(prev);
        const existing = next.get(peerId) || {};
        const stream   = existing.stream || new MediaStream();
        stream.addTrack(consumer.track);
        next.set(peerId, {
          ...existing,
          stream,
          username: username || existing.username || peerId,
          [`${kind}ConsumerId`]: consumer.id,
        });
        return next;
      });

      wsSend({ type: 'sfu_resume_consumer', consumerId: consumer.id });
      await waitForMessage(
        'sfu_consumer_resumed',
        10000,
        (d) => d.consumerId === consumer.id
      );

      consumer.on('trackended',    () => removeRemoteStream(peerId, kind));
      consumer.on('transportclose', () => removeRemoteStream(peerId, kind));

      console.log(`✅ Consumed ${kind} from ${username || peerId}`);
    } catch (e) {
      console.error(`consumeProducer error (${kind} from ${peerId}):`, e);

      // FIX-B3: sfu_error 응답(서버 측 실패) 또는 timeout 시 3초 후 1회 재시도
      // 재시도 전에 transport와 device가 여전히 살아있는지 확인
      setTimeout(() => {
        if (deviceRef.current && recvTransportRef.current) {
          console.log(`🔄 Retrying consumeProducer (${kind} from ${peerId})`);
          consumeProducer(peerId, producerId, kind, username);
        }
      }, 3000);
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

      // 3. SFU 방 참가
      wsSend({ type: 'sfu_join' });
      const { producers: existingProducers } = await waitForMessage('sfu_joined');

      const iceServers = await getIceServers();

      // 4. Send Transport 생성
      wsSend({ type: 'sfu_create_transport', direction: 'send' });
      const sendParams = await waitForMessage(
        'sfu_transport_created', 10000,
        (d) => d.direction === 'send'
      );

      const sendTransport = device.createSendTransport({
        id:             sendParams.id,
        iceParameters:  sendParams.iceParameters,
        iceCandidates:  sendParams.iceCandidates,
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
        waitForMessage('sfu_produced', 10000, (d) => d.kind === kind)
          .then(({ id }) => callback({ id }))
          .catch(errback);
      });

      sendTransport.on('connectionstatechange', (state) => {
        console.log(`Send transport: ${state}`);
        if (state === 'failed') setConnectionStatus('failed');
      });

      sendTransportRef.current = sendTransport;

      // 5. Recv Transport 생성
      wsSend({ type: 'sfu_create_transport', direction: 'recv' });
      const recvParams = await waitForMessage(
        'sfu_transport_created', 10000,
        (d) => d.direction === 'recv'
      );

      const recvTransport = device.createRecvTransport({
        id:             recvParams.id,
        iceParameters:  recvParams.iceParameters,
        iceCandidates:  recvParams.iceCandidates,
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
          pendingProducersRef.current.push(data);
          console.warn('new_producer queued — SFU not ready yet:', data);
        }
        break;

      case 'track_state': {
        setRemoteStreams((prev) => {
          // peerId 우선, 없으면 username으로 fallback 탐색
          const directKey = data.peerId || (data.user_id ? `user_${data.user_id}` : null);
          const key = directKey && prev.has(directKey)
            ? directKey
            : [...prev.entries()].find(([, v]) => v.username === data.username)?.[0];

          if (!key) return prev;

          const next     = new Map(prev);
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

      // FIX-B4: setRemoteStreams 콜백 내에서 consumer 정리를 직접 수행
      //         removeRemoteStream() 호출 제거 → setState 중첩 방지
      case 'user_left': {
        const directPeerId = data.peerId || (data.user_id ? `user_${data.user_id}` : null);

        setRemoteStreams((prev) => {
          // 탐색 — peerId 우선, username fallback
          let key = directPeerId && prev.has(directPeerId)
            ? directPeerId
            : [...prev.entries()].find(([, v]) => v.username === data.username)?.[0];

          if (!key) {
            console.warn('user_left: no matching stream for', data);
            return prev;
          }

          const existing = prev.get(key);

          // consumer 정리 (콜백 내에서 직접 처리 — refs는 외부 클로저라 접근 가능)
          const cleanConsumer = (consumerId) => {
            if (!consumerId) return;
            try { consumersRef.current.get(consumerId)?.close(); } catch (_) {}
            consumersRef.current.delete(consumerId);
          };
          cleanConsumer(existing?.audioConsumerId);
          cleanConsumer(existing?.videoConsumerId);

          const next = new Map(prev);
          next.delete(key);
          console.log(`Peer left: ${data.username} (${key})`);
          return next;
        });
        break;
      }

      default:
        break;
    }
  }, [consumeProducer]);

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