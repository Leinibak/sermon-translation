// frontend/src/hooks/useSFU.js
/**
 * useSFU — mediasoup-client 기반 SFU 훅
 *
 * ★ DIAGNOSTIC BUILD ★
 * 각 단계마다 [SFU-Dxx] 태그 로그 추가.
 * 브라우저 콘솔에서 "SFU-D" 로 필터하면 진단 로그만 확인 가능.
 *
 * 진단 체크포인트 목록:
 *  D01  wsSend — 실제 전송 여부 + WS 상태
 *  D02  dispatchSFUMessage — 수신 메시지 라우팅
 *  D03  waitForMessage — 등록/해소/타임아웃
 *  D10  getLocalMedia — 트랙 종류/수
 *  D20  initSFU 진입
 *  D21  sfu_get_rtp_capabilities 전송 → 응답
 *  D22  Device.load
 *  D23  sfu_join 전송 → existingProducers 목록
 *  D24  getIceServers 결과
 *  D25  sendTransport 생성 → connect/produce 이벤트
 *  D26  recvTransport 생성 → connect 이벤트
 *  D27  earlyQueued 큐 처리
 *  D28  existingProducers 처리 (★중복 감지)
 *  D29  lateQueued 처리
 *  D2Z  initSFU 완료/실패
 *  D30  consumeProducer 진입
 *  D31  sfu_consume 전송 → sfu_consumed 응답
 *  D32  transport.consume() 호출 → 결과
 *  D33  consumer track 정보
 *  D34  setRemoteStreams 업데이트
 *  D35  sfu_resume_consumer → sfu_consumer_resumed
 *  D36  consumeProducer 완료
 *  D3E  consumeProducer 오류 + 재시도
 *  D40  startProducing — audio/video track
 *  D41  sendTransport.produce 완료
 *  D50  handleSFUMessage 수신
 *  D51  new_producer 처리 경로
 *  D60  removeRemoteStream
 *  D70  visibilitychange / focus — 탭 전환 시 트랙 복원  ★NEW★
 */

// ★ [FIX] useEffect 추가 — 탭/창 전환 시 오디오·비디오 트랙 복원에 필요
import { useRef, useState, useCallback, useEffect } from 'react';
import * as mediasoupClient from 'mediasoup-client';

// ── 진단 로거 ────────────────────────────────────────────────
const D = (tag, ...args) => {
  const ts = new Date().toISOString().slice(11, 23); // HH:mm:ss.ms
  console.log(`%c[SFU-${tag}] ${ts}`, 'color:#00bcd4;font-weight:bold', ...args);
};
const DE = (tag, ...args) => {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`%c[SFU-${tag}] ${ts}`, 'color:#f44336;font-weight:bold', ...args);
};
const DW = (tag, ...args) => {
  const ts = new Date().toISOString().slice(11, 23);
  console.warn(`%c[SFU-${tag}] ${ts}`, 'color:#ff9800;font-weight:bold', ...args);
};

// ── ICE 서버 ─────────────────────────────────────────────────
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

