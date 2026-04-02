// frontend/src/hooks/useBackgroundProcessor.js
//
// ★ 배경 처리 훅 v5 ★
//
// 방식: MediaPipe SelfieSegmentation → Canvas 합성 → captureStream()
//
// 지원 모드:
//   'none'  — 원본 카메라 스트림 그대로 송출
//   'blur'  — 배경만 가우시안 블러 처리, 인물은 선명하게
//   'image' — 배경을 커스텀 이미지로 교체
//
// ✅ v5 핵심 수정:
//   [버그] createVideoEl에서 이전 video.srcObject = null 설정 시
//          Chrome이 rawStream(getUserMedia 원본)의 트랙들을 ended시킴.
//          → 이후 배경 전환이 모두 검은 화면으로 나타나는 근본 원인.
//   [수정] createVideoEl에서 videoElRef 재사용 가능 시 srcObject만 교체.
//          전 video를 null로 초기화하지 않고, srcObject를 새 스트림으로 덮어씀.
//          srcObject 변경 시 이전 스트림의 트랙은 멈추지 않고 참조만 해제됨.
//   [추가] rawStream을 안전하게 재활용하기 위한 별도 스트림(internalStream) 사용:
//          rawStream 대신 rawStream.getTracks()를 복사한 새 MediaStream을
//          video.srcObject에 연결 → 원본 트랙 ended 문제 완전 차단.

import { useRef, useState, useCallback, useEffect } from 'react';

// ── 상수 ────────────────────────────────────────────────────
const CANVAS_FPS  = 24;
const BLUR_AMOUNT = 14;

const BP  = (tag, ...a) => console.log(`%c[BG-${tag}]`, 'color:#9c27b0;font-weight:bold', ...a);
const BPW = (tag, ...a) => console.warn(`%c[BG-${tag}]`, 'color:#ff9800;font-weight:bold', ...a);
const BPE = (tag, ...a) => console.error(`%c[BG-${tag}]`, 'color:#f44336;font-weight:bold', ...a);

