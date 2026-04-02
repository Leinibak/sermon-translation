// frontend/src/hooks/useBackgroundProcessor.js
//
// ★ 배경 처리 훅 v6 — 완전 재설계 ★
//
// [핵심 설계 원칙]
//
// 1. 원본 카메라 스트림(rawStream)과 그 트랙은 절대로 건드리지 않음
//    - video.srcObject = null 사용 금지 (Chrome에서 getUserMedia 트랙 ended됨)
//    - track.stop() 호출 금지 (captureStream track이라도 SFU 상태에 영향)
//
// 2. 내부 video 엘리먼트는 컴포넌트 전체 수명 동안 하나만 유지
//    - 매 세션마다 새로 생성하지 않음
//    - srcObject는 rawStream → rawStream 변경 없음 (한 번 연결 후 고정)
//
// 3. none 전환 시 captureStream 트랙 stop 금지
//    - 대신 canvas 렌더링 루프만 중지 (track은 자연히 정지 상태가 됨)
//    - SFU producer 트랙 교체 후 canvas/outputStream은 GC에 맡김
//
// 4. SFU 교체는 항상 새 트랙이 준비된 후에만 실행

import { useRef, useState, useCallback, useEffect } from 'react';

const CANVAS_FPS  = 24;
const BLUR_AMOUNT = 14;

const BP  = (tag, ...a) => console.log(`%c[BG-${tag}]`, 'color:#9c27b0;font-weight:bold', ...a);
const BPW = (tag, ...a) => console.warn(`%c[BG-${tag}]`, 'color:#ff9800;font-weight:bold', ...a);
const BPE = (tag, ...a) => console.error(`%c[BG-${tag}]`, 'color:#f44336;font-weight:bold', ...a);

// ── MediaPipe 로더 (싱글턴) ──────────────────────────────────
// 한 번 로드 후 세션 간 재사용 (매번 재로드 불필요)
let _segInstance = null;
let _segPromise  = null;

async function getSegmentation() {
  if (_segInstance) return _segInstance;
  if (_segPromise)  return _segPromise;

  _segPromise = (async () => {
    BP('LOAD', 'MediaPipe 로드 시작...');
    const { SelfieSegmentation } = await import('@mediapipe/selfie_segmentation');
    const seg = new SelfieSegmentation({ locateFile: f => `/mediapipe/${f}` });
    seg.setOptions({ modelSelection: 1 });

    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('MediaPipe init timeout')), 15000);
      seg.onResults(() => { clearTimeout(t); resolve(); });
      const d = document.createElement('canvas');
      d.width = d.height = 64;
      seg.send({ image: d }).catch(() => {});
    });

    BP('LOAD', '✅ MediaPipe 로드 완료');
    _segInstance = seg;
    _segPromise  = null;
    return seg;
  })();

  return _segPromise;
}

