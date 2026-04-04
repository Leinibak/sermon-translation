// frontend/src/hooks/useBackgroundProcessor.js
//
// ★ 배경 처리 훅 v13 — 트랙 ended 근본 원인 완전 제거 ★
//
// ■ 핵심 설계 원칙 (v13)
//
//  1. rawStream(getUserMedia 원본) 트랙은 절대 ended되지 않아야 한다.
//     → srcObject = null 금지
//     → rawStream.getTracks().stop() 금지
//     → MediaPipe 인스턴스 GC 방지 (window.__mediapipeSeg에 고정)
//
//  2. none 전환 시 최소한의 정리만 수행한다.
//     → outputStream(canvas captureStream) 트랙만 stop
//     → videoEl, wrapperStream, MediaPipe 인스턴스는 유지
//     → 다음 배경 선택 시 재사용 → 빠른 전환, 트랙 안정성 보장
//
//  3. MediaPipe 인스턴스는 window.__mediapipeSeg에 고정 저장한다.
//     → 모듈 변수(_segInstance)는 번들러 코드 분할, HMR 등으로 초기화될 수 있음
//     → window 객체에 저장 시 페이지 생명주기 동안 절대 사라지지 않음
//     → none 전환 후 재선택 시 재로드 없이 즉시 사용 가능
//
// ■ 수정 이력
//  v13: window.__mediapipeSeg로 MediaPipe 인스턴스 영구 고정
//       none 전환 시 videoEl/wrapperStream/seg 완전 유지
//       teardownOutputStream 분리 (canvas/captureStream만 정리)
//  v12: teardownOutputStream 분리, resetSegmentationCache 제거
//  v11: srcObject=null 제거(BUG-E), readyState<2(BUG-F), onResults내 composeFrame(BUG-G)
//  v10: outputStream state 반환(BUG-A), SFU canvas track(BUG-C)

import { useRef, useState, useCallback, useEffect } from 'react';

const CANVAS_FPS  = 24;
const BLUR_AMOUNT = 14;

const BP  = (tag, ...a) => console.log(`%c[BG-${tag}]`, 'color:#9c27b0;font-weight:bold', ...a);
const BPW = (tag, ...a) => console.warn(`%c[BG-${tag}]`, 'color:#ff9800;font-weight:bold', ...a);
const BPE = (tag, ...a) => console.error(`%c[BG-${tag}]`, 'color:#f44336;font-weight:bold', ...a);

// ── MediaPipe 로더 ────────────────────────────────────────────
// window.__mediapipeSeg 에 저장 → 번들러/HMR/코드분할로 모듈 변수가
// 초기화되어도 인스턴스가 GC되지 않고 유지됨.
// GC 방지가 핵심: MediaPipe가 GC될 때 내부 WebGL이 연결된 videoEl의
// rawStream 트랙을 ended 시키는 Chrome 버그를 원천 차단.

let _segLoadingPromise = null;

async function getSegmentation() {
  // 1) 이미 window에 살아있는 인스턴스가 있으면 즉시 반환
  if (window.__mediapipeSeg) return window.__mediapipeSeg;
  // 2) 로딩 중이면 동일 Promise 반환 (중복 로드 방지)
  if (_segLoadingPromise) return _segLoadingPromise;

  _segLoadingPromise = (async () => {
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

    BP('LOAD', '✅ MediaPipe 로드 완료 (window.__mediapipeSeg 고정)');
    window.__mediapipeSeg = seg;  // GC 방지: window에 고정
    _segLoadingPromise = null;
    return seg;
  })();

  return _segLoadingPromise;
}

