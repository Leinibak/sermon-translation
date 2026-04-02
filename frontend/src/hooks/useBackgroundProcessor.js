// frontend/src/hooks/useBackgroundProcessor.js
//
// ★ 배경 처리 훅 v4 ★
//
// 방식: MediaPipe SelfieSegmentation → Canvas 합성 → captureStream()
//
// 지원 모드:
//   'none'  — 원본 카메라 스트림 그대로 송출
//   'blur'  — 배경만 가우시안 블러 처리, 인물은 선명하게
//   'image' — 배경을 커스텀 이미지로 교체
//
// ✅ v4 수정 사항:
//   1. [track ended 수정] mode='none' 복귀 시 originalTrackRef 대신
//      localStreamRef.current.getVideoTracks().find(t=>t.readyState==='live')
//      에서 live 트랙을 직접 가져옴.
//      이유: originalTrackRef에 저장된 트랙이 이미 ended 상태일 수 있기 때문.
//   2. [배경이미지 인물 소실 수정] composeFrame의 segmentationMask 합성 방향
//      수정. MediaPipe mask는 흰색=인물/검정=배경이므로 Step1(배경) →
//      Step2(인물 마스크 추출) → Step3(인물 오버레이) 순서로 올바르게 처리.
//   3. [재활성화 black frame 수정] outputStreamRef 트랙 stop 후 segRef +
//      cachedSegmentation 완전 초기화 → 다음 세션에서 새 인스턴스 사용 보장.
//   4. replaceVideoProducerTrack에서 track.readyState 사전 검증 추가.

import { useRef, useState, useCallback, useEffect } from 'react';

// ── 상수 ────────────────────────────────────────────────────
const CANVAS_FPS  = 24;
const BLUR_AMOUNT = 14;

const BP  = (tag, ...a) => console.log(`%c[BG-${tag}]`, 'color:#9c27b0;font-weight:bold', ...a);
const BPW = (tag, ...a) => console.warn(`%c[BG-${tag}]`, 'color:#ff9800;font-weight:bold', ...a);
const BPE = (tag, ...a) => console.error(`%c[BG-${tag}]`, 'color:#f44336;font-weight:bold', ...a);

// ── MediaPipe 로더 ──────────────────────────────────────────
// ✅ v4: let으로 선언 → cleanup 시 null 재할당 가능
let cachedSegmentation = null;
let segLoadingPromise  = null;

