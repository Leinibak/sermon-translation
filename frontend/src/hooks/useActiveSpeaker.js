// frontend/src/hooks/useActiveSpeaker.js
//
// [수정 내역]
// FIX-1: 로컬 스트림 peerId → user.username 기반으로 정확히 매핑
//        (remoteStreams의 key와 로컬 peerId가 일치하지 않는 문제 해결)
// FIX-2: 음량 임계값 상향 (0.01 → 0.08) + 히스테리시스 적용
//        → 잡음에 의한 깜박거림 방지
// FIX-3: speaking 상태 변경에 debounce 적용 (켜질 때 즉시, 꺼질 때 1.5초 지연)
//        → 말이 잠깐 끊겨도 테두리가 바로 사라지지 않음
// FIX-4: mainSpeakerId smoothing — 주화자가 바뀌려면 연속 3회 이상 큰 소리여야 함
//        → 주화자가 자주 바뀌는 깜박거림 방지
// FIX-5: 로컬 스트림은 AudioContext analyser로 직접 분석
//        원격 스트림도 각 peerId별로 analyser 생성하여 정확히 매핑
//
// [파라미터]
//   localStreamRef  — useSFU의 localStreamRef
//   remoteStreams    — useSFU의 remoteStreams (Map<peerId, {stream, username, ...}>)
//   localPeerId      — 로컬 사용자의 peerId (user.username)
//   isMicOn          — 마이크 상태 (꺼져 있으면 로컬 분석 skip)

import { useRef, useState, useEffect, useCallback } from 'react';

// ── 상수 ────────────────────────────────────────────────────
const SPEAKING_THRESHOLD     = 0.08;   // 말하는 것으로 판단하는 최소 음량 (0~1)
const SILENCE_THRESHOLD      = 0.04;   // 이 이하로 내려가야 침묵으로 판단 (히스테리시스)
const SPEAKING_HOLD_MS       = 1500;   // 말이 끊겨도 speaking 유지 시간 (ms)
const MAIN_SPEAKER_HOLD_MS   = 2000;   // 주화자 유지 최소 시간 (ms) — 너무 자주 바뀌지 않게
const MAIN_SPEAKER_COUNT_REQ = 3;      // 주화자로 인정받으려면 연속 N회 최고 음량이어야 함
const ANALYSIS_INTERVAL_MS   = 80;     // 음량 분석 주기 (ms) — 초당 ~12회

