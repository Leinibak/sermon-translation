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
// ✅ 변경 사항 (기존 대비):
//   - MEDIAPIPE_CDN(jsdelivr) 제거
//   - npm 패키지(@mediapipe/selfie_segmentation) 사용
//   - locateFile: /mediapipe/ 경로 (Dockerfile.prod에서 public/mediapipe/에 복사)
//   - CDN 스크립트 태그 방식 제거 (불필요)
//   - 나머지 로직 동일 유지
//
// 사용:
//   const { backgroundMode, backgroundImage, setBackground, setBackgroundImage, cleanup }
//     = useBackgroundProcessor({ localStreamRef, producersRef });

import { useRef, useState, useCallback, useEffect } from 'react';

// ── 상수 ────────────────────────────────────────────────────
const CANVAS_FPS  = 24;   // 출력 프레임율
const BLUR_AMOUNT = 14;   // 배경 블러 강도 (px)

const BP  = (tag, ...a) => console.log(`%c[BG-${tag}]`, 'color:#9c27b0;font-weight:bold', ...a);
const BPW = (tag, ...a) => console.warn(`%c[BG-${tag}]`, 'color:#ff9800;font-weight:bold', ...a);
const BPE = (tag, ...a) => console.error(`%c[BG-${tag}]`, 'color:#f44336;font-weight:bold', ...a);

// ── MediaPipe 로더 (싱글턴) ──────────────────────────────────
let segmentationInstance = null;
let segmentationLoading  = false;
let segmentationReady    = false;
const segmentationCallbacks = [];

async function loadSelfieSegmentation() {
  if (segmentationReady) return segmentationInstance;
  if (segmentationLoading) {
    return new Promise((resolve, reject) => {
      segmentationCallbacks.push({ resolve, reject });
    });
  }

  segmentationLoading = true;
  BP('LOAD', 'MediaPipe SelfieSegmentation 로드 시작...');

  try {
    // ✅ npm 패키지에서 import (CDN 아님)
    const { SelfieSegmentation } = await import('@mediapipe/selfie_segmentation');

    const seg = new SelfieSegmentation({
      // ✅ Dockerfile.prod에서 복사한 public/mediapipe/ 경로에서 wasm/모델 로드
      //    빌드 후 dist/mediapipe/ → nginx가 /mediapipe/ 로 서빙
      locateFile: (file) => `/mediapipe/${file}`,
    });

    seg.setOptions({
      modelSelection: 1,  // 0=일반, 1=풍경 (더 정확)
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('SelfieSegmentation init timeout')),
        15000
      );
      seg.onResults(() => {
        clearTimeout(timeout);
        resolve();
      });
      // 더미 캔버스로 초기화 트리거
      const dummy = document.createElement('canvas');
      dummy.width = 64; dummy.height = 64;
      seg.send({ image: dummy }).catch(() => {});
    });

    segmentationInstance = seg;
    segmentationReady    = true;
    segmentationLoading  = false;
    BP('LOAD', '✅ MediaPipe SelfieSegmentation 로드 완료');

    segmentationCallbacks.forEach(cb => cb.resolve(seg));
    segmentationCallbacks.length = 0;
    return seg;

  } catch (e) {
    segmentationLoading = false;
    BPE('LOAD', 'MediaPipe 로드 실패:', e.message);
    segmentationCallbacks.forEach(cb => cb.reject(e));
    segmentationCallbacks.length = 0;
    throw e;
  }
}

