// frontend/src/hooks/useActiveSpeaker.js
/**
 * useActiveSpeaker
 *
 * Web Audio API 기반 Active Speaker 감지 훅.
 * 로컬/원격 오디오 스트림의 볼륨을 실시간 측정하여 현재 발언자를 결정한다.
 *
 * 반환값:
 *   activeSpeakerId  — 현재 발언자 peerId (null = 아무도 말 안 함)
 *   pinnedPeerId     — 수동 고정된 peerId (null = 고정 없음)
 *   volumeLevels     — Map<peerId, 0‥1> 볼륨 레벨 (UI 렌더링용)
 *   pinPeer(peerId)  — 특정 peer 고정
 *   unpinPeer()      — 고정 해제
 *   isSpeaking(pid)  — peerId가 현재 발언 중인지 boolean
 */

import { useRef, useState, useEffect, useCallback } from 'react';

// ── 상수 ──────────────────────────────────────────────────────
const VOLUME_THRESHOLD_DB   = -50;   // dB: 이 값 이상이면 "말하는 중"으로 판단
const SPEAKING_DEBOUNCE_MS  = 400;   // ms: 발언자 전환 최소 지속 시간
const SILENCE_TIMEOUT_MS    = 2500;  // ms: 침묵 지속 후 activeSpeaker를 null로 초기화
const MEASURE_INTERVAL_MS   = 80;    // ms: 볼륨 측정 주기
const FFT_SIZE              = 512;   // AnalyserNode FFT 크기
const LOCAL_PEER_ID         = '__local__'; // 로컬 스트림 식별자

// ── 헬퍼: AudioContext 생성 (Safari 크로스 브라우저) ────────────
function createAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    return new Ctx();
  } catch {
    return null;
  }
}

// ── 헬퍼: RMS → dB 변환 ─────────────────────────────────────
function byteTimeDomainToDb(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const val = (buffer[i] - 128) / 128; // -1 ~ 1
    sum += val * val;
  }
  const rms = Math.sqrt(sum / buffer.length);
  if (rms === 0) return -Infinity;
  return 20 * Math.log10(rms);
}

// ── 헬퍼: dB → 0~1 정규화 (UI용) ───────────────────────────
function dbToNormalized(db, minDb = -70, maxDb = -10) {
  if (!isFinite(db)) return 0;
  return Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
}