// ── 훅 본체 ──────────────────────────────────────────────────
export function useSFU({ wsRef, roomId }) {
  const pendingProducersRef = useRef([]);
  const deviceRef           = useRef(null);
  const sendTransportRef    = useRef(null);
  const recvTransportRef    = useRef(null);
  const producersRef        = useRef(new Map()); // kind → producer
  const consumersRef        = useRef(new Map()); // consumerId → consumer
  const localStreamRef      = useRef(null);

  // ★ 중복 consume 방지: 처리 중이거나 완료된 producerId 추적
  const consumingProducerIds = useRef(new Set());

  // 메시지 큐: key = messageType, value = Array<{resolve, reject, timer, filter}>
  const pendingRef = useRef(new Map());

  // ★ [FIX-D70] 사용자가 명시적으로 mute 했는지 추적
  //   탭 복귀 시 사용자가 끈 마이크/카메라는 자동 복원하지 않기 위한 플래그
  const pausedByUserRef = useRef({ audio: false, video: false });

  const [remoteStreams, setRemoteStreams]        = useState(new Map());
  const [connectionStatus, setConnectionStatus]  = useState('disconnected');

  // ── [D01] WebSocket 전송 헬퍼 ──────────────────────────────
  const wsSend = useCallback((msg) => {
    const ws = wsRef.current;
    const state = ws ? ['CONNECTING','OPEN','CLOSING','CLOSED'][ws.readyState] : 'NO_WS';
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      D('01', `TX → type="${msg.type}"`, msg);
    } else {
      DE('01', `TX FAILED — ws=${state} type="${msg.type}"`);
    }
  }, [wsRef]);

  // ── [D02] 메시지 큐 투입 ────────────────────────────────────
  const dispatchSFUMessage = useCallback((data) => {
    D('02', `RX type="${data.type}"`, data);

    if (data.type === 'sfu_error') {
      const targetType = `sfu_${data.request}`;
      const waiters = pendingRef.current.get(targetType);
      if (waiters?.length > 0) {
        const idx = waiters.findIndex(w => !w.filter || w.filter(data));
        if (idx !== -1) {
          const { reject, timer } = waiters.splice(idx, 1)[0];
          if (waiters.length === 0) pendingRef.current.delete(targetType);
          clearTimeout(timer);
          DE('02', `sfu_error → rejecting waiter for "${targetType}"`, data);
          reject(new Error(data.message || `SFU error: ${data.request}`));
          return true;
        }
      }
      DW('02', `sfu_error received but no waiter matched for "${targetType}"`);
      return false;
    }

    const waiters = pendingRef.current.get(data.type);
    if (!waiters?.length) {
      DW('02', `No waiter for type="${data.type}" — message dropped`);
      return false;
    }

    const idx = waiters.findIndex(w => !w.filter || w.filter(data));
    if (idx === -1) {
      DW('02', `No matching filter for type="${data.type}" — ${waiters.length} waiter(s) exist but none matched`, data);
      return false;
    }

    const { resolve, timer } = waiters.splice(idx, 1)[0];
    if (waiters.length === 0) pendingRef.current.delete(data.type);
    clearTimeout(timer);
    D('02', `Resolved waiter for type="${data.type}"`);
    resolve(data);
    return true;
  }, []);

  // ── [D03] 큐 대기 Promise ────────────────────────────────────
  const waitForMessage = useCallback((type, timeoutMs = 10000, filter = null) => {
    D('03', `WAIT registered — type="${type}" timeout=${timeoutMs}ms`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiters = pendingRef.current.get(type);
        if (waiters) {
          const idx = waiters.findIndex(w => w.resolve === resolve);
          if (idx !== -1) waiters.splice(idx, 1);
          if (waiters.length === 0) pendingRef.current.delete(type);
        }
        // 현재 pendingRef 전체 상태 출력 (타임아웃 시점)
        const remaining = {};
        pendingRef.current.forEach((v, k) => { remaining[k] = v.length; });
        DE('03', `TIMEOUT — type="${type}" after ${timeoutMs}ms. Remaining waiters:`, remaining);
        reject(new Error(`Timeout waiting for ${type}`));
      }, timeoutMs);

      if (!pendingRef.current.has(type)) pendingRef.current.set(type, []);
      pendingRef.current.get(type).push({ resolve, reject, timer, filter });
    });
  }, []);

  // ── [D10] 미디어 초기화 ─────────────────────────────────────
  const getLocalMedia = useCallback(async ({ video = true, audio = true } = {}) => {
    D('10', `getUserMedia — video=${video} audio=${audio}`);
    const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
    const vt = stream.getVideoTracks();
    const at = stream.getAudioTracks();
    D('10', `Local media OK — videoTracks=${vt.length} audioTracks=${at.length}`,
      vt.map(t => `${t.label} enabled=${t.enabled}`),
      at.map(t => `${t.label} enabled=${t.enabled}`)
    );
    localStreamRef.current = stream;
    return stream;
  }, []);

  // ── [D60] 원격 스트림 제거 ──────────────────────────────────
  const removeRemoteStream = useCallback((peerId, kind) => {
    D('60', `removeRemoteStream peerId="${peerId}" kind="${kind || 'ALL'}"`);
    setRemoteStreams((prev) => {
      const next     = new Map(prev);
      const existing = next.get(peerId);
      if (!existing) {
        DW('60', `removeRemoteStream: peerId="${peerId}" not found in remoteStreams`);
        return prev;
      }

      if (kind) {
        const consumerId = existing[`${kind}ConsumerId`];
        if (consumerId) {
          const consumer = consumersRef.current.get(consumerId);
          try { consumer?.close(); } catch (_) {}
          consumersRef.current.delete(consumerId);
          consumingProducerIds.current.delete(consumerId);
        }
        delete existing[`${kind}ConsumerId`];
        const hasAudio = !!existing.audioConsumerId;
        const hasVideo = !!existing.videoConsumerId;
        if (!hasAudio && !hasVideo) {
          next.delete(peerId);
          D('60', `Removed all streams for peerId="${peerId}"`);
        } else {
          next.set(peerId, { ...existing });
          D('60', `Removed ${kind} stream for peerId="${peerId}", remaining: audio=${hasAudio} video=${hasVideo}`);
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
        D('60', `Removed ALL streams for peerId="${peerId}"`);
      }
      return next;
    });
  }, []);

  // ── [D30~D3E] consumeProducer ────────────────────────────────
  const consumeProducer = useCallback(async (peerId, producerId, kind, username) => {
    D('30', `consumeProducer ENTER — peerId="${peerId}" producerId="${producerId}" kind="${kind}" username="${username}"`);

    const device    = deviceRef.current;
    const transport = recvTransportRef.current;

    if (!device || !transport) {
      DW('30', `device=${!!device} recvTransport=${!!transport} — QUEUING producerId="${producerId}"`);
      pendingProducersRef.current.push({ peerId, producerId, kind, username });
      D('30', `Queue size now: ${pendingProducersRef.current.length}`);
      return;
    }

    // ★ [D28] 중복 consume 방지
    if (consumingProducerIds.current.has(producerId)) {
      DW('30', `★ DUPLICATE SKIP — producerId="${producerId}" already consuming/consumed`);
      return;
    }
    consumingProducerIds.current.add(producerId);
    D('30', `Marked producerId="${producerId}" as consuming. Total tracked: ${consumingProducerIds.current.size}`);

    try {
      // [D31] sfu_consume 전송
      const consumePayload = {
        type:            'sfu_consume',
        producerPeerId:  peerId,
        producerId,
        transportId:     transport.id,
        rtpCapabilities: device.rtpCapabilities,
      };
      D('31', `TX sfu_consume — transportId="${transport.id}"`, consumePayload);
      wsSend(consumePayload);

      D('31', `Waiting for sfu_consumed (producerId="${producerId}") ...`);
      const consumerData = await waitForMessage(
        'sfu_consumed',
        15000,
        (d) => {
          const serverProdId = d.producerId || d.producer_id;
          const matched = serverProdId === producerId;
          if (!matched) {
            DW('31', `sfu_consumed filter MISS — server="${serverProdId}" expected="${producerId}"`);
          }
          return matched;
        }
      );
      D('31', `sfu_consumed received:`, consumerData);

      // [D32] transport.consume
      const consumeArgs = {
        id:            consumerData.id,
        producerId:    consumerData.producerId || consumerData.producer_id || producerId,
        kind:          consumerData.kind || kind,
        rtpParameters: consumerData.rtpParameters || consumerData.rtp_parameters,
      };
      D('32', `transport.consume() — id="${consumeArgs.id}" kind="${consumeArgs.kind}"`);
      const consumer = await transport.consume(consumeArgs);
      D('32', `transport.consume() OK — consumerId="${consumer.id}"`);

      // [D33] track 정보
      const track = consumer.track;
      D('33', `Consumer track — kind="${track.kind}" id="${track.id}" readyState="${track.readyState}" enabled=${track.enabled} muted=${track.muted}`);

      consumersRef.current.set(consumer.id, consumer);

      // [D34] setRemoteStreams
      D('34', `setRemoteStreams UPDATE — peerId="${peerId}" kind="${kind}"`);
      setRemoteStreams((prev) => {
        const next     = new Map(prev);
        const existing = next.get(peerId) || {};
        const stream   = existing.stream || new MediaStream();

        D('34', `Stream before addTrack — id="${stream.id}" tracks=${stream.getTracks().length}`);
        stream.addTrack(track);
        D('34', `Stream after addTrack  — tracks=${stream.getTracks().length}`, stream.getTracks().map(t => `${t.kind}:${t.readyState}`));

        next.set(peerId, {
          ...existing,
          stream,
          username: username || existing.username || peerId,
          [`${kind}ConsumerId`]: consumer.id,
        });
        D('34', `remoteStreams Map size after update: ${next.size}`);
        return next;
      });

      // [D35] resume
      D('35', `TX sfu_resume_consumer consumerId="${consumer.id}"`);
      wsSend({ type: 'sfu_resume_consumer', consumerId: consumer.id });
      await waitForMessage(
        'sfu_consumer_resumed',
        10000,
        (d) => d.consumerId === consumer.id
      );
      D('35', `Consumer RESUMED — consumerId="${consumer.id}"`);

      consumer.on('trackended',     () => { DW('33', `trackended — peerId="${peerId}" kind="${kind}"`); removeRemoteStream(peerId, kind); });
      consumer.on('transportclose', () => { DW('33', `transportclose — peerId="${peerId}" kind="${kind}"`); removeRemoteStream(peerId, kind); });

      D('36', `✅ consumeProducer DONE — ${kind} from "${username || peerId}" producerId="${producerId}"`);

    } catch (e) {
      // 실패 시 중복 방지 Set에서 제거 → 재시도 허용
      consumingProducerIds.current.delete(producerId);
      DE('3E', `consumeProducer FAILED — kind="${kind}" peerId="${peerId}" producerId="${producerId}"`, e.message);
      DE('3E', `Stack:`, e.stack);

      // 현재 transport/device 상태 덤프
      const tp = recvTransportRef.current;
      DE('3E', `recvTransport state — exists=${!!tp} connectionState="${tp?.connectionState}" closed=${tp?.closed}`);

      setTimeout(() => {
        if (deviceRef.current && recvTransportRef.current) {
          DW('3E', `🔄 RETRY consumeProducer — ${kind} from "${peerId}" producerId="${producerId}"`);
          consumeProducer(peerId, producerId, kind, username);
        } else {
          DE('3E', `RETRY aborted — device=${!!deviceRef.current} recvTransport=${!!recvTransportRef.current}`);
        }
      }, 3000);
    }
  }, [wsSend, waitForMessage, removeRemoteStream]);

  // ── [D20~D2Z] SFU 초기화 ────────────────────────────────────
  const initSFU = useCallback(async () => {
    D('20', `initSFU START — roomId="${roomId}"`);
    setConnectionStatus('connecting');

    try {
      // [D21] RTP Capabilities
      D('21', 'TX sfu_get_rtp_capabilities');
      wsSend({ type: 'sfu_get_rtp_capabilities' });
      const { rtpCapabilities } = await waitForMessage('sfu_rtp_capabilities');
      D('21', `rtpCapabilities received — codecs=${rtpCapabilities?.codecs?.length}`);

      // [D22] Device.load
      D('22', 'Device.load START');
      const device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities });
      deviceRef.current = device;
      D('22', `Device.load OK — canProduce(video)=${device.canProduce('video')} canProduce(audio)=${device.canProduce('audio')}`);

      // [D23] sfu_join
      D('23', 'TX sfu_join');
      wsSend({ type: 'sfu_join' });
      const { producers: existingProducers } = await waitForMessage('sfu_joined');
      D('23', `sfu_joined — existingProducers count=${existingProducers?.length}`, existingProducers);
      if (existingProducers?.length === 0) {
        DW('23', 'existingProducers is EMPTY — 상대방이 아직 produce 안 했거나 join이 늦음');
      }

      // [D24] ICE Servers
      const iceServers = await getIceServers();
      D('24', `ICE servers: ${iceServers.length} entries`, iceServers.map(s => s.urls));

      // [D25] Send Transport
      D('25', 'TX sfu_create_transport direction=send');
      wsSend({ type: 'sfu_create_transport', direction: 'send' });
      const sendParams = await waitForMessage(
        'sfu_transport_created', 10000,
        (d) => {
          D('25', `sfu_transport_created filter check — direction="${d.direction}"`);
          return !d.direction || d.direction === 'send';
        }
      );
      D('25', `sendTransport params received — id="${sendParams.id}" iceCandidates=${sendParams.iceCandidates?.length}`);

      const sendTransport = device.createSendTransport({
        id:             sendParams.id,
        iceParameters:  sendParams.iceParameters,
        iceCandidates:  sendParams.iceCandidates,
        dtlsParameters: sendParams.dtlsParameters,
        iceServers,
      });

      sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        D('25', `sendTransport "connect" event fired — transportId="${sendTransport.id}"`);
        wsSend({ type: 'sfu_connect_transport', transportId: sendTransport.id, dtlsParameters });
        waitForMessage('sfu_transport_connected', 10000,
          (d) => d.transportId === sendTransport.id
        )
          .then(() => { D('25', `sendTransport DTLS connected`); callback(); })
          .catch((e) => { DE('25', `sendTransport DTLS connect FAILED`, e.message); errback(e); });
      });

      sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        D('25', `sendTransport "produce" event — kind="${kind}"`);
        wsSend({ type: 'sfu_produce', transportId: sendTransport.id, kind, rtpParameters, appData });
        waitForMessage('sfu_produced', 10000, (d) => d.kind === kind)
          .then(({ id }) => { D('25', `sfu_produced OK — kind="${kind}" id="${id}"`); callback({ id }); })
          .catch((e) => { DE('25', `sfu_produce FAILED kind="${kind}"`, e.message); errback(e); });
      });

      sendTransport.on('connectionstatechange', (state) => {
        D('25', `sendTransport connectionstatechange → "${state}"`);
        if (state === 'failed') {
          DE('25', '★ sendTransport ICE FAILED — 미디어 송신 불가');
          setConnectionStatus('failed');
        }
        if (state === 'connected') D('25', '★ sendTransport ICE CONNECTED ✅');
      });

      sendTransportRef.current = sendTransport;
      D('25', `sendTransportRef set — id="${sendTransport.id}"`);

      // [D26] Recv Transport
      D('26', 'TX sfu_create_transport direction=recv');
      wsSend({ type: 'sfu_create_transport', direction: 'recv' });
      const recvParams = await waitForMessage(
        'sfu_transport_created', 10000,
        (d) => {
          D('26', `sfu_transport_created filter check — direction="${d.direction}"`);
          return !d.direction || d.direction === 'recv';
        }
      );
      D('26', `recvTransport params received — id="${recvParams.id}" iceCandidates=${recvParams.iceCandidates?.length}`);

      const recvTransport = device.createRecvTransport({
        id:             recvParams.id,
        iceParameters:  recvParams.iceParameters,
        iceCandidates:  recvParams.iceCandidates,
        dtlsParameters: recvParams.dtlsParameters,
        iceServers,
      });

      recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        D('26', `recvTransport "connect" event fired — transportId="${recvTransport.id}"`);
        wsSend({ type: 'sfu_connect_transport', transportId: recvTransport.id, dtlsParameters });
        waitForMessage('sfu_transport_connected', 10000,
          (d) => d.transportId === recvTransport.id
        )
          .then(() => { D('26', `recvTransport DTLS connected ✅`); callback(); })
          .catch((e) => { DE('26', `★ recvTransport DTLS connect FAILED — 상대방 영상 수신 불가`, e.message); errback(e); });
      });

      recvTransport.on('connectionstatechange', (state) => {
        D('26', `recvTransport connectionstatechange → "${state}"`);
        if (state === 'failed')  DE('26', '★ recvTransport ICE FAILED — 상대방 영상 수신 불가');
        if (state === 'connected') D('26', '★ recvTransport ICE CONNECTED ✅');
      });

      recvTransportRef.current = recvTransport;
      D('26', `recvTransportRef set — id="${recvTransport.id}"`);

      // [D27] earlyQueued 처리
      const earlyQueued = [...pendingProducersRef.current];
      pendingProducersRef.current = [];
      D('27', `earlyQueued count=${earlyQueued.length}`, earlyQueued.map(p => `${p.kind}:${p.producerId}`));

      for (const prod of earlyQueued) {
        D('27', `Processing earlyQueued — ${prod.kind} peerId="${prod.peerId}" producerId="${prod.producerId}"`);
        await consumeProducer(prod.peerId, prod.producerId, prod.kind, prod.username);
      }

      // [D28] existingProducers 처리 + 중복 경고
      D('28', `Processing existingProducers count=${existingProducers?.length}`);
      for (const prod of (existingProducers || [])) {
        const pid = prod.peerId || prod.peer_id;
        const prodId = prod.producerId || prod.producer_id;

        // ★ 중복 감지: earlyQueued에서 이미 처리됐는지 확인
        if (consumingProducerIds.current.has(prodId)) {
          DW('28', `★ DUPLICATE DETECTED — producerId="${prodId}" already in earlyQueued. SKIP.`);
          continue;
        }

        D('28', `Processing existingProducer — kind="${prod.kind}" peerId="${pid}" producerId="${prodId}"`);
        await consumeProducer(pid, prodId, prod.kind, prod.username);
      }

      // [D29] lateQueued 처리
      const lateQueued = [...pendingProducersRef.current];
      pendingProducersRef.current = [];
      D('29', `lateQueued count=${lateQueued.length}`, lateQueued.map(p => `${p.kind}:${p.producerId}`));

      for (const prod of lateQueued) {
        D('29', `Processing lateQueued — ${prod.kind} peerId="${prod.peerId}" producerId="${prod.producerId}"`);
        await consumeProducer(prod.peerId, prod.producerId, prod.kind, prod.username);
      }

      setConnectionStatus('connected');
      D('2Z', `✅ initSFU COMPLETE — remoteStreams=${remoteStreams.size} consumers=${consumersRef.current.size}`);

    } catch (e) {
      setConnectionStatus('failed');
      DE('2Z', `★ initSFU FAILED`, e.message);
      DE('2Z', `Stack:`, e.stack);
      throw e;
    }
  }, [wsSend, waitForMessage, consumeProducer, remoteStreams.size, roomId]);

  // ── [D40~D41] 로컬 미디어 송신 시작 ─────────────────────────
  const startProducing = useCallback(async (stream) => {
    const transport = sendTransportRef.current;
    D('40', `startProducing — sendTransport exists=${!!transport}`);
    if (!transport) throw new Error('Send transport not ready');

    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];
    D('40', `Tracks — audioTrack=${audioTrack ? `"${audioTrack.label}" enabled=${audioTrack.enabled}` : 'NONE'}`);
    D('40', `Tracks — videoTrack=${videoTrack ? `"${videoTrack.label}" enabled=${videoTrack.enabled}` : 'NONE'}`);

    if (audioTrack) {
      D('41', 'transport.produce audio START');
      const audioProducer = await transport.produce({ track: audioTrack });
      producersRef.current.set('audio', audioProducer);
      D('41', `audio producer OK — id="${audioProducer.id}" paused=${audioProducer.paused}`);
    } else {
      DW('41', 'No audioTrack — audio will NOT be produced');
    }

    if (videoTrack) {
      D('41', 'transport.produce video START');
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
      D('41', `video producer OK — id="${videoProducer.id}" paused=${videoProducer.paused}`);
    } else {
      DW('41', 'No videoTrack — video will NOT be produced');
    }
  }, []);

  // ── Mute / Unmute ───────────────────────────────────────────
  // ★ [FIX-D70] pausedByUserRef 플래그를 함께 관리
  //   탭 복귀 시 사용자가 직접 끈 트랙은 복원하지 않기 위해 의도를 기록
  const muteAudio = useCallback(() => {
    pausedByUserRef.current.audio = true;  // ★ 사용자 의도: 명시적 mute
    const producer = producersRef.current.get('audio');
    if (!producer) return;
    producer.pause();
    wsSend({ type: 'sfu_producer_pause', producerId: producer.id, kind: 'audio' });
  }, [wsSend]);

  const unmuteAudio = useCallback(() => {
    pausedByUserRef.current.audio = false; // ★ 사용자 의도: 명시적 unmute
    const producer = producersRef.current.get('audio');
    if (!producer) return;
    producer.resume();
    wsSend({ type: 'sfu_producer_resume', producerId: producer.id, kind: 'audio' });
  }, [wsSend]);

  const muteVideo = useCallback(() => {
    pausedByUserRef.current.video = true;  // ★ 사용자 의도: 명시적 mute
    const producer = producersRef.current.get('video');
    if (!producer) return;
    producer.pause();
    wsSend({ type: 'sfu_producer_pause', producerId: producer.id, kind: 'video' });
  }, [wsSend]);

  const unmuteVideo = useCallback(() => {
    pausedByUserRef.current.video = false; // ★ 사용자 의도: 명시적 unmute
    const producer = producersRef.current.get('video');
    if (!producer) return;
    producer.resume();
    wsSend({ type: 'sfu_producer_resume', producerId: producer.id, kind: 'video' });
  }, [wsSend]);

  // ── [D70] 탭 전환 / 창 전환 시 오디오·비디오 트랙 복원 ★NEW★ ──
  //
  //  문제:
  //    브라우저는 탭이 비활성화(hidden)되거나 다른 창으로 포커스가
  //    이동할 때, MediaStream 오디오 트랙의 enabled 속성을 false로
  //    강제 변경하거나 mediasoup producer를 자동으로 pause 상태로
  //    만들어 소리 전송이 끊기는 현상이 발생한다.
  //
  //  해결:
  //    (1) visibilitychange 이벤트: 탭이 다시 visible 될 때
  //    (2) window focus 이벤트: 다른 창에서 돌아올 때
  //    위 두 시점에서 localStream 트랙 enabled 강제 복원 +
  //    mediasoup producer paused 상태이면 즉시 resume 처리.
  //    단, 사용자가 명시적으로 끈 경우(pausedByUserRef)는 복원 안 함.
  //
  const restoreTracksOnVisible = useCallback(() => {
    // (1) localStream 오디오·비디오 트랙 enabled 강제 복원
    const stream = localStreamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach((t) => {
        if (!pausedByUserRef.current.audio) {
          if (!t.enabled) {
            t.enabled = true;
            D('70', `restored audioTrack.enabled=true id=${t.id.slice(0, 8)}`);
          }
        }
      });
      stream.getVideoTracks().forEach((t) => {
        if (!pausedByUserRef.current.video) {
          if (!t.enabled) {
            t.enabled = true;
            D('70', `restored videoTrack.enabled=true id=${t.id.slice(0, 8)}`);
          }
        }
      });
    }

    // (2) mediasoup audio producer paused 복원
    const audioProducer = producersRef.current.get('audio');
    if (
      audioProducer &&
      !audioProducer.closed &&
      audioProducer.paused &&
      !pausedByUserRef.current.audio
    ) {
      audioProducer.resume();
      wsSend({ type: 'sfu_producer_resume', producerId: audioProducer.id, kind: 'audio' });
      D('70', `restored audio producer resumed id=${audioProducer.id.slice(0, 8)}`);
    }

    // (3) mediasoup video producer paused 복원
    const videoProducer = producersRef.current.get('video');
    if (
      videoProducer &&
      !videoProducer.closed &&
      videoProducer.paused &&
      !pausedByUserRef.current.video
    ) {
      videoProducer.resume();
      wsSend({ type: 'sfu_producer_resume', producerId: videoProducer.id, kind: 'video' });
      D('70', `restored video producer resumed id=${videoProducer.id.slice(0, 8)}`);
    }
  }, [wsSend]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // 탭이 다시 보일 때 (다른 탭에서 돌아올 때)
    const handleVisibilityChange = () => {
      D('70', `visibilitychange — hidden=${document.hidden}`);
      if (!document.hidden) {
        restoreTracksOnVisible();
      }
    };

    // 다른 브라우저 창/앱에서 이 창으로 포커스가 돌아올 때
    const handleWindowFocus = () => {
      D('70', 'window focus — restoring tracks');
      restoreTracksOnVisible();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    D('70', 'visibilitychange + window focus listeners registered');

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      D('70', 'visibilitychange + window focus listeners removed');
    };
  }, [restoreTracksOnVisible]);

  // ── [D50~D51] 이벤트 기반 SFU 메시지 처리 ────────────────────
  const handleSFUMessage = useCallback(async (data) => {
    D('50', `handleSFUMessage type="${data.type}"`, data);

    switch (data.type) {
      case 'peer_joined':
        D('50', `peer_joined — username="${data.username}" peerId="${data.peerId}"`);
        D('50', `(peer_joined 자체는 consume을 트리거하지 않음 — new_producer 이벤트 대기)`);
        break;

      case 'new_producer':
        D('51', `new_producer — peerId="${data.peerId}" producerId="${data.producerId}" kind="${data.kind}" username="${data.username}"`);
        D('51', `device=${!!deviceRef.current} recvTransport=${!!recvTransportRef.current}`);
        if (deviceRef.current && recvTransportRef.current) {
          D('51', `→ consumeProducer 즉시 호출`);
          await consumeProducer(data.peerId, data.producerId, data.kind, data.username);
        } else {
          DW('51', `→ QUEUED (recvTransport 미준비) — queue size will be: ${pendingProducersRef.current.length + 1}`);
          pendingProducersRef.current.push(data);
        }
        break;

      case 'track_state': {
        D('50', `track_state — peerId="${data.peerId}" kind="${data.kind}" enabled=${data.enabled}`);
        setRemoteStreams((prev) => {
          const directKey = data.peerId || (data.user_id ? `user_${data.user_id}` : null);
          const key = directKey && prev.has(directKey)
            ? directKey
            : [...prev.entries()].find(([, v]) => v.username === data.username)?.[0];

          if (!key) {
            DW('50', `track_state: no matching remoteStream for peerId="${data.peerId}" username="${data.username}"`);
            return prev;
          }
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
        D('50', `user_left — username="${data.username}" peerId="${data.peerId}"`);
        const directPeerId = data.peerId || (data.user_id ? `user_${data.user_id}` : null);

        setRemoteStreams((prev) => {
          let key = directPeerId && prev.has(directPeerId)
            ? directPeerId
            : [...prev.entries()].find(([, v]) => v.username === data.username)?.[0];

          if (!key) {
            DW('50', `user_left: no matching stream for`, data);
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
          D('50', `user_left: removed stream for "${key}" — remaining remoteStreams: ${next.size}`);
          return next;
        });
        break;
      }

      default:
        DW('50', `handleSFUMessage: unhandled type="${data.type}"`);
        break;
    }
  }, [consumeProducer]);

  // ── 정리 ────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    D('20', 'cleanup called');
    pendingRef.current.forEach((waiters) => {
      waiters.forEach(({ reject, timer }) => {
        clearTimeout(timer);
        reject(new Error('SFU cleanup'));
      });
    });
    pendingRef.current.clear();

    // localStreamRef.current?.getTracks().forEach((t) => t.stop());
    producersRef.current.forEach((p) => { try { p.close(); } catch (_) {} });
    consumersRef.current.forEach((c) => { try { c.close(); } catch (_) {} });
    sendTransportRef.current?.close();
    recvTransportRef.current?.close();
    producersRef.current.clear();
    consumersRef.current.clear();
    consumingProducerIds.current.clear();
    sendTransportRef.current = null;
    recvTransportRef.current = null;
    deviceRef.current = null;
    pendingProducersRef.current = [];
    pausedByUserRef.current = { audio: false, video: false }; // ★ [FIX] cleanup 시 플래그 초기화
    setRemoteStreams(new Map());
    setConnectionStatus('disconnected');
    D('20', 'cleanup done');
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
    producersRef,
    cleanup,
  };
}