// ── 훅 본체 ──────────────────────────────────────────────────
export function useBackgroundProcessor({ localStreamRef, producersRef }) {
  const [backgroundMode,  setBackgroundMode]      = useState('none');
  const [backgroundImage, setBackgroundImageState] = useState(null);

  // ── 내부 refs ──────────────────────────────────────────────
  const canvasRef        = useRef(null);   // 합성용 캔버스
  const outputStreamRef  = useRef(null);   // captureStream() 결과
  const rafRef           = useRef(null);   // requestAnimationFrame ID
  const intervalRef      = useRef(null);   // setInterval ID (fallback)
  const segRef           = useRef(null);   // SelfieSegmentation 인스턴스
  const bgImageRef       = useRef(null);   // HTMLImageElement (배경 이미지)
  const modeRef          = useRef('none'); // 현재 모드 (closure 없이 최신값 유지)
  const activeRef        = useRef(false);  // 처리 루프 활성 여부
  const originalTrackRef = useRef(null);   // 원본 카메라 비디오 트랙
  const videoElRef       = useRef(null);   // 재사용 video 엘리먼트

  // ── 캔버스 합성 함수 ─────────────────────────────────────
  const composeFrame = useCallback((videoEl, seg, results) => {
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

    if (!results || !results.segmentationMask) {
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
      // 배경 이미지: 비율 유지하며 중앙 크롭
      const img = bgImageRef.current;
      const s  = Math.max(w / img.width, h / img.height);
      const dw = img.width * s, dh = img.height * s;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, 0, w, h);
    }

    // 2) 인물 마스크로 원본 비디오의 인물 부분만 합성
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width  = w;
    tempCanvas.height = h;
    const tCtx = tempCanvas.getContext('2d');

    tCtx.drawImage(videoEl, 0, 0, w, h);
    // destination-in: 마스크 흰색(인물) 부분만 남김
    tCtx.globalCompositeOperation = 'destination-in';
    tCtx.drawImage(mask, 0, 0, w, h);
    tCtx.globalCompositeOperation = 'source-over';

    // 배경 위에 인물 합성
    ctx.drawImage(tempCanvas, 0, 0, w, h);
  }, []);

  // ── 비디오 엘리먼트 생성/재사용 ─────────────────────────
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
      setTimeout(resolve, 3000); // 안전망
    });

    videoElRef.current = video;
    return video;
  }, []);

  // ── 처리 루프 시작 ───────────────────────────────────────
  const startProcessingLoop = useCallback(async (rawStream) => {
    BP('01', '처리 루프 시작');

    // 캔버스 준비
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;

    // 실제 카메라 해상도에 맞춤
    const vTrack = rawStream.getVideoTracks()[0];
    const { width = 640, height = 480 } = vTrack?.getSettings?.() || {};
    canvas.width  = width;
    canvas.height = height;
    BP('01', `캔버스: ${width}×${height}`);

    // 비디오 엘리먼트 준비
    const videoEl = await getVideoEl(rawStream);

    // captureStream 준비 (최초 1회)
    if (!outputStreamRef.current) {
      outputStreamRef.current = canvas.captureStream(CANVAS_FPS);
      BP('01', `captureStream 생성 — ${CANVAS_FPS}fps`);
    }

    // MediaPipe 로드 시도
    try {
      if (!segRef.current) {
        BP('01', 'MediaPipe 로드 시도...');
        const seg = await loadSelfieSegmentation();
        segRef.current = seg;
        BP('01', '✅ MediaPipe 준비 완료');
      }
    } catch (e) {
      BPW('01', 'MediaPipe 로드 실패 — fallback 모드로 동작:', e.message);
    }

    const seg = segRef.current;
    activeRef.current = true;
    let lastResults = null;

    if (seg) {
      // ── MediaPipe 세그멘테이션 루프 ──────────────────────
      seg.onResults((results) => { lastResults = results; });

      const loop = async () => {
        if (!activeRef.current) return;
        if (modeRef.current === 'none') {
          const ctx = canvas.getContext('2d');
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        } else {
          try {
            await seg.send({ image: videoEl });
            composeFrame(videoEl, seg, lastResults);
          } catch (_) {
            composeFrame(videoEl, seg, null);
          }
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);

    } else {
      // ── Fallback: MediaPipe 없이 단순 처리 ───────────────
      BPW('01', 'Fallback 모드: 세그멘테이션 없이 처리');
      const ctx = canvas.getContext('2d');

      intervalRef.current = setInterval(() => {
        if (!activeRef.current) return;
        const mode = modeRef.current;
        const cw = canvas.width, ch = canvas.height;

        if (mode === 'none') {
          ctx.drawImage(videoEl, 0, 0, cw, ch);
        } else if (mode === 'blur') {
          ctx.filter = `blur(${BLUR_AMOUNT}px)`;
          ctx.drawImage(videoEl, 0, 0, cw, ch);
          ctx.filter = 'none';
          // 중앙 사각형 선명하게 복사 (AI 없는 fallback)
          const pw = Math.round(cw * 0.65), ph = ch;
          const px = (cw - pw) / 2;
          ctx.drawImage(videoEl, px, 0, pw, ph, px, 0, pw, ph);
        } else if (mode === 'image' && bgImageRef.current) {
          const img = bgImageRef.current;
          const s  = Math.max(cw / img.width, ch / img.height);
          const dw = img.width * s, dh = img.height * s;
          ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
          // 중앙 사각형 인물 합성
          const pw = Math.round(cw * 0.65), ph = ch;
          const px = (cw - pw) / 2;
          ctx.drawImage(videoEl, px, 0, pw, ph, px, 0, pw, ph);
        } else {
          ctx.drawImage(videoEl, 0, 0, cw, ch);
        }
      }, 1000 / CANVAS_FPS);
    }

    BP('01', '✅ 처리 루프 시작 완료');
    return outputStreamRef.current;
  }, [getVideoEl, composeFrame]);

  // ── 처리 루프 중지 ───────────────────────────────────────
  const stopProcessingLoop = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current)      { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current);  intervalRef.current = null; }
    BP('02', '처리 루프 중지');
  }, []);

  // ── SFU producer 트랙 교체 헬퍼 ─────────────────────────
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

      // SFU producer를 원본 트랙으로 복원
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

      // 처리 루프가 없으면 시작
      if (!activeRef.current) {
        const processedStream = await startProcessingLoop(rawStream);
        if (processedStream) {
          const processedVideoTrack = processedStream.getVideoTracks()[0];
          if (processedVideoTrack) {
            await replaceVideoProducerTrack(processedVideoTrack);
          }
        }
      }
      // 이미 루프가 동작 중이면 modeRef만 변경 → 자동 반영
    }
  }, [localStreamRef, startProcessingLoop, stopProcessingLoop, replaceVideoProducerTrack]);

  // ── 배경 이미지 설정 ─────────────────────────────────────
  const setBackgroundImage = useCallback(async (dataUrl) => {
    BP('05', 'setBackgroundImage 호출');
    setBackgroundImageState(dataUrl);

    // 이미지 로드 완료 후 모드 전환
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

    setBackgroundMode('none');
    setBackgroundImageState(null);
    BP('99', 'cleanup 완료');
  }, [stopProcessingLoop, replaceVideoProducerTrack]);

  // 언마운트 시 정리
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