// ── MediaPipe 로더 ──────────────────────────────────────────
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
  const videoElRef         = useRef(null);
  // ✅ v5: 내부 video용 복사 스트림 — 원본 rawStream과 분리
  const internalStreamRef  = useRef(null);

  // ── 캔버스 합성 ─────────────────────────────────────────────
  //  MediaPipe segmentationMask: 흰색=인물, 검정=배경
  //  Step1) 배경 레이어 (blur or 이미지)를 메인 캔버스에 그리기
  //  Step2) 임시 캔버스에 원본 영상 → destination-in으로 인물 픽셀만 추출
  //  Step3) 인물 레이어를 배경 위에 합성
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

    // Step 1: 배경 레이어
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

    // Step 2: 인물 레이어 추출 (임시 캔버스)
    const tmp  = document.createElement('canvas');
    tmp.width  = w;
    tmp.height = h;
    const tCtx = tmp.getContext('2d');

    if (videoEl.readyState >= 2) tCtx.drawImage(videoEl, 0, 0, w, h);

    // mask 흰 부분(인물)만 남기기
    tCtx.globalCompositeOperation = 'destination-in';
    tCtx.drawImage(mask, 0, 0, w, h);
    tCtx.globalCompositeOperation = 'source-over';

    // Step 3: 인물 레이어를 배경 위에 합성
    ctx.drawImage(tmp, 0, 0, w, h);
  }, []);

  // ── ✅ v5 핵심: video 엘리먼트 생성 시 원본 스트림 분리 ─────
  //
  //  문제: video.srcObject = rawStream 후 srcObject = null 하면
  //        Chrome이 rawStream의 getUserMedia 트랙을 ended시킴.
  //
  //  해결: rawStream의 트랙들을 그대로 사용하되,
  //        새 MediaStream 래퍼(internalStream)를 만들어 video에 연결.
  //        → internalStream이 null이 돼도 원본 트랙은 ended 안 됨.
  const createVideoEl = useCallback(async (rawStream) => {
    // ✅ 이전 video 정리: srcObject를 null로 하지 않고 detach만
    if (videoElRef.current) {
      // srcObject = null 대신 srcObject에 빈 스트림을 할당하거나
      // 그냥 pause()만 하여 원본 스트림 트랙 보호
      try { videoElRef.current.pause(); } catch (_) {}
      videoElRef.current = null;
    }

    // ✅ 이전 internalStream 정리 (원본 트랙은 stop 하지 않음)
    if (internalStreamRef.current) {
      internalStreamRef.current = null;
    }

    // ✅ 원본 트랙을 참조하는 새 MediaStream 래퍼 생성
    //    - rawStream 자체가 아닌 새 MediaStream에 같은 트랙들을 추가
    //    - video.srcObject = internalStream
    //    - 나중에 internalStream = null 해도 rawStream 트랙은 live 유지
    const tracks = rawStream.getTracks();
    const internalStream = new MediaStream(tracks);
    internalStreamRef.current = internalStream;

    const video = document.createElement('video');
    video.srcObject   = internalStream;
    video.autoplay    = true;
    video.playsInline = true;
    video.muted       = true;

    await new Promise((resolve) => {
      video.onloadedmetadata = () => { video.play().catch(() => {}); resolve(); };
      video.onerror = resolve;
      setTimeout(resolve, 3000);
    });

    videoElRef.current = video;
    BP('01', `video 엘리먼트 생성 완료 — internalStream="${internalStream.id}"`);
    return video;
  }, []);

  // ── 처리 루프 중지 ────────────────────────────────────────
  const stopProcessingLoop = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current)      { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current);   intervalRef.current = null; }
    BP('02', '처리 루프 중지');
  }, []);

  // ── outputStream 캔버스 트랙 정리 ────────────────────────
  //  ✅ captureStream 트랙만 stop — 원본 카메라 트랙 불변
  const stopOutputStreamTracks = useCallback(() => {
    if (outputStreamRef.current) {
      outputStreamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch (_) {}
      });
      outputStreamRef.current = null;
      BP('02', 'outputStream(canvas) 트랙 stop 완료');
    }
  }, []);

  // ── 처리 루프 시작 ────────────────────────────────────────
  const startProcessingLoop = useCallback(async (rawStream) => {
    BP('01', '처리 루프 시작');

    // 이전 outputStream 트랙 정리
    stopOutputStreamTracks();

    canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;

    const vTrack = rawStream.getVideoTracks()[0];
    const { width = 640, height = 480 } = vTrack?.getSettings?.() || {};
    canvas.width  = width;
    canvas.height = height;
    BP('01', `캔버스: ${width}×${height}`);

    // ✅ v5: createVideoEl로 안전한 내부 스트림 래퍼 사용
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
      // ✅ onResults 항상 새로 등록 (이전 세션 콜백 교체)
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

  // ── SFU producer 트랙 교체 ────────────────────────────────
  const replaceVideoProducerTrack = useCallback(async (newTrack) => {
    if (!newTrack) {
      BPW('03', 'replaceVideoProducerTrack: newTrack null — 생략');
      return;
    }
    if (newTrack.readyState === 'ended') {
      BPW('03', `replaceVideoProducerTrack: track ended (id="${newTrack.id.slice(0,8)}") — 생략`);
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

  // ── 로컬 비디오 미리보기 업데이트 ───────────────────────
  const updateLocalVideoPreview = useCallback((stream) => {
    const videoEl = localVideoRef?.current;
    if (!videoEl) { BPW('06', 'localVideoRef 없음'); return; }
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
      // ── 배경 효과 OFF ──────────────────────────────────
      stopProcessingLoop();

      // ✅ rawStream에서 live 트랙 직접 가져오기
      const liveVideoTrack = rawStream.getVideoTracks().find(t => t.readyState === 'live');

      if (liveVideoTrack) {
        BP('04', `live 원본 트랙 확인 — id="${liveVideoTrack.id.slice(0,8)}" readyState="${liveVideoTrack.readyState}"`);
        // ✅ SFU 교체를 outputStream stop 전에 먼저 실행
        await replaceVideoProducerTrack(liveVideoTrack);
        updateLocalVideoPreview(rawStream);
      } else {
        BPW('04', '⚠ live 트랙 없음. 트랙 상태:', rawStream.getVideoTracks().map(t => `${t.id.slice(0,8)}:${t.readyState}`).join(', '));
        updateLocalVideoPreview(rawStream);
      }

      // ✅ v5: video 엘리먼트 정리 — srcObject=null 아닌 pause()만 사용
      if (videoElRef.current) {
        try { videoElRef.current.pause(); } catch (_) {}
        videoElRef.current = null;
      }

      // ✅ internalStream 참조 해제 (원본 트랙은 touched 없음)
      internalStreamRef.current = null;

      // outputStream(canvas captureStream) 트랙 stop
      stopOutputStreamTracks();

      // 다음 세션을 위한 초기화
      segRef.current = null;
      resetSegmentationCache();
      canvasRef.current = null;

      setBackgroundImageState(null);

    } else {
      // ── 배경 효과 ON ───────────────────────────────────
      if (!activeRef.current) {
        const processedStream = await startProcessingLoop(rawStream);
        if (processedStream) {
          // ✅ SFU 교체 먼저, 미리보기 업데이트 후
          const processedTrack = processedStream.getVideoTracks()[0];
          if (processedTrack) {
            await replaceVideoProducerTrack(processedTrack);
          }
          updateLocalVideoPreview(processedStream);
        }
      } else {
        // 이미 루프 동작 중 → modeRef만 변경 (자동 반영)
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

    const rawStream = localStreamRef?.current;
    if (rawStream) {
      const liveTrack = rawStream.getVideoTracks().find(t => t.readyState === 'live');
      if (liveTrack) {
        await replaceVideoProducerTrack(liveTrack).catch(() => {});
        updateLocalVideoPreview(rawStream);
      }
    }

    // ✅ v5: pause()만, srcObject=null 사용 안 함
    if (videoElRef.current) {
      try { videoElRef.current.pause(); } catch (_) {}
      videoElRef.current = null;
    }

    internalStreamRef.current = null;
    stopOutputStreamTracks();

    bgImageRef.current   = null;
    canvasRef.current    = null;
    modeRef.current      = 'none';
    segRef.current       = null;
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