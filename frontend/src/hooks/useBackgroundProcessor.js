// frontend/src/hooks/useBackgroundProcessor.js
//
// ★ 배경 처리 훅 — Zoom 스타일 인물 분리 ★
//
// 방식: MediaPipe SelfieSegmentation → Canvas 합성 → captureStream()
//
// 지원 모드:
//   'none'  — 원본 카메라 스트림 그대로 송출
//   'blur'  — 배경만 가우시안 블러 처리, 인물은 선명하게
//   'image' — 배경을 커스텀 이미지로 교체
//
// ✅ 버그 수정 (v2):
//   - cleanup() 시 segRef.current를 null로 초기화
//     → 다음 세션에서 startProcessingLoop가 새 MediaPipe 인스턴스로 루프를 시작
//     → 이전 onResults 콜백이 새 canvas에 영향을 주지 않음
//   - localVideoRef prop 추가: 배경 효과 시 로컬 미리보기도 업데이트
//   - cleanup() 후 재진입 시 모든 ref가 깨끗하게 초기화된 상태에서 재시작

import { useRef, useState, useCallback, useEffect } from 'react';

// ── 상수 ────────────────────────────────────────────────────
const CANVAS_FPS  = 24;
const BLUR_AMOUNT = 14;

const BP  = (tag, ...a) => console.log(`%c[BG-${tag}]`, 'color:#9c27b0;font-weight:bold', ...a);
const BPW = (tag, ...a) => console.warn(`%c[BG-${tag}]`, 'color:#ff9800;font-weight:bold', ...a);
const BPE = (tag, ...a) => console.error(`%c[BG-${tag}]`, 'color:#f44336;font-weight:bold', ...a);

// ── MediaPipe 로더 (싱글턴 — 모듈 단위로 한 번만 로드) ──────
// 주의: 인스턴스 자체는 재사용하지 않고 매 세션마다 새로 생성.
// (segRef.current가 cleanup 시 null로 리셋되므로 startProcessingLoop에서
//  새 인스턴스를 만들어 이전 onResults 콜백이 남지 않도록 함)
let cachedSegmentation = null;
let segLoadingPromise  = null;

async function loadSelfieSegmentation() {
  // 이미 로드된 인스턴스가 있으면 재사용 (module-level 캐시)
  if (cachedSegmentation) return cachedSegmentation;

  // 로딩 중이면 같은 promise 공유
  if (segLoadingPromise) return segLoadingPromise;

  segLoadingPromise = (async () => {
    BP('LOAD', 'MediaPipe SelfieSegmentation 로드 시작...');

    const { SelfieSegmentation } = await import('@mediapipe/selfie_segmentation');

    const seg = new SelfieSegmentation({
      locateFile: (file) => `/mediapipe/${file}`,
    });

    seg.setOptions({ modelSelection: 1 });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('SelfieSegmentation init timeout')),
        15000
      );
      seg.onResults(() => {
        clearTimeout(timeout);
        resolve();
      });
      const dummy = document.createElement('canvas');
      dummy.width = 64; dummy.height = 64;
      seg.send({ image: dummy }).catch(() => {});
    });

    BP('LOAD', '✅ MediaPipe SelfieSegmentation 로드 완료');
    cachedSegmentation = seg;
    segLoadingPromise  = null;
    return seg;
  })();

  return segLoadingPromise;
}