export function useActiveSpeaker({ localStreamRef, remoteStreams, localPeerId, isMicOn }) {
  const [mainSpeakerId, setMainSpeakerId]   = useState(null);
  const [pinnedPeerId,  setPinnedPeerId]    = useState(null);
  const [volumeLevels,  setVolumeLevels]    = useState(new Map());

  // ── 내부 상태 refs (렌더링 없이 관리) ──────────────────────
  const analysersRef      = useRef(new Map()); // peerId → { analyser, source, ctx }
  const speakingStateRef  = useRef(new Map()); // peerId → { isSpeaking, silenceTimer, rawVolume }
  const mainSpeakerRef    = useRef({
    currentId:    null,
    candidateId:  null,
    candidateCnt: 0,
    lockedUntil:  0,       // 이 시각까지 mainSpeaker 고정
  });
  const intervalRef       = useRef(null);
  const audioCtxRef       = useRef(null);

  // ── AudioContext 가져오기 (싱글턴) ──────────────────────────
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // ── analyser 등록 ────────────────────────────────────────────
  const registerAnalyser = useCallback((peerId, stream) => {
    if (analysersRef.current.has(peerId)) return; // 이미 등록됨
    if (!stream) return;

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    try {
      const ctx      = getAudioCtx();
      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize            = 256;
      analyser.smoothingTimeConstant = 0.6;  // 0=빠름, 1=느림 — 부드럽게
      source.connect(analyser);

      analysersRef.current.set(peerId, { analyser, source, ctx });

      // speaking 상태 초기화
      if (!speakingStateRef.current.has(peerId)) {
        speakingStateRef.current.set(peerId, {
          isSpeaking:  false,
          silenceTimer: null,
          rawVolume:    0,
        });
      }
    } catch (e) {
      console.warn(`[ActiveSpeaker] analyser 등록 실패 peerId="${peerId}":`, e.message);
    }
  }, [getAudioCtx]);

  // ── analyser 해제 ────────────────────────────────────────────
  const unregisterAnalyser = useCallback((peerId) => {
    const entry = analysersRef.current.get(peerId);
    if (!entry) return;
    try {
      entry.source.disconnect();
    } catch (_) {}
    analysersRef.current.delete(peerId);

    const state = speakingStateRef.current.get(peerId);
    if (state?.silenceTimer) clearTimeout(state.silenceTimer);
    speakingStateRef.current.delete(peerId);
  }, []);

  // ── RMS 음량 계산 ─────────────────────────────────────────────
  const getRmsVolume = useCallback((analyser) => {
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += (data[i] / 255) ** 2;
    }
    return Math.sqrt(sum / data.length);
  }, []);

  // ── speaking 상태 업데이트 (히스테리시스 + debounce) ─────────
  const updateSpeakingState = useCallback((peerId, volume) => {
    const state = speakingStateRef.current.get(peerId);
    if (!state) return;

    state.rawVolume = volume;

    if (volume >= SPEAKING_THRESHOLD) {
      // 말하기 시작: 즉시 반영
      if (!state.isSpeaking) {
        state.isSpeaking = true;
      }
      // silence 타이머 리셋
      if (state.silenceTimer) {
        clearTimeout(state.silenceTimer);
        state.silenceTimer = null;
      }
    } else if (volume < SILENCE_THRESHOLD && state.isSpeaking) {
      // 침묵 감지: SPEAKING_HOLD_MS 후에 끔
      if (!state.silenceTimer) {
        state.silenceTimer = setTimeout(() => {
          const s = speakingStateRef.current.get(peerId);
          if (s) {
            s.isSpeaking = false;
            s.silenceTimer = null;
          }
        }, SPEAKING_HOLD_MS);
      }
    }
  }, []);

  // ── 주화자 결정 ───────────────────────────────────────────────
  const updateMainSpeaker = useCallback((volumeMap) => {
    const now = Date.now();
    const ms  = mainSpeakerRef.current;

    // 현재 주화자 고정 시간이 남아 있으면 변경 불가
    if (now < ms.lockedUntil && ms.currentId) {
      // 단, 현재 주화자가 완전히 침묵 상태이면 고정 해제
      const curState = speakingStateRef.current.get(ms.currentId);
      if (curState?.isSpeaking) return; // 아직 말 중 → 고정 유지
    }

    // 가장 큰 음량의 peerId 찾기 (speaking 중인 것만)
    let maxVol   = SPEAKING_THRESHOLD;
    let maxPeerId = null;

    for (const [peerId, state] of speakingStateRef.current) {
      if (state.isSpeaking && state.rawVolume > maxVol) {
        maxVol   = state.rawVolume;
        maxPeerId = peerId;
      }
    }

    if (!maxPeerId) {
      // 아무도 말하지 않음 → 현재 주화자 유지 (고정 시간 무관)
      return;
    }

    if (maxPeerId === ms.currentId) {
      // 현재 주화자가 계속 말하는 중 → 유지
      ms.candidateCnt = 0;
      return;
    }

    // 새 후보 평가
    if (maxPeerId === ms.candidateId) {
      ms.candidateCnt += 1;
    } else {
      ms.candidateId  = maxPeerId;
      ms.candidateCnt = 1;
    }

    // MAIN_SPEAKER_COUNT_REQ 회 연속으로 최고 음량이어야 주화자 변경
    if (ms.candidateCnt >= MAIN_SPEAKER_COUNT_REQ) {
      ms.currentId    = maxPeerId;
      ms.candidateId  = null;
      ms.candidateCnt = 0;
      ms.lockedUntil  = now + MAIN_SPEAKER_HOLD_MS;
      setMainSpeakerId(maxPeerId);
    }
  }, []);

  // ── 분석 루프 ─────────────────────────────────────────────────
  const startAnalysisLoop = useCallback(() => {
    if (intervalRef.current) return;

    intervalRef.current = setInterval(() => {
      const newVolumes = new Map();

      for (const [peerId, { analyser }] of analysersRef.current) {
        // 로컬 피어: 마이크 꺼져 있으면 0
        if (peerId === localPeerId && !isMicOn) {
          newVolumes.set(peerId, 0);
          updateSpeakingState(peerId, 0);
          continue;
        }

        const vol = getRmsVolume(analyser);
        newVolumes.set(peerId, vol);
        updateSpeakingState(peerId, vol);
      }

      updateMainSpeaker(newVolumes);

      // speaking 상태를 volumeLevels에 반영
      setVolumeLevels(new Map(newVolumes));
    }, ANALYSIS_INTERVAL_MS);
  }, [localPeerId, isMicOn, getRmsVolume, updateSpeakingState, updateMainSpeaker]);

  const stopAnalysisLoop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ── 로컬 스트림 등록/해제 ─────────────────────────────────────
  useEffect(() => {
    if (!localPeerId || !localStreamRef.current) return;
    registerAnalyser(localPeerId, localStreamRef.current);
    startAnalysisLoop();

    return () => {
      // cleanup은 unmount 시 전체 정리에서 처리
    };
  }, [localPeerId, localStreamRef, registerAnalyser, startAnalysisLoop]);

  // ── 원격 스트림 변경 감지 ────────────────────────────────────
  useEffect(() => {
    if (!remoteStreams) return;

    const currentPeerIds = new Set([...remoteStreams.keys()]);

    // 새로 추가된 피어 → analyser 등록
    for (const [peerId, streamData] of remoteStreams) {
      if (!analysersRef.current.has(peerId) && streamData.stream) {
        registerAnalyser(peerId, streamData.stream);
      }
    }

    // 제거된 피어 → analyser 해제
    for (const peerId of analysersRef.current.keys()) {
      if (peerId === localPeerId) continue; // 로컬은 건드리지 않음
      if (!currentPeerIds.has(peerId)) {
        unregisterAnalyser(peerId);

        // 제거된 피어가 주화자였으면 초기화
        if (mainSpeakerRef.current.currentId === peerId) {
          mainSpeakerRef.current.currentId   = null;
          mainSpeakerRef.current.lockedUntil = 0;
          setMainSpeakerId(null);
        }
      }
    }

    // 분석 루프 시작 (이미 시작됐으면 무시)
    startAnalysisLoop();
  }, [remoteStreams, localPeerId, registerAnalyser, unregisterAnalyser, startAnalysisLoop]);

  // ── unmount 정리 ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopAnalysisLoop();
      for (const peerId of [...analysersRef.current.keys()]) {
        unregisterAnalyser(peerId);
      }
      for (const [, state] of speakingStateRef.current) {
        if (state.silenceTimer) clearTimeout(state.silenceTimer);
      }
      speakingStateRef.current.clear();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [stopAnalysisLoop, unregisterAnalyser]);

  // ── 핀 고정/해제 ─────────────────────────────────────────────
  const pinPeer = useCallback((peerId) => {
    setPinnedPeerId(peerId);
    // 핀 고정 시 mainSpeaker도 해당 피어로 고정
    mainSpeakerRef.current.currentId   = peerId;
    mainSpeakerRef.current.lockedUntil = Date.now() + 999999999; // 영구 고정
    setMainSpeakerId(peerId);
  }, []);

  const unpinPeer = useCallback(() => {
    setPinnedPeerId(null);
    mainSpeakerRef.current.lockedUntil = 0;
  }, []);

  // ── isSpeaking 함수 ────────────────────────────────────────
  const isSpeaking = useCallback((peerId) => {
    return speakingStateRef.current.get(peerId)?.isSpeaking ?? false;
  }, []);

  // ── 핀 고정 중이면 mainSpeakerId를 pinnedPeerId로 override ──
  const effectiveMainSpeakerId = pinnedPeerId ?? mainSpeakerId;

  return {
    mainSpeakerId:  effectiveMainSpeakerId,
    pinnedPeerId,
    volumeLevels,
    isSpeaking,
    pinPeer,
    unpinPeer,
  };
}