// ══════════════════════════════════════════════════════════════
export function useActiveSpeaker({ localStreamRef, remoteStreams, isMicOn }) {
  // ── State ──────────────────────────────────────────────────
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  const [pinnedPeerId,    setPinnedPeerId]    = useState(null);
  const [volumeLevels,    setVolumeLevels]    = useState(new Map());

  // ── Refs (렌더 사이클과 무관한 내부 상태) ──────────────────
  // Map<peerId, { ctx, analyser, source, buffer }>
  const audioNodesRef        = useRef(new Map());
  const intervalRef          = useRef(null);
  const speakerCandidateRef  = useRef(null);   // { peerId, since }
  const silenceTimerRef      = useRef(null);
  const lastSpeakerRef       = useRef(null);   // 마지막으로 말한 peerId

  // ── 오디오 노드 생성 ────────────────────────────────────────
  const attachStream = useCallback((peerId, stream) => {
    if (!stream) return;
    if (audioNodesRef.current.has(peerId)) return;

    // 오디오 트랙이 없으면 skip
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const ctx = createAudioContext();
    if (!ctx) return;

    // iOS/Safari: suspended 상태면 resume 시도
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    try {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.5;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      // 스피커로 연결하지 않음 (로컬 에코 방지, 원격은 별도 <video>에서 재생)

      const buffer = new Uint8Array(analyser.frequencyBinCount);

      audioNodesRef.current.set(peerId, { ctx, analyser, source, buffer });
    } catch (err) {
      console.warn(`[useActiveSpeaker] attachStream failed for ${peerId}:`, err);
      try { ctx.close(); } catch {}
    }
  }, []);

  // ── 오디오 노드 해제 ────────────────────────────────────────
  const detachStream = useCallback((peerId) => {
    const node = audioNodesRef.current.get(peerId);
    if (!node) return;
    try {
      node.source.disconnect();
      node.ctx.close();
    } catch {}
    audioNodesRef.current.delete(peerId);
  }, []);

  // ── remoteStreams 변경 감지 → 노드 생성/해제 ───────────────
  useEffect(() => {
    const currentPeerIds = new Set(audioNodesRef.current.keys());
    const newPeerIds     = new Set(remoteStreams.keys());
    newPeerIds.add(LOCAL_PEER_ID); // 로컬도 포함

    // 새로 추가된 피어
    for (const [peerId, streamData] of remoteStreams) {
      if (streamData.stream && !currentPeerIds.has(peerId)) {
        attachStream(peerId, streamData.stream);
      }
    }

    // 로컬 스트림 attach (마이크가 켜져 있을 때만)
    if (localStreamRef.current && !currentPeerIds.has(LOCAL_PEER_ID)) {
      attachStream(LOCAL_PEER_ID, localStreamRef.current);
    }

    // 퇴장한 피어 cleanup
    for (const peerId of currentPeerIds) {
      if (peerId === LOCAL_PEER_ID) continue;
      if (!newPeerIds.has(peerId)) {
        detachStream(peerId);
        // 퇴장한 피어가 activeSpeaker였다면 초기화
        setActiveSpeakerId(prev => prev === peerId ? null : prev);
        setPinnedPeerId(prev => prev === peerId ? null : prev);
      }
    }
  }, [remoteStreams, localStreamRef, attachStream, detachStream]);

  // ── 볼륨 측정 루프 ──────────────────────────────────────────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      const nodes    = audioNodesRef.current;
      const newLevels = new Map();
      let loudestDb  = VOLUME_THRESHOLD_DB;
      let loudestId  = null;

      for (const [peerId, node] of nodes) {
        // 로컬: 마이크 꺼져 있으면 0
        if (peerId === LOCAL_PEER_ID && !isMicOn) {
          newLevels.set(peerId, 0);
          continue;
        }

        // 원격: isMuted 상태면 0
        if (peerId !== LOCAL_PEER_ID) {
          const streamData = remoteStreams.get(peerId);
          if (streamData?.isMuted) {
            newLevels.set(peerId, 0);
            continue;
          }
        }

        try {
          node.analyser.getByteTimeDomainData(node.buffer);
          const db         = byteTimeDomainToDb(node.buffer);
          const normalized = dbToNormalized(db);
          newLevels.set(peerId, normalized);

          if (db > loudestDb) {
            loudestDb = db;
            loudestId = peerId;
          }
        } catch {
          newLevels.set(peerId, 0);
        }
      }

      setVolumeLevels(newLevels);

      // ── Active Speaker 결정 로직 ──────────────────────────
      if (loudestId) {
        // 침묵 타이머 리셋
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }

        const candidate = speakerCandidateRef.current;

        if (!candidate || candidate.peerId !== loudestId) {
          // 새 후보
          speakerCandidateRef.current = { peerId: loudestId, since: Date.now() };
        } else {
          // 후보가 debounce 시간 이상 지속되면 activeSpeaker로 승격
          const elapsed = Date.now() - candidate.since;
          if (elapsed >= SPEAKING_DEBOUNCE_MS) {
            lastSpeakerRef.current = loudestId;
            setActiveSpeakerId(loudestId);
          }
        }
      } else {
        // 아무도 말 안 함 → 침묵 타이머 시작
        speakerCandidateRef.current = null;
        if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            setActiveSpeakerId(null);
            silenceTimerRef.current = null;
          }, SILENCE_TIMEOUT_MS);
        }
      }
    }, MEASURE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [remoteStreams, isMicOn]);

  // ── 전체 cleanup ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (intervalRef.current)   clearInterval(intervalRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      for (const peerId of audioNodesRef.current.keys()) {
        detachStream(peerId);
      }
    };
  }, [detachStream]);

  // ── 공개 API ────────────────────────────────────────────────
  const pinPeer = useCallback((peerId) => {
    setPinnedPeerId(peerId);
  }, []);

  const unpinPeer = useCallback(() => {
    setPinnedPeerId(null);
  }, []);

  const isSpeaking = useCallback((peerId) => {
    if (!peerId) return false;
    const level = volumeLevels.get(peerId) ?? 0;
    return level > 0.08; // 정규화 레벨 임계값
  }, [volumeLevels]);

  // ── 실제 표시할 메인 발표자 (pin > active > last > null) ───
  const mainSpeakerId = pinnedPeerId ?? activeSpeakerId ?? lastSpeakerRef.current ?? null;

  return {
    activeSpeakerId,
    mainSpeakerId,
    pinnedPeerId,
    volumeLevels,
    pinPeer,
    unpinPeer,
    isSpeaking,
    LOCAL_PEER_ID,
  };
}