// ─────────────────────────────────────────────────────────────────
export function useBackgroundProcessor({ localStreamRef, producersRef, localVideoRef }) {
  const [backgroundMode,  setBackgroundMode]      = useState('none');
  const [backgroundImage, setBackgroundImageState] = useState(null);
  // outputStream을 state로 관리 → 변경 시 React 재렌더 트리거
  const [outputStream,    setOutputStream]         = useState(null);

  // ── refs ──────────────────────────────────────────────────
  const modeRef          = useRef('none');
  const bgImageRef       = useRef(null);
  const activeRef        = useRef(false);
  const loopIdRef        = useRef(0);
  const rafRef           = useRef(null);
  const intervalRef      = useRef(null);

  // videoEl, wrapperStream: none 전환 시에도 유지 → 재사용
  const videoElRef       = useRef(null);
  const wrapperStreamRef = useRef(null);
  const canvasRef        = useRef(null);
  const outputStreamRef  = useRef(null);  // 내부 동기 참조용

  // ── composeFrame ─────────────────────────────────────────
  const composeFrame = useCallback((videoEl, results) => {
    const canvas = canvasRef.current;
    if (!canvas || !videoEl) return;
    if (videoEl.readyState < 2) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const mode = modeRef.current;

    if (mode === 'none') {
      ctx.drawImage(videoEl, 0, 0, w, h);
      return;
    }

    const mask = results?.segmentationMask;

    // Step 1: 배경 레이어 — filter를 save/restore로 완전 격리
    ctx.save();
    if (mode === 'blur') {
      ctx.filter = `blur(${BLUR_AMOUNT}px)`;
      ctx.drawImage(videoEl, -4, -4, w + 8, h + 8);
    } else if (mode === 'image' && bgImageRef.current) {
      const img = bgImageRef.current;
      const s = Math.max(w / img.width, h / img.height);
      ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
    } else {
      // bgImage 아직 없으면 blur fallback
      ctx.filter = `blur(${BLUR_AMOUNT}px)`;
      ctx.drawImage(videoEl, -4, -4, w + 8, h + 8);
    }
    ctx.restore();
    ctx.filter = 'none';  // 방어적 초기화

    if (!mask) {
      // MediaPipe 준비 전: 원본 영상 표시
      ctx.drawImage(videoEl, 0, 0, w, h);
      return;
    }

    // Step 2: 인물 추출 (임시 캔버스)
    // mask: 인물=white(A=255), 배경=black(A=0) → destination-in으로 인물만 추출
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(videoEl, 0, 0, w, h);
    tCtx.globalCompositeOperation = 'destination-in';
    tCtx.drawImage(mask, 0, 0, w, h);
    tCtx.globalCompositeOperation = 'source-over';

    // Step 3: 인물 레이어를 배경 위에 합성
    ctx.drawImage(tmp, 0, 0, w, h);
  }, []);

  // ── 처리 루프 중지 ──────────────────────────────────────────
  const stopLoop = useCallback(() => {
    activeRef.current = false;
    loopIdRef.current += 1;
    if (rafRef.current)      { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current);   intervalRef.current = null; }
    BP('02', '처리 루프 중지');
  }, []);

  // ── canvas/outputStream만 정리 (none 전환 시 사용) ──────────
  // videoEl, wrapperStream, MediaPipe 인스턴스는 유지!
  const teardownOutputStream = useCallback(() => {
    if (outputStreamRef.current) {
      outputStreamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch (_) {}
      });
      outputStreamRef.current = null;
      setOutputStream(null);
      BP('02', 'outputStream(canvas captureStream) 트랙 stop 완료');
    }
    canvasRef.current = null;
    BP('02', 'canvas/outputStream 정리 완료 — videoEl/wrapper/MediaPipe 유지');
  }, []);

  // ── infrastructure 전체 정리 (언마운트 시에만 사용) ──────────
  const teardownInfrastructure = useCallback(() => {
    teardownOutputStream();

    if (videoElRef.current) {
      try { videoElRef.current.pause(); } catch (_) {}
      // srcObject = null 절대 금지 → Chrome이 rawStream 트랙을 ended 시킴
      videoElRef.current = null;
    }
    // wrapperStream 참조만 해제 (트랙 stop 안 함)
    wrapperStreamRef.current = null;

    BP('02', 'infrastructure 전체 정리 완료');
  }, [teardownOutputStream]);

  // ── SFU producer 트랙 교체 ────────────────────────────────
  const replaceSFUTrack = useCallback(async (newTrack, kind = 'video') => {
    if (!newTrack || newTrack.readyState === 'ended') {
      BPW('03', `replaceSFUTrack: 트랙 없음/ended — 생략 (readyState=${newTrack?.readyState})`);
      return false;
    }
    const vp = producersRef?.current?.get(kind);
    if (!vp || vp.closed) {
      BPW('03', `replaceSFUTrack: ${kind} producer 없음 — 생략`);
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
    if (!el || !stream) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
      BP('06', `미리보기 업데이트 — streamId="${stream?.id}"`);
    }
  }, [localVideoRef]);

  // ── infrastructure 초기화 ────────────────────────────────────
  const ensureInfrastructure = useCallback(async (rawStream) => {
    const rawVideoTracks = rawStream.getVideoTracks();
    const liveTracks = rawVideoTracks.filter(t => t.readyState === 'live');

    if (liveTracks.length === 0) {
      BPW('01', '⚠ rawStream 모든 트랙 ended — ensureInfrastructure 중단');
      return false;
    }

    const rawLive = liveTracks[0];

    // videoEl의 현재 srcObject 트랙과 rawLive 비교 → 동일하면 재사용
    const videoElTracks = videoElRef.current?.srcObject?.getVideoTracks() || [];
    const videoElLive   = videoElTracks.find(t => t.readyState === 'live');
    const needsRebuild  = !videoElRef.current || !videoElLive || videoElLive.id !== rawLive.id;

    if (needsRebuild) {
      BP('01', `videoEl 재생성 — videoElTrack=${videoElLive?.id?.slice(0,8) ?? 'none'} rawTrack=${rawLive.id.slice(0,8)}`);

      if (videoElRef.current) {
        try { videoElRef.current.pause(); } catch (_) {}
        // srcObject = null 금지
        videoElRef.current = null;
      }
      wrapperStreamRef.current = null;

      const video = document.createElement('video');
      // rawStream 트랙을 공유하는 래퍼 스트림 — 래퍼가 null이 돼도 원본 트랙 보호
      const wrapper = new MediaStream(rawStream.getTracks());
      wrapperStreamRef.current = wrapper;

      video.srcObject   = wrapper;
      video.autoplay    = true;
      video.playsInline = true;
      video.muted       = true;

      video.play().catch(() => {});
      await new Promise((resolve) => {
        if (video.readyState >= 2) { resolve(); return; }
        const onReady = () => {
          video.removeEventListener('canplay', onReady);
          video.removeEventListener('loadeddata', onReady);
          resolve();
        };
        video.addEventListener('canplay', onReady);
        video.addEventListener('loadeddata', onReady);
        setTimeout(resolve, 3000);
      });

      videoElRef.current = video;
      BP('01', `✅ videoEl 준비 완료 — readyState=${video.readyState}`);
    } else {
      BP('01', `videoEl 재사용 — track id=${videoElLive.id.slice(0,8)}`);
    }

    // canvas + captureStream 재생성 필요 여부 확인
    const needsCanvas = !canvasRef.current
      || !outputStreamRef.current
      || outputStreamRef.current.getVideoTracks().some(t => t.readyState === 'ended');

    if (needsCanvas) {
      if (outputStreamRef.current) {
        outputStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
        outputStreamRef.current = null;
        setOutputStream(null);
      }

      const canvas = document.createElement('canvas');
      const { width = 640, height = 480 } = rawLive?.getSettings?.() || {};
      canvas.width  = width;
      canvas.height = height;
      BP('01', `캔버스 생성: ${width}×${height}`);

      const newCaptureStream  = canvas.captureStream(CANVAS_FPS);
      canvasRef.current       = canvas;
      outputStreamRef.current = newCaptureStream;
      setOutputStream(newCaptureStream);
      BP('01', `captureStream 생성 — ${CANVAS_FPS}fps`);
    } else {
      BP('01', 'canvas/captureStream 재사용');
    }

    return true;
  }, []);

  // ── 렌더링 루프 시작 ─────────────────────────────────────
  const startLoop = useCallback(async () => {
    const myLoopId = loopIdRef.current;
    activeRef.current = true;

    // window.__mediapipeSeg 우선 확인 → 없으면 로드
    let seg = window.__mediapipeSeg;
    if (!seg) {
      try {
        seg = await getSegmentation();
        if (loopIdRef.current !== myLoopId) {
          BP('01', `루프 ${myLoopId} 취소됨 (세대 불일치)`);
          return;
        }
      } catch (e) {
        BPW('01', 'MediaPipe 실패 — fallback:', e.message);
      }
    } else {
      BP('01', 'MediaPipe 재사용 (window.__mediapipeSeg)');
    }

    if (!videoElRef.current || !canvasRef.current) {
      BPW('01', '루프 시작 취소 — videoEl 또는 canvas 없음');
      return;
    }

    if (seg) {
      // onResults 콜백에서 직접 composeFrame 호출
      // (seg.send Promise가 onResults 이전에 resolve되는 타이밍 문제 해결)
      seg.onResults(results => {
        if (!activeRef.current || loopIdRef.current !== myLoopId) return;
        const videoEl = videoElRef.current;
        if (videoEl && videoEl.readyState >= 2) {
          composeFrame(videoEl, results);
        }
      });

      const loop = async () => {
        if (!activeRef.current || loopIdRef.current !== myLoopId) return;

        const videoEl = videoElRef.current;
        const canvas  = canvasRef.current;
        if (!videoEl || !canvas) return;

        // readyState < 2 이면 다음 프레임에서 재시도
        if (videoEl.readyState < 2) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }

        try {
          await seg.send({ image: videoEl });
        } catch (_) {
          // send 실패 시 mask 없이 fallback 렌더
          if (activeRef.current && loopIdRef.current === myLoopId) {
            const v = videoElRef.current;
            if (v && v.readyState >= 2) composeFrame(v, null);
          }
        }

        if (activeRef.current && loopIdRef.current === myLoopId) {
          rafRef.current = requestAnimationFrame(loop);
        }
      };
      rafRef.current = requestAnimationFrame(loop);

    } else {
      // MediaPipe 없을 때 setInterval fallback
      intervalRef.current = setInterval(() => {
        if (!activeRef.current || loopIdRef.current !== myLoopId) {
          clearInterval(intervalRef.current);
          return;
        }
        const videoEl = videoElRef.current;
        if (!videoEl || videoEl.readyState < 2) return;
        composeFrame(videoEl, null);
      }, 1000 / CANVAS_FPS);
    }

    BP('01', '✅ 렌더링 루프 시작');
  }, [composeFrame]);

  // ── 안전한 rawStream 획득 ────────────────────────────────
  const getOrRefreshRawStream = useCallback(async () => {
    const rawStream = localStreamRef?.current;
    if (!rawStream) { BPW('04', 'rawStream 없음'); return null; }

    const liveTracks = rawStream.getVideoTracks().filter(t => t.readyState === 'live');
    if (liveTracks.length > 0) return rawStream;

    BPW('04', '트랙 ended — getLocalMedia 재호출 후 재시도');
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = newStream;
      BP('04', `새 stream 획득 — id=${newStream.id}`);

      const newAudioTrack = newStream.getAudioTracks()[0];
      if (newAudioTrack) {
        const ap = producersRef?.current?.get('audio');
        if (ap && !ap.closed) {
          try {
            await ap.replaceTrack({ track: newAudioTrack });
            BP('04', '✅ audio producer 트랙 교체 완료');
          } catch (e) {
            BPW('04', 'audio producer 트랙 교체 실패:', e.message);
          }
        }
      }
      return newStream;
    } catch (e) {
      BPE('04', '미디어 재획득 실패:', e.message);
      return null;
    }
  }, [localStreamRef, producersRef]);

  // ── 배경 모드 설정 (공개 API) ────────────────────────────
  const setBackground = useCallback(async (mode) => {
    BP('04', `setBackground — mode="${mode}"`);

    modeRef.current = mode;
    setBackgroundMode(mode);

    if (mode === 'none') {
      // ── 배경 OFF ─────────────────────────────────────────
      stopLoop();

      const rawStream = await getOrRefreshRawStream();
      if (rawStream) {
        const liveTrack = rawStream.getVideoTracks().find(t => t.readyState === 'live');
        BP('04', `none 전환 — liveTrack: ${liveTrack?.readyState ?? 'none'} (id=${liveTrack?.id?.slice(0,8) ?? 'N/A'})`);

        if (liveTrack) {
          await replaceSFUTrack(liveTrack, 'video');
          updatePreview(rawStream);
        } else {
          BPW('04', 'liveTrack 없음 — 미리보기 복원 시도');
          const el = localVideoRef?.current;
          if (el) { el.srcObject = rawStream; el.play().catch(() => {}); }
        }
      }

      // canvas/captureStream만 정리 — videoEl/wrapper/MediaPipe 유지!
      teardownOutputStream();
      setBackgroundImageState(null);

    } else {
      // ── 배경 ON (blur / image) ──────────────────────────
      const rawStream = await getOrRefreshRawStream();
      if (!rawStream) return;

      const ok = await ensureInfrastructure(rawStream);
      if (!ok) return;

      stopLoop();
      await startLoop();

      const outStream = outputStreamRef.current;
      if (outStream) {
        const outTrack = outStream.getVideoTracks().find(t => t.readyState === 'live');
        if (outTrack) {
          await replaceSFUTrack(outTrack, 'video');
        } else {
          BPW('04', 'outputStream track ended — 강제 재생성');
          teardownInfrastructure();
          const ok2 = await ensureInfrastructure(rawStream);
          if (ok2) {
            await startLoop();
            const t2 = outputStreamRef.current?.getVideoTracks().find(t => t.readyState === 'live');
            if (t2) await replaceSFUTrack(t2, 'video');
          }
        }
        if (outputStreamRef.current) updatePreview(outputStreamRef.current);
      }
    }
  }, [
    stopLoop, startLoop, ensureInfrastructure,
    teardownInfrastructure, teardownOutputStream,
    replaceSFUTrack, updatePreview,
    localVideoRef, getOrRefreshRawStream,
  ]);

  // ── 배경 이미지 설정 ─────────────────────────────────────
  const setBackgroundImage = useCallback(async (dataUrl) => {
    BP('05', 'setBackgroundImage 호출');
    setBackgroundImageState(dataUrl);

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
      if (liveTrack) await replaceSFUTrack(liveTrack, 'video').catch(() => {});
      updatePreview(rawStream);
    }

    teardownInfrastructure();

    bgImageRef.current = null;
    modeRef.current    = 'none';
    // window.__mediapipeSeg은 유지 (페이지 새로고침 전까지 재사용)

    setBackgroundMode('none');
    setBackgroundImageState(null);
    BP('99', 'cleanup 완료');
  }, [stopLoop, teardownInfrastructure, replaceSFUTrack, localStreamRef, updatePreview]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      loopIdRef.current += 1;
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
    outputStream,      // state — React 재렌더 트리거용
    outputStreamRef,   // ref — 내부 동기 참조용
  };
}