// ─────────────────────────────────────────────────────────────────
// 훅 본체
// ─────────────────────────────────────────────────────────────────
export function useBackgroundProcessor({ localStreamRef, producersRef, localVideoRef }) {
  const [backgroundMode,  setBackgroundMode]       = useState('none');
  const [backgroundImage, setBackgroundImageState]  = useState(null);

  // ── 내부 refs ──────────────────────────────────────────────
  const canvasRef        = useRef(null);
  const outputStreamRef  = useRef(null);
  const rafRef           = useRef(null);
  const intervalRef      = useRef(null);
  // ✅ segRef: cleanup 시 null로 리셋 → 다음 세션에서 새 인스턴스 생성
  const segRef           = useRef(null);
  const bgImageRef       = useRef(null);
  const modeRef          = useRef('none');
  const activeRef        = useRef(false);
  const originalTrackRef = useRef(null);
  const videoElRef       = useRef(null);

  // ── 캔버스 합성 ─────────────────────────────────────────
  const composeFrame = useCallback((videoEl, results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const mode = modeRef.current;

    if (mode === 'none') {
      ctx.drawImage(videoEl, 0, 0, w, h);
      return;
    }

    if (!results?.segmentationMask) {
      // 세그멘테이션 결과 없음 → fallback
      if (mode === 'blur') {
        ctx.filter = `blur(${BLUR_AMOUNT}px)`;
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.filter = 'none';
      } else {
        ctx.drawImage(videoEl, 0, 0, w, h);
      }
      return;
    }

    const mask = results.segmentationMask;

    // 1) 배경 레이어
    if (mode === 'blur') {
      ctx.filter = `blur(${BLUR_AMOUNT}px)`;
      ctx.drawImage(videoEl, 0, 0, w, h);
      ctx.filter = 'none';
    } else if (mode === 'image' && bgImageRef.current) {
      const img = bgImageRef.current;
      const s   = Math.max(w / img.width, h / img.height);
      const dw  = img.width * s, dh = img.height * s;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, 0, w, h);
    }

    // 2) 인물 마스크 합성
    const tmp  = document.createElement('canvas');
    tmp.width  = w; tmp.height = h;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(videoEl, 0, 0, w, h);
    tCtx.globalCompositeOperation = 'destination-in';
    tCtx.drawImage(mask, 0, 0, w, h);
    tCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(tmp, 0, 0, w, h);
  }, []);

  // ── video 엘리먼트 생성 ──────────────────────────────────
  const getVideoEl = useCallback(async (stream) => {
    if (videoElRef.current) return videoElRef.current;

    const video = document.createElement('video');
    video.srcObject   = stream;
    video.autoplay    = true;
    video.playsInline = true;
    video.muted       = true;

    await new Promise((resolve) => {
      video.onloadedmetadata = () => { video.play().catch(() => {}); resolve(); };
      video.onerror = resolve;
      setTimeout(resolve, 3000);
    });

    videoElRef.current = video;
    return video;
  }, []);

  // ── 처리 루프 중지 ────────────────────────────────────────
  const stopProcessingLoop = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current)      { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current);   intervalRef.current = null; }
    BP('02', '처리 루프 중지');
  }, []);

  // ── 처리 루프 시작 ────────────────────────────────────────
  const startProcessingLoop = useCallback(async (rawStream) => {
    BP('01', '처리 루프 시작');

    // 캔버스 준비 (항상 새로 생성)
    canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;

    const vTrack = rawStream.getVideoTracks()[0];
    const { width = 640, height = 480 } = vTrack?.getSettings?.() || {};
    canvas.width  = width;
    canvas.height = height;
    BP('01', `캔버스: ${width}×${height}`);

    const videoEl = await getVideoEl(rawStream);

    // ✅ captureStream도 항상 새로 생성 (이전 세션 스트림과 혼용 방지)
    outputStreamRef.current = canvas.captureStream(CANVAS_FPS);
    BP('01', `captureStream 생성 — ${CANVAS_FPS}fps`);

    // ✅ segRef가 null이면 새 MediaPipe 인스턴스 로드 (cleanup 후 재진입 시)
    try {
      if (!segRef.current) {
        BP('01', 'MediaPipe 로드 시도...');
        // 모듈 캐시(cachedSegmentation)를 사용하되,
        // segRef에는 매 세션 처음 시작 시 할당하여 onResults를 새로 등록
        const seg = await loadSelfieSegmentation();
        segRef.current = seg;
        BP('01', '✅ MediaPipe 준비 완료');
      }
    } catch (e) {
      BPW('01', 'MediaPipe 로드 실패 — fallback 모드:', e.message);
    }

    const seg = segRef.current;
    activeRef.current = true;
    let lastResults = null;

    if (seg) {
      // ✅ onResults를 새로 등록 (이전 세션의 콜백을 완전히 교체)
      seg.onResults((results) => {
        // activeRef 체크: 이 루프가 여전히 살아있을 때만 결과 저장
        if (activeRef.current) lastResults = results;
      });

      const loop = async () => {
        if (!activeRef.current) return;
        if (modeRef.current === 'none') {
          const ctx = canvas.getContext('2d');
          if (videoEl.readyState >= 2) ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        } else {
          try {
            if (videoEl.readyState >= 2) {
              await seg.send({ image: videoEl });
              composeFrame(videoEl, lastResults);
            }
          } catch (_) {
            if (activeRef.current) composeFrame(videoEl, null);
          }
        }
        if (activeRef.current) rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);

    } else {
      // Fallback: MediaPipe 없이 단순 처리
      BPW('01', 'Fallback 모드: 세그멘테이션 없이 처리');
      const ctx = canvas.getContext('2d');

      intervalRef.current = setInterval(() => {
        if (!activeRef.current) return;
        if (videoEl.readyState < 2) return;
        const mode = modeRef.current;
        const cw = canvas.width, ch = canvas.height;

        if (mode === 'none') {
          ctx.drawImage(videoEl, 0, 0, cw, ch);
        } else if (mode === 'blur') {
          ctx.filter = `blur(${BLUR_AMOUNT}px)`;
          ctx.drawImage(videoEl, 0, 0, cw, ch);
          ctx.filter = 'none';
          const pw = Math.round(cw * 0.65), ph = ch, px = (cw - pw) / 2;
          ctx.drawImage(videoEl, px, 0, pw, ph, px, 0, pw, ph);
        } else if (mode === 'image' && bgImageRef.current) {
          const img = bgImageRef.current;
          const s = Math.max(cw / img.width, ch / img.height);
          const dw = img.width * s, dh = img.height * s;
          ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
          const pw = Math.round(cw * 0.65), ph = ch, px = (cw - pw) / 2;
          ctx.drawImage(videoEl, px, 0, pw, ph, px, 0, pw, ph);
        } else {
          ctx.drawImage(videoEl, 0, 0, cw, ch);
        }
      }, 1000 / CANVAS_FPS);
    }

    BP('01', '✅ 처리 루프 시작 완료');
    return outputStreamRef.current;
  }, [getVideoEl, composeFrame]);

  // ── SFU producer 트랙 교체 ───────────────────────────────
  const replaceVideoProducerTrack = useCallback(async (newTrack) => {
    const producers = producersRef?.current;
    if (!producers) return;
    const videoProducer = producers.get('video');
    if (!videoProducer || videoProducer.closed) return;
    try {
      await videoProducer.replaceTrack({ track: newTrack });
      BP('03', '✅ SFU video producer 트랙 교체 완료');
    } catch (e) {
      BPE('03', 'SFU 트랙 교체 실패:', e.message);
    }
  }, [producersRef]);

  // ── 로컬 비디오 미리보기 업데이트 ───────────────────────
  const updateLocalVideoPreview = useCallback((stream) => {
    const videoEl = localVideoRef?.current;
    if (!videoEl) {
      BPW('06', 'localVideoRef 없음 — 미리보기 업데이트 생략');
      return;
    }
    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
      videoEl.play().catch(() => {});
      BP('06', `로컬 비디오 미리보기 업데이트 — streamId="${stream?.id}"`);
    }
  }, [localVideoRef]);

  // ── 배경 모드 설정 ───────────────────────────────────────
  const setBackground = useCallback(async (mode) => {
    BP('04', `setBackground 호출 — mode="${mode}"`);
    modeRef.current = mode;
    setBackgroundMode(mode);

    const rawStream = localStreamRef?.current;
    if (!rawStream) {
      BPW('04', 'localStreamRef 없음 — 모드만 저장');
      return;
    }

    if (mode === 'none') {
      stopProcessingLoop();

      // 로컬 미리보기를 원본 스트림으로 복원
      updateLocalVideoPreview(rawStream);

      // SFU producer 원본 트랙으로 복원
      if (originalTrackRef.current) {
        await replaceVideoProducerTrack(originalTrackRef.current);
      }

      // video 엘리먼트 정리
      if (videoElRef.current) {
        videoElRef.current.srcObject = null;
        videoElRef.current = null;
      }
      outputStreamRef.current = null;
      setBackgroundImageState(null);

    } else {
      // 원본 비디오 트랙 저장 (최초 1회)
      const origTrack = rawStream.getVideoTracks()[0];
      if (origTrack && !originalTrackRef.current) {
        originalTrackRef.current = origTrack;
        BP('04', `원본 비디오 트랙 저장 — id="${origTrack.id}"`);
      }

      // 처리 루프 시작 (비활성 상태일 때만)
      if (!activeRef.current) {
        const processedStream = await startProcessingLoop(rawStream);
        if (processedStream) {
          // 로컬 미리보기를 처리된 스트림으로 교체
          updateLocalVideoPreview(processedStream);

          const processedVideoTrack = processedStream.getVideoTracks()[0];
          if (processedVideoTrack) {
            await replaceVideoProducerTrack(processedVideoTrack);
          }
        }
      } else {
        // 루프가 이미 동작 중 → modeRef만 변경 (자동 반영)
        if (outputStreamRef.current) {
          updateLocalVideoPreview(outputStreamRef.current);
        }
      }
    }
  }, [localStreamRef, startProcessingLoop, stopProcessingLoop, replaceVideoProducerTrack, updateLocalVideoPreview]);

  // ── 배경 이미지 설정 ─────────────────────────────────────
  const setBackgroundImage = useCallback(async (dataUrl) => {
    BP('05', 'setBackgroundImage 호출');
    setBackgroundImageState(dataUrl);

    await new Promise((resolve) => {
      const img = new Image();
      img.onload  = () => { bgImageRef.current = img; BP('05', '✅ 배경 이미지 로드 완료'); resolve(); };
      img.onerror = () => { BPE('05', '배경 이미지 로드 실패'); resolve(); };
      img.src = dataUrl;
    });

    await setBackground('image');
  }, [setBackground]);

  // ── 정리 ────────────────────────────────────────────────
  const cleanup = useCallback(async () => {
    BP('99', 'cleanup 시작');
    stopProcessingLoop();

    // 로컬 미리보기를 원본 스트림으로 복원
    if (originalTrackRef.current && localStreamRef?.current) {
      updateLocalVideoPreview(localStreamRef.current);
    }

    if (originalTrackRef.current) {
      await replaceVideoProducerTrack(originalTrackRef.current).catch(() => {});
    }

    if (videoElRef.current) {
      videoElRef.current.srcObject = null;
      videoElRef.current = null;
    }

    bgImageRef.current       = null;
    outputStreamRef.current  = null;
    originalTrackRef.current = null;
    canvasRef.current        = null;
    modeRef.current          = 'none';

    // ✅ 핵심 수정: segRef를 null로 초기화
    // → 다음 세션에서 startProcessingLoop 호출 시
    //   seg.onResults를 새로 등록하여 이전 콜백이 남지 않게 함
    segRef.current = null;

    setBackgroundMode('none');
    setBackgroundImageState(null);
    BP('99', 'cleanup 완료');
  }, [stopProcessingLoop, replaceVideoProducerTrack, localStreamRef, updateLocalVideoPreview]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (rafRef.current)      cancelAnimationFrame(rafRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return {
    backgroundMode,
    backgroundImage,
    setBackground,
    setBackgroundImage,
    cleanup,
  };
}