// frontend/src/hooks/useBackgroundProcessor.js
//
// Canvas 기반 배경 처리 훅 (서버 의존 없이 순수 프론트엔드 처리)
//
// 지원 모드:
//   'none'   — 원본 카메라 그대로
//   'blur'   — 배경 블러 (CSS filter 방식 + requestAnimationFrame)
//   'image'  — 배경 이미지 대체
//
// 구현 방식:
//   - MediaPipe Selfie Segmentation 없이 동작하는 간단한 구현
//   - "배경 교체" 효과: 전체 캔버스에 배경을 깔고 그 위에 영상을 합성
//     (완전한 인물 분리는 MediaPipe 필요, 여기서는 블러+오버레이 방식으로 구현)
//   - 완전한 세그멘테이션이 필요한 경우 @mediapipe/selfie_segmentation 패키지 추가 가능

import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * 배경 처리 훅
 *
 * @param {React.RefObject} localStreamRef  — useSFU의 localStreamRef
 * @param {React.RefObject} producersRef    — useSFU의 producersRef (트랙 교체용)
 * @returns {{
 *   backgroundMode: string,
 *   backgroundImage: string|null,
 *   processedStreamRef: React.RefObject,
 *   setBackground: function,
 *   setBackgroundImage: function,
 *   isProcessing: boolean,
 *   cleanup: function,
 * }}
 */