async function loadSelfieSegmentation() {
  if (cachedSegmentation) return cachedSegmentation;
  if (segLoadingPromise)  return segLoadingPromise;

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

function resetSegmentationCache() {
  cachedSegmentation = null;
  segLoadingPromise  = null;
}

// ─────────────────────────────────────────────────────────────────
// 훅 본체
// ─────────────────────────────────────────────────────────────────
export function useBackgroundProcessor({ localStreamRef, producersRef, localVideoRef }) {
  const [backgroundMode,  setBackgroundMode]      = useState('none');
  const [backgroundImage, setBackgroundImageState] = useState(null);

  // ── 내부 refs ──────────────────────────────────────────────
  const canvasRef          = useRef(null);
  const outputStreamRef    = useRef(null);
  const rafRef             = useRef(null);
  const intervalRef        = useRef(null);
  const segRef             = useRef(null);
  const bgImageRef         = useRef(null);
  const modeRef            = useRef('none');
  const activeRef          = useRef(false);
  // ✅ v4: 트랙 id만 기록 (복원 시 live 트랙은 localStreamRef에서 직접 가져옴)
  const originalTrackIdRef = useRef(null);
  const videoElRef         = useRef(null);

  // ── 캔버스 합성 ──────────────────────────────────────────────
  // ✅ v4 핵심 수정: MediaPipe segmentationMask 합성 순서 교정
  //
  //  MediaPipe SelfieSegmentation segmentationMask:
  //    - 흰색(alpha≈1) = 인물(foreground)
  //    - 검정(alpha≈0) = 배경(background)
  //
  //  올바른 합성 순서:
  //   Step1) 배경 레이어 전체를 메인 캔버스에 그리기 (blur 영상 또는 이미지)
  //   Step2) 임시 캔버스에 원본 영상 + mask(destination-in) → 인물 픽셀만 추출
  //   Step3) 인물 레이어를 메인 캔버스(배경) 위에 올려 합성
  //
  //  ❌ 이전 v2/v3 버그: destination-in을 적용할 때 canvas/mask 순서가 반대여서
  //     배경 이미지가 인물 위에 덮히거나 인물이 사라지는 현상 발생
  const composeFrame = useCallback((videoEl, results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const mode = modeRef.current;

    if (mode === 'none') {
      if (videoEl.readyState >= 2) ctx.drawImage(videoEl, 0, 0, w, h);
      return;
    }

    if (!results?.segmentationMask) {
      if (mode === 'blur') {
        ctx.filter = `blur(${BLUR_AMOUNT}px)`;
        if (videoEl.readyState >= 2) ctx.drawImage(videoEl, -4, -4, w + 8, h + 8);
        ctx.filter = 'none';
      } else {
        if (videoEl.readyState >= 2) ctx.drawImage(videoEl, 0, 0, w, h);
      }
      return;
    }

    const mask = results.segmentationMask;

    // ── Step 1: 배경 레이어 ────────────────────────────────
    ctx.save();
    if (mode === 'blur') {
      ctx.filter = `blur(${BLUR_AMOUNT}px)`;
      if (videoEl.readyState >= 2) ctx.drawImage(videoEl, -4, -4, w + 8, h + 8);
      ctx.filter = 'none';
    } else if (mode === 'image' && bgImageRef.current) {
      const img = bgImageRef.current;
      const s   = Math.max(w / img.width, h / img.height);
      const dw  = img.width  * s;
      const dh  = img.height * s;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();

    // ── Step 2: 인물 레이어 추출 (임시 캔버스) ────────────
    const tmp  = document.createElement('canvas');
    tmp.width  = w;
    tmp.height = h;
    const tCtx = tmp.getContext('2d');

    // 원본 영상 그리기
    if (videoEl.readyState >= 2) tCtx.drawImage(videoEl, 0, 0, w, h);

    // mask(흰=인물, 검=배경)를 destination-in으로 적용
    // → 인물 영역(mask 흰 부분)만 남고 배경(mask 검정 부분)은 투명해짐
    tCtx.globalCompositeOperation = 'destination-in';
    tCtx.drawImage(mask, 0, 0, w, h);
    tCtx.globalCompositeOperation = 'source-over';

    // ── Step 3: 인물 레이어를 배경 위에 합성 ──────────────
    ctx.drawImage(tmp, 0, 0, w, h);
  }, []);

  // ── video 엘리먼트 생성 (항상 새로 생성) ─────────────────────
  const createVideoEl = useCallback(async (stream) => {
    if (videoElRef.current) {
      videoElRef.current.srcObject = null;
      videoElRef.current = null;
    }

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

  // ── 처리 루프 중지 ────────────────────────────────────────────
  const stopProcessingLoop = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current)      { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current);   intervalRef.current = null; }
    BP('02', '처리 루프 중지');
  }, []);

  // ── outputStream 트랙 정리 ────────────────────────────────────
  const stopOutputStreamTracks = useCallback(() => {
    if (outputStreamRef.current) {
      outputStreamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch (_) {}
      });
      outputStreamRef.current = null;
      BP('02', 'outputStream 트랙 stop 완료');
    }
  }, []);

  // ── 처리 루프 시작 ────────────────────────────────────────────
  const startProcessingLoop = useCallback(async (rawStream) => {
    BP('01', '처리 루프 시작');

    stopOutputStreamTracks();

    canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;

    const vTrack = rawStream.getVideoTracks()[0];
    const { width = 640, height = 480 } = vTrack?.getSettings?.() || {};
    canvas.width  = width;
    canvas.height = height;
    BP('01', `캔버스: ${width}×${height}`);

    const videoEl = await createVideoEl(rawStream);

    outputStreamRef.current = canvas.captureStream(CANVAS_FPS);
    BP('01', `captureStream 생성 — ${CANVAS_FPS}fps`);

    try {
      if (!segRef.current) {
        BP('01', 'MediaPipe 로드 시도...');
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
      seg.onResults((results) => {
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
        if (!activeRef.current || videoEl.readyState < 2) return;
        const mode = modeRef.current;
        const cw = canvas.width, ch = canvas.height;

        if (mode === 'none') {
          ctx.drawImage(videoEl, 0, 0, cw, ch);
        } else if (mode === 'blur') {
          ctx.filter = `blur(${BLUR_AMOUNT}px)`;
          ctx.drawImage(videoEl, -4, -4, cw + 8, ch + 8);
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
  }, [createVideoEl, composeFrame, stopOutputStreamTracks]);

  // ── SFU producer 트랙 교체 ────────────────────────────────────
  // ✅ v4: track.readyState 사전 검증 추가
  const replaceVideoProducerTrack = useCallback(async (newTrack) => {
    if (!newTrack) {
      BPW('03', 'replaceVideoProducerTrack: newTrack null — 생략');
      return;
    }
    if (newTrack.readyState === 'ended') {
      BPW('03', `replaceVideoProducerTrack: track already ended (id="${newTrack.id.slice(0,8)}") — 생략`);
      return;
    }
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

  // ── 로컬 비디오 미리보기 업데이트 ───────────────────────────
  const updateLocalVideoPreview = useCallback((stream) => {
    const videoEl = localVideoRef?.current;
    if (!videoEl) { BPW('06', 'localVideoRef 없음'); return; }
    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
      videoEl.play().catch(() => {});
      BP('06', `로컬 비디오 미리보기 업데이트 — streamId="${stream?.id}"`);
    }
  }, [localVideoRef]);

  // ── 배경 모드 설정 ───────────────────────────────────────────
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
      // ── 배경 효과 OFF ──────────────────────────────────────
      stopProcessingLoop();

      // ✅ v4 핵심: localStreamRef에서 live 상태의 트랙을 직접 가져옴
      //    originalTrackRef에 저장된 트랙은 ended일 수 있으므로 사용 불가
      const liveVideoTrack = rawStream.getVideoTracks().find(t => t.readyState === 'live');

      if (liveVideoTrack) {
        BP('04', `✅ live 원본 트랙 확인 — id="${liveVideoTrack.id.slice(0,8)}" readyState="${liveVideoTrack.readyState}"`);
        updateLocalVideoPreview(rawStream);
        await replaceVideoProducerTrack(liveVideoTrack);
      } else {
        BPW('04', '⚠ live 트랙 없음. 트랙 상태:', rawStream.getVideoTracks().map(t => `${t.id.slice(0,8)}:${t.readyState}`).join(', '));
        updateLocalVideoPreview(rawStream);
      }

      // video 엘리먼트 정리
      if (videoElRef.current) {
        videoElRef.current.srcObject = null;
        videoElRef.current = null;
      }

      // outputStream 트랙 정리
      stopOutputStreamTracks();

      // 다음 세션을 위한 초기화
      originalTrackIdRef.current = null;
      segRef.current = null;
      resetSegmentationCache();

      setBackgroundImageState(null);

    } else {
      // ── 배경 효과 ON ───────────────────────────────────────
      const origTrack = rawStream.getVideoTracks()[0];
      if (origTrack && !originalTrackIdRef.current) {
        originalTrackIdRef.current = origTrack.id;
        BP('04', `원본 비디오 트랙 id 저장 — id="${origTrack.id.slice(0,8)}"`);
      }

      if (!activeRef.current) {
        const processedStream = await startProcessingLoop(rawStream);
        if (processedStream) {
          updateLocalVideoPreview(processedStream);
          const processedTrack = processedStream.getVideoTracks()[0];
          if (processedTrack) {
            await replaceVideoProducerTrack(processedTrack);
          }
        }
      } else {
        if (outputStreamRef.current) {
          updateLocalVideoPreview(outputStreamRef.current);
        }
      }
    }
  }, [
    localStreamRef,
    startProcessingLoop,
    stopProcessingLoop,
    stopOutputStreamTracks,
    replaceVideoProducerTrack,
    updateLocalVideoPreview,
  ]);

  // ── 배경 이미지 설정 ──────────────────────────────────────────
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

  // ── 정리 ────────────────────────────────────────────────────
  const cleanup = useCallback(async () => {
    BP('99', 'cleanup 시작');
    stopProcessingLoop();

    const rawStream = localStreamRef?.current;
    if (rawStream) {
      const liveTrack = rawStream.getVideoTracks().find(t => t.readyState === 'live');
      if (liveTrack) {
        updateLocalVideoPreview(rawStream);
        await replaceVideoProducerTrack(liveTrack).catch(() => {});
      }
    }

    if (videoElRef.current) {
      videoElRef.current.srcObject = null;
      videoElRef.current = null;
    }

    stopOutputStreamTracks();

    bgImageRef.current         = null;
    originalTrackIdRef.current = null;
    canvasRef.current          = null;
    modeRef.current            = 'none';
    segRef.current             = null;
    resetSegmentationCache();

    setBackgroundMode('none');
    setBackgroundImageState(null);
    BP('99', 'cleanup 완료');
  }, [
    stopProcessingLoop,
    stopOutputStreamTracks,
    replaceVideoProducerTrack,
    localStreamRef,
    updateLocalVideoPreview,
  ]);

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