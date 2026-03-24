// frontend/src/hooks/useSFU.js
/**
 * useSFU — mediasoup-client 기반 SFU 훅
 *
 * [수정 내역 — BUG FIX]
 * FIX-C1: initSFU — recvTransport 생성 완료 후 new_producer 큐 처리
 *          기존에는 send/recv 두 transport가 모두 생성되고 나서야 큐를 처리했는데,
 *          send transport 생성 중 new_producer가 오면 recvTransport가 null이라 consume 불가
 *          → recvTransport 생성 직후 바로 큐 처리
 * FIX-C2: consumeProducer — waitForMessage 필터 방어 코드 강화
 *          d.producerId가 undefined이면 어떤 producerId와도 일치하지 않아 timeout
 *          → producerId OR producer_id 양쪽 모두 확인
 * FIX-C3: initSFU — sfu_transport_created 응답에 direction 없을 때 대비
 *          서버가 direction을 안 보내도 send를 먼저, recv를 나중에 요청하므로
 *          순서 기반 fallback 추가
 * FIX-C4: new_producer 이벤트에서 username이 없을 때 DB peerId로 조회하지 않고
 *          peerId 자체를 username으로 사용 (서버 FIX-S3으로 해결되지만 방어 코드 유지)
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
      console.warn('consumeProducer: device or recvTransport not ready, queuing...');
      // FIX-C1: recvTransport 미준비 시 큐에 적재
      pendingProducersRef.current.push({ peerId, producerId, kind, username });
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

      // FIX-C2: producerId 필터 — camelCase/snake_case 양쪽 대응
      const consumerData = await waitForMessage(
        'sfu_consumed',
        15000, // 타임아웃 10초→15초로 증가
        (d) => {
          const serverProdId = d.producerId || d.producer_id;
          return serverProdId === producerId;
        }
      );

      const consumer = await transport.consume({
        id:            consumerData.id,
        producerId:    consumerData.producerId || consumerData.producer_id || producerId,
        kind:          consumerData.kind || kind,
        rtpParameters: consumerData.rtpParameters || consumerData.rtp_parameters,
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
          // FIX-C4: username 항상 포함 (서버 FIX-S2/S3으로 전달되지만 방어 코드)
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

      // 재시도: transport와 device가 여전히 살아있는지 확인 후 3초 후 1회 재시도
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
      // FIX-C3: direction 필터 — 서버가 direction을 안 보낼 경우 첫 번째 응답 수락
      const sendParams = await waitForMessage(
        'sfu_transport_created', 10000,
        (d) => !d.direction || d.direction === 'send'
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
      // FIX-C3: direction 필터 — send와 구분
      const recvParams = await waitForMessage(
        'sfu_transport_created', 10000,
        (d) => !d.direction || d.direction === 'recv'
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

      // FIX-C1: recvTransport 생성 완료 직후 큐 먼저 처리 (기존 producers consume 전에)
      // 이렇게 해야 recvTransport 생성 중에 도착한 new_producer를 놓치지 않음
      const earlyQueued = [...pendingProducersRef.current];
      pendingProducersRef.current = [];
      console.log(`📦 Early queued producers: ${earlyQueued.length}`);
      for (const prod of earlyQueued) {
        await consumeProducer(prod.peerId, prod.producerId, prod.kind, prod.username);
      }

      // 6. 이미 방에 있는 producers consume
      console.log(`📦 Existing producers: ${existingProducers.length}`);
      for (const prod of existingProducers) {
        await consumeProducer(prod.peerId, prod.producerId, prod.kind, prod.username);
      }

      // 큐에 쌓인 new_producer 처리 (initSFU 완료 후 도착한 것)
      const lateQueued = [...pendingProducersRef.current];
      pendingProducersRef.current = [];
      for (const prod of lateQueued) {
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
          // FIX-C1: recvTransport 미준비 시 큐에 적재
          pendingProducersRef.current.push(data);
          console.warn('new_producer queued — recvTransport not ready yet:', data);
        }
        break;

      case 'track_state': {
        setRemoteStreams((prev) => {
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

      case 'user_left': {
        const directPeerId = data.peerId || (data.user_id ? `user_${data.user_id}` : null);

        setRemoteStreams((prev) => {
          let key = directPeerId && prev.has(directPeerId)
            ? directPeerId
            : [...prev.entries()].find(([, v]) => v.username === data.username)?.[0];

          if (!key) {
            console.warn('user_left: no matching stream for', data);
            return prev;
          }

          const existing = prev.get(key);

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
    pendingProducersRef.current = [];
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
    producersRef,  // useScreenShare에서 사용
    cleanup,
  };
}