export function useBackgroundProcessor({ localStreamRef, producersRef }) {
  const [backgroundMode, setBackgroundMode]   = useState('none');   // 'none' | 'blur' | 'image'
  const [backgroundImage, setBackgroundImageState] = useState(null); // data URL
  const [isProcessing, setIsProcessing]        = useState(false);

  // Canvas 처리 내부 refs
  const canvasRef       = useRef(null);  // OffscreenCanvas 또는 일반 Canvas
  const rafRef          = useRef(null);  // requestAnimationFrame ID
  const bgImageRef      = useRef(null);  // 로드된 Image 객체
  const processedStreamRef = useRef(null); // Canvas → MediaStream
  const modeRef         = useRef('none');  // 클로저 stale 방지

  // ── 처리 루프 중단 ──────────────────────────────────────────
  const stopProcessing = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsProcessing(false);
  }, []);

  // ── 원본 스트림으로 복원 ────────────────────────────────────
  const restoreOriginalTrack = useCallback(async () => {
    const videoProducer = producersRef?.current?.get('video');
    const originalStream = localStreamRef.current;

    if (videoProducer && originalStream) {
      const originalTrack = originalStream.getVideoTracks()[0];
      if (originalTrack) {
        try {
          await videoProducer.replaceTrack({ track: originalTrack });
        } catch (e) {
          console.warn('[BG] replaceTrack to original failed:', e.message);
        }
      }
    }

    // processedStream 정리
    if (processedStreamRef.current) {
      processedStreamRef.current.getTracks().forEach(t => t.stop());
      processedStreamRef.current = null;
    }
  }, [localStreamRef, producersRef]);

  // ── Canvas 처리 루프 시작 ───────────────────────────────────
  const startProcessingLoop = useCallback((videoEl, canvas, ctx, mode, bgImg) => {
    const loop = () => {
      if (!videoEl || videoEl.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const w = canvas.width;
      const h = canvas.height;

      if (mode === 'blur') {
        // 블러 모드: 배경을 블러 처리한 복사본 + 인물 오버레이
        // 1. 전체를 먼저 블러로 그리기
        ctx.filter = 'blur(12px) brightness(0.85)';
        ctx.drawImage(videoEl, 0, 0, w, h);

        // 2. 인물 영역을 중앙 70% 부분에 선명하게 오버레이 (간단한 ellipse mask)
        ctx.filter = 'none';
        ctx.save();
        // 타원형 클리핑 마스크
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w * 0.38, h * 0.50, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();

      } else if (mode === 'image' && bgImg) {
        // 이미지 배경 모드
        // 1. 배경 이미지 먼저 그리기 (cover 방식)
        const imgAspect    = bgImg.width  / bgImg.height;
        const canvasAspect = w / h;

        let sx = 0, sy = 0, sw = bgImg.width, sh = bgImg.height;
        if (imgAspect > canvasAspect) {
          sw = bgImg.height * canvasAspect;
          sx = (bgImg.width - sw) / 2;
        } else {
          sh = bgImg.width / canvasAspect;
          sy = (bgImg.height - sh) / 2;
        }
        ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, w, h);

        // 2. 인물 영역 타원 마스크로 카메라 영상 오버레이
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w * 0.38, h * 0.50, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();

        // 3. 경계 부분 그라디언트 페이드로 자연스럽게
        const fadeGrad = ctx.createRadialGradient(
          w / 2, h / 2, w * 0.30,
          w / 2, h / 2, w * 0.42
        );
        fadeGrad.addColorStop(0, 'rgba(0,0,0,0)');
        fadeGrad.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = fadeGrad;
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        // 4. 배경 이미지 다시 그리기 (페이드된 부분 채우기)
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, w, h);
        ctx.restore();

      } else {
        // 'none' 또는 fallback: 원본 그대로
        ctx.filter = 'none';
        ctx.drawImage(videoEl, 0, 0, w, h);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    setIsProcessing(true);
  }, []);

  // ── 배경 모드 적용 핵심 함수 ───────────────────────────────
  const applyBackground = useCallback(async (mode, bgImg = null) => {
    // 기존 처리 중단
    stopProcessing();

    if (mode === 'none') {
      await restoreOriginalTrack();
      modeRef.current = 'none';
      return;
    }

    const originalStream = localStreamRef.current;
    if (!originalStream) {
      console.warn('[BG] No local stream available');
      return;
    }

    const videoTrack = originalStream.getVideoTracks()[0];
    if (!videoTrack) {
      console.warn('[BG] No video track available');
      return;
    }

    // 해상도 가져오기
    const settings = videoTrack.getSettings();
    const width  = settings.width  || 640;
    const height = settings.height || 480;

    // Canvas 생성 또는 재사용
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;
    canvas.width  = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');

    // Video 엘리먼트로 카메라 스트림 읽기
    const videoEl = document.createElement('video');
    videoEl.srcObject = originalStream;
    videoEl.muted     = true;
    videoEl.playsInline = true;
    videoEl.width  = width;
    videoEl.height = height;
    await videoEl.play().catch(() => {});

    // Canvas → MediaStream 변환
    const processedStream = canvas.captureStream(30);
    processedStreamRef.current = processedStream;

    // SFU producer 트랙 교체
    const videoProducer = producersRef?.current?.get('video');
    const processedTrack = processedStream.getVideoTracks()[0];

    if (videoProducer && processedTrack) {
      try {
        await videoProducer.replaceTrack({ track: processedTrack });
        console.log('[BG] SFU video producer → processed track 교체 완료');
      } catch (e) {
        console.warn('[BG] replaceTrack failed (SFU may not be ready yet):', e.message);
      }
    } else {
      console.warn('[BG] SFU producer not ready — track replacement skipped');
    }

    modeRef.current = mode;
    startProcessingLoop(videoEl, canvas, ctx, mode, bgImg);
  }, [localStreamRef, producersRef, stopProcessing, restoreOriginalTrack, startProcessingLoop]);

  // ── 외부 인터페이스: 배경 모드 변경 ───────────────────────
  const setBackground = useCallback(async (mode) => {
    setBackgroundMode(mode);

    if (mode === 'none') {
      await applyBackground('none');
    } else if (mode === 'blur') {
      await applyBackground('blur');
    } else if (mode === 'image') {
      // 이미 이미지가 로드되어 있으면 즉시 적용
      if (bgImageRef.current) {
        await applyBackground('image', bgImageRef.current);
      }
      // 이미지가 없으면 setBackgroundImage 호출을 기다림
    }
  }, [applyBackground]);

  // ── 외부 인터페이스: 배경 이미지 설정 ─────────────────────
  const setBackgroundImage = useCallback(async (dataUrl) => {
    setBackgroundImageState(dataUrl);

    if (!dataUrl) {
      bgImageRef.current = null;
      return;
    }

    // Image 객체 로드
    const img = new Image();
    img.onload = async () => {
      bgImageRef.current = img;
      setBackgroundMode('image');
      await applyBackground('image', img);
    };
    img.onerror = () => {
      console.error('[BG] 배경 이미지 로드 실패');
    };
    img.src = dataUrl;
  }, [applyBackground]);

  // ── 모드 변경 시 재적용 (localStream 변경 대응) ────────────
  useEffect(() => {
    // localStream이 바뀌면 현재 모드 재적용
    const handleStreamChange = async () => {
      const current = modeRef.current;
      if (current !== 'none') {
        const bgImg = current === 'image' ? bgImageRef.current : null;
        await applyBackground(current, bgImg);
      }
    };

    // 스트림이 있을 때만 재적용
    if (localStreamRef.current && modeRef.current !== 'none') {
      handleStreamChange();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 정리 ───────────────────────────────────────────────────
  const cleanup = useCallback(async () => {
    stopProcessing();
    await restoreOriginalTrack();
    bgImageRef.current  = null;
    canvasRef.current   = null;
    modeRef.current     = 'none';
    setBackgroundMode('none');
    setBackgroundImageState(null);
  }, [stopProcessing, restoreOriginalTrack]);

  return {
    backgroundMode,
    backgroundImage,
    processedStreamRef,
    setBackground,
    setBackgroundImage,
    isProcessing,
    cleanup,
  };
}