// ─────────────────────────────────────────────────────────────────
export function useBackgroundProcessor({ localStreamRef, producersRef, localVideoRef }) {
  const [backgroundMode,  setBackgroundMode]      = useState('none');
  const [backgroundImage, setBackgroundImageState] = useState(null);

  // ── refs ──────────────────────────────────────────────────
  const modeRef        = useRef('none');
  const bgImageRef     = useRef(null);
  const activeRef      = useRef(false);
  const rafRef         = useRef(null);
  const intervalRef    = useRef(null);

  // ✅ v6: video / canvas / stream 은 한 번 생성 후 재사용
  const videoElRef     = useRef(null);   // 내부 처리용 video (rawStream 고정)
  const canvasRef      = useRef(null);   // 합성 캔버스
  const outputStreamRef = useRef(null);  // captureStream 출력

  // ── 캔버스 합성 ─────────────────────────────────────────────
  const composeFrame = useCallback((videoEl, results) => {
    const canvas = canvasRef.current;
    if (!canvas || !videoEl || videoEl.readyState < 2) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const mode = modeRef.current;

    if (mode === 'none') {
      ctx.drawImage(videoEl, 0, 0, w, h);
      return;
    }

    const mask = results?.segmentationMask;

    // ── Step 1: 배경 레이어 ─────────────────────────────────
    ctx.save();
    if (mode === 'blur') {
      ctx.filter = `blur(${BLUR_AMOUNT}px)`;
      ctx.drawImage(videoEl, -4, -4, w + 8, h + 8);
      ctx.filter = 'none';
    } else if (mode === 'image' && bgImageRef.current) {
      const img = bgImageRef.current;
      const s   = Math.max(w / img.width, h / img.height);
      ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
    } else {
      // 배경 이미지 미준비 시 fallback: 흐린 영상
      ctx.filter = `blur(${BLUR_AMOUNT}px)`;
      ctx.drawImage(videoEl, -4, -4, w + 8, h + 8);
      ctx.filter = 'none';
    }
    ctx.restore();

    if (!mask) {
      // mask 없으면 인물 합성 건너뜀 (배경만 표시)
      return;
    }

    // ── Step 2: 인물 추출 (임시 캔버스) ─────────────────────
    const tmp  = document.createElement('canvas');
    tmp.width  = w; tmp.height = h;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(videoEl, 0, 0, w, h);
    tCtx.globalCompositeOperation = 'destination-in';
    tCtx.drawImage(mask, 0, 0, w, h);
    tCtx.globalCompositeOperation = 'source-over';

    // ── Step 3: 인물 합성 ────────────────────────────────────
    ctx.drawImage(tmp, 0, 0, w, h);
  }, []);

  // ── 처리 루프 중지 (active만 false, 모든 ref 유지) ──────────
  const stopLoop = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current)      { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current);   intervalRef.current = null; }
    BP('02', '처리 루프 중지');
  }, []);

  // ── SFU producer 트랙 교체 ────────────────────────────────
  const replaceSFUTrack = useCallback(async (newTrack) => {
    if (!newTrack || newTrack.readyState === 'ended') {
      BPW('03', `replaceSFUTrack: 트랙 없음 또는 ended — 생략 (readyState=${newTrack?.readyState})`);
      return false;
    }
    const vp = producersRef?.current?.get('video');
    if (!vp || vp.closed) {
      BPW('03', 'replaceSFUTrack: video producer 없음 — 생략');
      return false;
    }
    try {
      await vp.replaceTrack({ track: newTrack });
      BP('03', `✅ SFU 트랙 교체 완료 — kind=${newTrack.kind} id=${newTrack.id.slice(0,8)}`);
      return true;
    } catch (e) {
      BPE('03', 'SFU 트랙 교체 실패:', e.message);
      return false;
    }
  }, [producersRef]);

  // ── 로컬 미리보기 업데이트 ────────────────────────────────
  const updatePreview = useCallback((stream) => {
    const el = localVideoRef?.current;
    if (!el || el.srcObject === stream) return;
    el.srcObject = stream;
    el.play().catch(() => {});
    BP('06', `미리보기 업데이트 — streamId="${stream?.id}"`);
  }, [localVideoRef]);

  // ── ✅ v6 핵심: 처리 인프라 초기화 (최초 1회만) ──────────────
  //
  //  한 번 설정한 video / canvas / captureStream은 계속 재사용.
  //  mode 전환 시에도 이들을 파괴하지 않음.
  //  → rawStream 트랙의 ended 문제 원천 차단
  const ensureInfrastructure = useCallback(async (rawStream) => {
    // video: 이미 있으면 재사용
    if (!videoElRef.current) {
      BP('01', '내부 video 엘리먼트 생성');
      const video = document.createElement('video');
      // ✅ rawStream을 직접 연결 (이후 절대로 srcObject 변경 안 함)
      video.srcObject   = rawStream;
      video.autoplay    = true;
      video.playsInline = true;
      video.muted       = true;

      await new Promise(resolve => {
        video.onloadedmetadata = () => { video.play().catch(() => {}); resolve(); };
        video.onerror = resolve;
        setTimeout(resolve, 3000);
      });

      videoElRef.current = video;
      BP('01', '✅ 내부 video 준비 완료');
    }

    // canvas + captureStream: 이미 있으면 재사용
    if (!canvasRef.current || !outputStreamRef.current) {
      BP('01', 'canvas + captureStream 생성');
      const canvas = document.createElement('canvas');
      const vTrack = rawStream.getVideoTracks()[0];
      const { width = 640, height = 480 } = vTrack?.getSettings?.() || {};
      canvas.width  = width;
      canvas.height = height;
      BP('01', `캔버스: ${width}×${height}`);

      canvasRef.current       = canvas;
      outputStreamRef.current = canvas.captureStream(CANVAS_FPS);
      BP('01', `captureStream 생성 — ${CANVAS_FPS}fps`);
    }
  }, []);

  // ── 렌더링 루프 시작 ─────────────────────────────────────
  const startLoop = useCallback(async () => {
    activeRef.current = true;

    const videoEl = videoElRef.current;
    const canvas  = canvasRef.current;
    if (!videoEl || !canvas) return;

    let seg = null;
    try {
      seg = await getSegmentation();
    } catch (e) {
      BPW('01', 'MediaPipe 실패 — fallback:', e.message);
    }

    if (seg) {
      let lastResults = null;
      // ✅ onResults 매 루프 시작 시 새로 등록
      seg.onResults(r => { if (activeRef.current) lastResults = r; });

      const loop = async () => {
        if (!activeRef.current) return;
        try {
          if (videoEl.readyState >= 2) {
            await seg.send({ image: videoEl });
            composeFrame(videoEl, lastResults);
          }
        } catch (_) {
          if (activeRef.current) composeFrame(videoEl, null);
        }
        if (activeRef.current) rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);

    } else {
      // Fallback
      intervalRef.current = setInterval(() => {
        if (!activeRef.current || !videoEl || videoEl.readyState < 2) return;
        composeFrame(videoEl, null);
      }, 1000 / CANVAS_FPS);
    }

    BP('01', '✅ 렌더링 루프 시작');
  }, [composeFrame]);

  // ── 배경 모드 설정 (공개 API) ────────────────────────────
  const setBackground = useCallback(async (mode) => {
    BP('04', `setBackground — mode="${mode}"`);

    const rawStream = localStreamRef?.current;
    if (!rawStream) { BPW('04', 'rawStream 없음'); return; }

    modeRef.current = mode;
    setBackgroundMode(mode);

    if (mode === 'none') {
      // ── 배경 OFF ─────────────────────────────────────────
      stopLoop();

      // ✅ rawStream에서 live 트랙 확인
      const liveTrack = rawStream.getVideoTracks().find(t => t.readyState === 'live');
      BP('04', `none 전환 — liveTrack: ${liveTrack?.readyState ?? 'none'} (id=${liveTrack?.id?.slice(0,8) ?? 'N/A'})`);

      if (liveTrack) {
        await replaceSFUTrack(liveTrack);
      }
      // ✅ 로컬 미리보기를 rawStream으로 복원
      updatePreview(rawStream);

      // ✅ v6: video / canvas / outputStream 파괴 안 함 (트랙 ended 방지)
      //       루프만 중지하고 인프라는 유지 → 다음 배경 선택 시 재사용

      setBackgroundImageState(null);

    } else {
      // ── 배경 ON ──────────────────────────────────────────
      // 1) 인프라 준비 (이미 있으면 재사용)
      await ensureInfrastructure(rawStream);

      // 2) 루프가 중지된 경우만 재시작
      if (!activeRef.current) {
        await startLoop();
      }

      // 3) 출력 스트림을 SFU와 로컬 미리보기에 연결
      const outStream = outputStreamRef.current;
      if (outStream) {
        const outTrack = outStream.getVideoTracks()[0];
        if (outTrack) await replaceSFUTrack(outTrack);
        updatePreview(outStream);
      }
    }
  }, [
    localStreamRef, stopLoop, startLoop, ensureInfrastructure,
    replaceSFUTrack, updatePreview,
  ]);

  // ── 배경 이미지 설정 ─────────────────────────────────────
  const setBackgroundImage = useCallback(async (dataUrl) => {
    BP('05', 'setBackgroundImage 호출');
    setBackgroundImageState(dataUrl);

    // 이미지 로드
    await new Promise(resolve => {
      const img = new Image();
      img.onload  = () => { bgImageRef.current = img; BP('05', '✅ 이미지 로드 완료'); resolve(); };
      img.onerror = () => { BPE('05', '이미지 로드 실패'); bgImageRef.current = null; resolve(); };
      img.src = dataUrl;
    });

    await setBackground('image');
  }, [setBackground]);

  // ── 정리 (컴포넌트 언마운트) ─────────────────────────────
  const cleanup = useCallback(async () => {
    BP('99', 'cleanup 시작');
    stopLoop();

    const rawStream = localStreamRef?.current;
    if (rawStream) {
      const liveTrack = rawStream.getVideoTracks().find(t => t.readyState === 'live');
      if (liveTrack) {
        await replaceSFUTrack(liveTrack).catch(() => {});
      }
      updatePreview(rawStream);
    }

    // ✅ v6: video srcObject 건드리지 않음 — pause만
    if (videoElRef.current) {
      try { videoElRef.current.pause(); } catch (_) {}
      // srcObject = null 금지!
      videoElRef.current = null;
    }

    // captureStream은 참조만 해제 (stop 금지)
    outputStreamRef.current = null;
    canvasRef.current       = null;
    bgImageRef.current      = null;
    modeRef.current         = 'none';

    setBackgroundMode('none');
    setBackgroundImageState(null);
    BP('99', 'cleanup 완료');
  }, [stopLoop, replaceSFUTrack, localStreamRef, updatePreview]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (rafRef.current)      cancelAnimationFrame(rafRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { backgroundMode, backgroundImage, setBackground, setBackgroundImage, cleanup };
}