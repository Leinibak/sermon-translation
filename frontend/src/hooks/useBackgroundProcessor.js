// frontend/src/hooks/useBackgroundProcessor.js
//
// ★ 배경 처리 훅 v17 — none→blur 검은 화면 버그 수정 ★
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [BUG-T] ★★★ none 선택 후 blur 재선택 시 검은 화면 (v16 잔류 버그)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  ■ 원인 1: getOrRefreshRawStream() 이 rawStream 트랙 전체를 stop() 한 뒤
//    localStreamRef.current = newStream 으로 새 stream 을 할당하지만,
//    videoElRef.current / wrapperStreamRef.current 는 그대로 남아 있음.
//    → 이후 ensureInfrastructure() 의 "videoEl 재사용" 체크가
//      wrapperStream 안의 ended 트랙을 live 로 오판하거나,
//      새 rawLive.id 와 불일치하여 needsRebuild=true 가 되더라도
//      내부 상태가 꼬인 채로 진행됨.
//
//  ■ 원인 2: none 전환 시 teardownOutputStream() 이 canvas captureStream
//    트랙만 stop 하고 videoEl / wrapperStream 은 "유지" 함.
//    그런데 getOrRefreshRawStream() 이 rawStream.getTracks().forEach(stop)
//    을 먼저 실행하면 wrapperStream 안의 동일 트랙 객체도 ended 됨.
//    → 다음 blur 선택 시 videoEl.srcObject 의 트랙이 ended 상태 → 검은 화면.
//
//  ■ 수정:
//    (1) getOrRefreshRawStream() 에서 newStream 재획득 시
//        즉시 videoElRef / wrapperStreamRef 를 null 로 무효화.
//        → ensureInfrastructure() 가 항상 needsRebuild=true 로 판단,
//          새 stream 의 트랙으로 videoEl 을 올바르게 재생성.
//
//    (2) setBackground('none') 에서 teardownOutputStream() 호출 후
//        videoElRef / wrapperStreamRef 도 함께 정리.
//        → 다음 blur/image 선택 시 stale videoEl 이 남지 않음.
//
//    (3) none 전환 시 callId 체크를 teardown 직전에 한 번 더 수행하여
//        경쟁 조건(race condition) 방어.
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 수정 이력
//  v17: [BUG-T] getOrRefreshRawStream 에서 videoEl/wrapper 즉시 무효화,
//               none 전환 시 videoEl/wrapper 추가 정리,
//               none teardown 직전 callId 재확인
//  v16: [BUG-S] waitForFirstFrame() 독립 분리, stopLoop에서 firstFrame 제거
//  v15: [BUG-K][BUG-N] canvas 재사용, firstFrameDrawn 후 SFU replace
//       [BUG-M] 이미지 로드 실패 시 이전 bgImage 유지
//       [BUG-O] 배경 ON 완료 시 outputStream 으로 preview 보장
//  v14: [BUG-J] 카메라 이중 점유 해제, callId race condition 가드
//  v13: window.__mediapipeSeg 고정, none 전환 시 videoEl 유지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useRef, useState, useCallback, useEffect } from 'react';

const CANVAS_FPS  = 24;
const BLUR_AMOUNT = 14;

const BP  = (tag, ...a) => console.log(`%c[BG-${tag}]`, 'color:#9c27b0;font-weight:bold', ...a);
const BPW = (tag, ...a) => console.warn(`%c[BG-${tag}]`, 'color:#ff9800;font-weight:bold', ...a);
const BPE = (tag, ...a) => console.error(`%c[BG-${tag}]`, 'color:#f44336;font-weight:bold', ...a);

// ── MediaPipe 로더 ────────────────────────────────────────────
let _segLoadingPromise = null;

async function getSegmentation() {
  if (window.__mediapipeSeg) return window.__mediapipeSeg;
  if (_segLoadingPromise)    return _segLoadingPromise;

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
    window.__mediapipeSeg = seg;
    _segLoadingPromise = null;
    return seg;
  })();

  return _segLoadingPromise;
}

// ─────────────────────────────────────────────────────────────────
export function useBackgroundProcessor({ localStreamRef, producersRef, localVideoRef }) {
  const [backgroundMode,  setBackgroundMode]      = useState('none');
  const [backgroundImage, setBackgroundImageState] = useState(null);
  const [outputStream,    setOutputStream]         = useState(null);

  // ── refs ──────────────────────────────────────────────────
  const modeRef                = useRef('none');
  const bgImageRef             = useRef(null);
  const activeRef              = useRef(false);
  const loopIdRef              = useRef(0);
  const rafRef                 = useRef(null);
  const intervalRef            = useRef(null);
  const setBackgroundCallIdRef = useRef(0);

  // [BUG-S] firstFrameResolveRef 는 waitForFirstFrame() 전용.
  //         stopLoop() 는 이 ref 를 절대 건드리지 않음.
  const firstFrameResolveRef = useRef(null);

  const videoElRef       = useRef(null);
  const wrapperStreamRef = useRef(null);
  const canvasRef        = useRef(null);
  const outputStreamRef  = useRef(null);

  // ── composeFrame ─────────────────────────────────────────
  const composeFrame = useCallback((videoEl, results) => {
    const canvas = canvasRef.current;
    if (!canvas || !videoEl) return;
    if (videoEl.readyState < 2) return;

    const ctx  = canvas.getContext('2d');
    const w    = canvas.width;
    const h    = canvas.height;
    const mode = modeRef.current;

    // [BUG-S] 첫 프레임이 실제로 그려질 때 waitForFirstFrame Promise resolve
    if (firstFrameResolveRef.current) {
      const resolve = firstFrameResolveRef.current;
      firstFrameResolveRef.current = null;
      Promise.resolve().then(resolve);
    }

    if (mode === 'none') {
      ctx.drawImage(videoEl, 0, 0, w, h);
      return;
    }

    const mask = results?.segmentationMask;

    // Step 1: 배경 레이어 — filter 를 save/restore 로 완전 격리
    ctx.save();
    ctx.filter = 'none';
    if (mode === 'blur') {
      ctx.filter = `blur(${BLUR_AMOUNT}px)`;
      ctx.drawImage(videoEl, -4, -4, w + 8, h + 8);
    } else if (mode === 'image' && bgImageRef.current) {
      ctx.filter = 'none';
      const img = bgImageRef.current;
      const s   = Math.max(w / img.width, h / img.height);
      const dx  = (w - img.width  * s) / 2;
      const dy  = (h - img.height * s) / 2;
      ctx.drawImage(img, dx, dy, img.width * s, img.height * s);
    } else {
      ctx.filter = `blur(${BLUR_AMOUNT}px)`;
      ctx.drawImage(videoEl, -4, -4, w + 8, h + 8);
    }
    ctx.restore();
    ctx.filter = 'none'; // Chrome 잔류 filter 방어

    if (!mask) {
      ctx.drawImage(videoEl, 0, 0, w, h);
      return;
    }

    // Step 2: 인물 추출
    const tmp  = document.createElement('canvas');
    tmp.width  = w;
    tmp.height = h;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(videoEl, 0, 0, w, h);
    tCtx.globalCompositeOperation = 'destination-in';
    tCtx.drawImage(mask, 0, 0, w, h);
    tCtx.globalCompositeOperation = 'source-over';

    // Step 3: 인물을 배경 위에 합성
    ctx.drawImage(tmp, 0, 0, w, h);
  }, []);

  // ── [BUG-S] waitForFirstFrame — stopLoop/startLoop 과 완전 독립 ──
  // 다음 composeFrame() 이 실제로 실행될 때까지 대기.
  // maxWait ms 초과 시 자동 resolve (안전망).
  const waitForFirstFrame = useCallback((maxWait = 800) => {
    // 이전 대기 중인 Promise 가 있으면 즉시 해제
    if (firstFrameResolveRef.current) {
      firstFrameResolveRef.current();
      firstFrameResolveRef.current = null;
    }
    return new Promise(resolve => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (firstFrameResolveRef.current === wrappedResolve) {
            firstFrameResolveRef.current = null;
          }
          BP('01', `waitForFirstFrame timeout (${maxWait}ms) — 강제 진행`);
          resolve();
        }
      }, maxWait);

      const wrappedResolve = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          BP('01', '✅ 첫 프레임 확인');
          resolve();
        }
      };
      firstFrameResolveRef.current = wrappedResolve;
    });
  }, []);

  // ── 처리 루프 중지 ──────────────────────────────────────────
  // [BUG-S] firstFrameResolveRef 를 건드리지 않음!
  const stopLoop = useCallback(() => {
    activeRef.current  = false;
    loopIdRef.current += 1;
    if (rafRef.current)      { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current);   intervalRef.current = null; }
    BP('02', '처리 루프 중지');
  }, []);

  // ── canvas/outputStream 만 정리 (none 전환 시) ──────────────
  const teardownOutputStream = useCallback(() => {
    if (outputStreamRef.current) {
      outputStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
      outputStreamRef.current = null;
      setOutputStream(null);
      BP('02', 'outputStream(canvas captureStream) 트랙 stop 완료');
    }
    canvasRef.current = null;
    BP('02', 'canvas/outputStream 정리 완료 — videoEl/wrapper/MediaPipe 유지');
  }, []);

  // ── infrastructure 전체 정리 (언마운트 시에만) ────────────────
  const teardownInfrastructure = useCallback(() => {
    teardownOutputStream();
    if (videoElRef.current) {
      try { videoElRef.current.pause(); } catch (_) {}
      videoElRef.current = null;
    }
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
      BP('03', `✅ SFU 트랙 교체 완료 — kind=${newTrack.kind} id=${newTrack.id.slice(0, 8)}`);
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
    const liveTracks = rawStream.getVideoTracks().filter(t => t.readyState === 'live');

    if (liveTracks.length === 0) {
      BPW('01', '⚠ rawStream 모든 트랙 ended — ensureInfrastructure 중단');
      return false;
    }

    const rawLive = liveTracks[0];

    const videoElTracks = videoElRef.current?.srcObject?.getVideoTracks() || [];
    const videoElLive   = videoElTracks.find(t => t.readyState === 'live');
    const needsRebuild  = !videoElRef.current || !videoElLive || videoElLive.id !== rawLive.id;

    if (needsRebuild) {
      BP('01', `videoEl 재생성 — videoElTrack=${videoElLive?.id?.slice(0, 8) ?? 'none'} rawTrack=${rawLive.id.slice(0, 8)}`);

      if (videoElRef.current) {
        try { videoElRef.current.pause(); } catch (_) {}
        videoElRef.current = null;
      }
      wrapperStreamRef.current = null;

      const video   = document.createElement('video');
      const wrapper = new MediaStream(rawStream.getTracks());
      wrapperStreamRef.current = wrapper;

      video.srcObject   = wrapper;
      video.autoplay    = true;
      video.playsInline = true;
      video.muted       = true;

      video.play().catch(() => {});
      await new Promise(resolve => {
        if (video.readyState >= 2) { resolve(); return; }
        const onReady = () => {
          video.removeEventListener('canplay',    onReady);
          video.removeEventListener('loadeddata', onReady);
          resolve();
        };
        video.addEventListener('canplay',    onReady);
        video.addEventListener('loadeddata', onReady);
        setTimeout(resolve, 3000);
      });

      videoElRef.current = video;
      BP('01', `✅ videoEl 준비 완료 — readyState=${video.readyState}`);
    } else {
      BP('01', `videoEl 재사용 — track id=${videoElLive.id.slice(0, 8)}`);
    }

    const needsCanvas = !canvasRef.current
      || !outputStreamRef.current
      || outputStreamRef.current.getVideoTracks().some(t => t.readyState === 'ended');

    if (needsCanvas) {
      if (outputStreamRef.current) {
        outputStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
        outputStreamRef.current = null;
        setOutputStream(null);
      }

      const canvas               = document.createElement('canvas');
      const { width = 640, height = 480 } = rawLive?.getSettings?.() || {};
      canvas.width               = width;
      canvas.height              = height;
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
  // [BUG-S] firstFrame 관리 없음. waitForFirstFrame() 를 외부에서 호출.
  const startLoop = useCallback(async () => {
    const myLoopId    = loopIdRef.current;
    activeRef.current = true;

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

        if (videoEl.readyState < 2) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }

        try {
          await seg.send({ image: videoEl });
        } catch (_) {
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
  // [BUG-T] 수정: newStream 재획득 시 videoElRef/wrapperStreamRef 즉시 무효화.
  //   rawStream.getTracks().forEach(stop) 으로 wrapperStream 내 트랙도 ended 되므로
  //   videoEl 을 그대로 유지하면 ensureInfrastructure 에서 ended 트랙을 재사용하는
  //   문제가 발생함. null 로 초기화하여 needsRebuild=true 를 보장.
  const getOrRefreshRawStream = useCallback(async () => {
    const rawStream = localStreamRef?.current;
    if (!rawStream) { BPW('04', 'rawStream 없음'); return null; }

    const liveTracks = rawStream.getVideoTracks().filter(t => t.readyState === 'live');
    if (liveTracks.length > 0) return rawStream;

    BPW('04', '트랙 ended — getUserMedia 재호출');
    try {
      rawStream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
      BP('04', '기존 stream 트랙 stop 완료');

      // ★ [BUG-T] 수정 (1): stream 교체 전 videoEl/wrapper 즉시 무효화
      //   rawStream 트랙이 stop 되면 wrapperStream 안의 동일 트랙도 ended 됨.
      //   videoElRef 를 null 로 초기화해야 ensureInfrastructure 가
      //   needsRebuild=true 로 판단하여 새 videoEl 을 올바르게 생성함.
      if (videoElRef.current) {
        try { videoElRef.current.pause(); } catch (_) {}
        videoElRef.current = null;
        BP('04', 'videoElRef 무효화 (stream 교체 전)');
      }
      wrapperStreamRef.current = null;

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
    const callId = ++setBackgroundCallIdRef.current;
    BP('04', `setBackground — mode="${mode}" callId=${callId}`);

    modeRef.current = mode;
    setBackgroundMode(mode);

    if (mode === 'none') {
      // ── 배경 OFF ─────────────────────────────────────────
      stopLoop();

      const rawStream = await getOrRefreshRawStream();

      if (callId !== setBackgroundCallIdRef.current) {
        BP('04', `setBackground none callId=${callId} 취소`);
        return;
      }

      if (rawStream) {
        const liveTrack = rawStream.getVideoTracks().find(t => t.readyState === 'live');
        BP('04', `none 전환 — liveTrack: ${liveTrack?.readyState ?? 'none'}`);

        if (liveTrack) {
          await replaceSFUTrack(liveTrack, 'video');
          updatePreview(rawStream);
        } else {
          BPW('04', 'liveTrack 없음 — 미리보기 복원 시도');
          const el = localVideoRef?.current;
          if (el) { el.srcObject = rawStream; el.play().catch(() => {}); }
        }
      }

      // ★ [BUG-T] 수정 (3): teardown 직전 callId 재확인 (경쟁 조건 방어)
      if (callId !== setBackgroundCallIdRef.current) {
        BP('04', `setBackground none callId=${callId} 취소 (teardown 직전)`);
        return;
      }

      teardownOutputStream();

      // ★ [BUG-T] 수정 (2): none 전환 시 videoEl/wrapper 도 함께 정리.
      //   getOrRefreshRawStream 이 이미 무효화했을 수 있으나,
      //   rawStream 트랙이 live 상태로 재획득 없이 통과한 경우에도
      //   wrapperStream 내 트랙이 teardownOutputStream 후 inconsistent 상태가
      //   될 수 있으므로 항상 초기화하여 다음 blur 선택 시 깨끗하게 재생성.
      if (videoElRef.current) {
        try { videoElRef.current.pause(); } catch (_) {}
        videoElRef.current = null;
        BP('02', 'videoElRef 정리 (none 전환)');
      }
      wrapperStreamRef.current = null;

      setBackgroundImageState(null);

    } else {
      // ── 배경 ON (blur / image) ──────────────────────────
      const rawStream = await getOrRefreshRawStream();

      if (callId !== setBackgroundCallIdRef.current) {
        BP('04', `setBackground ${mode} callId=${callId} 취소`);
        return;
      }

      if (!rawStream) return;

      const ok = await ensureInfrastructure(rawStream);

      if (callId !== setBackgroundCallIdRef.current) {
        BP('04', `setBackground ${mode} callId=${callId} 취소 (ensureInfra 후)`);
        return;
      }

      if (!ok) return;

      // [BUG-S] stopLoop → startLoop. waitForFirstFrame 은 이 다음에 별도 호출.
      stopLoop();
      await startLoop();

      if (callId !== setBackgroundCallIdRef.current) {
        BP('04', `setBackground ${mode} callId=${callId} 취소 (startLoop 후)`);
        return;
      }

      const outStream = outputStreamRef.current;
      if (outStream) {
        const outTrack = outStream.getVideoTracks().find(t => t.readyState === 'live');
        if (outTrack) {
          // [BUG-S] startLoop() 완료 후 waitForFirstFrame() 별도 호출
          //         → canvas 에 첫 픽셀이 실제로 그려진 뒤 SFU replace
          BP('04', '첫 프레임 대기 중...');
          await waitForFirstFrame(800);

          if (callId !== setBackgroundCallIdRef.current) {
            BP('04', `setBackground ${mode} callId=${callId} 취소 (firstFrame 후)`);
            return;
          }

          await replaceSFUTrack(outTrack, 'video');
        } else {
          BPW('04', 'outputStream track ended — 강제 재생성');
          teardownInfrastructure();
          const ok2 = await ensureInfrastructure(rawStream);
          if (ok2) {
            await startLoop();
            await waitForFirstFrame(800);
            const t2 = outputStreamRef.current?.getVideoTracks().find(t => t.readyState === 'live');
            if (t2) await replaceSFUTrack(t2, 'video');
          }
        }

        // [BUG-O] 로컬 미리보기 반드시 outputStream 으로 갱신
        if (outputStreamRef.current) {
          updatePreview(outputStreamRef.current);
        }
      }
    }
  }, [
    stopLoop, startLoop, waitForFirstFrame, ensureInfrastructure,
    teardownInfrastructure, teardownOutputStream,
    replaceSFUTrack, updatePreview,
    localVideoRef, getOrRefreshRawStream,
  ]);

  // ── 배경 이미지 설정 ─────────────────────────────────────
  const setBackgroundImage = useCallback(async (dataUrl) => {
    BP('05', 'setBackgroundImage 호출');
    setBackgroundImageState(dataUrl);

    const prevBgImage = bgImageRef.current;
    const loaded = await new Promise(resolve => {
      const img   = new Image();
      img.onload  = () => { bgImageRef.current = img; BP('05', '✅ 이미지 로드 완료'); resolve(true); };
      img.onerror = () => {
        BPE('05', '이미지 로드 실패 — 이전 이미지 유지');
        bgImageRef.current = prevBgImage;
        resolve(false);
      };
      img.src = dataUrl;
    });

    if (!loaded && !prevBgImage) {
      BP('05', '이미지 로드 실패 + 이전 이미지 없음 → blur fallback');
      await setBackground('blur');
      return;
    }

    await setBackground('image');
  }, [setBackground]);

  // ── 정리 (컴포넌트 언마운트) ─────────────────────────────
  const cleanup = useCallback(async () => {
    BP('99', 'cleanup 시작');
    stopLoop();

    if (firstFrameResolveRef.current) {
      firstFrameResolveRef.current();
      firstFrameResolveRef.current = null;
    }

    const rawStream = localStreamRef?.current;
    if (rawStream) {
      const liveTrack = rawStream.getVideoTracks().find(t => t.readyState === 'live');
      if (liveTrack) await replaceSFUTrack(liveTrack, 'video').catch(() => {});
      updatePreview(rawStream);
    }

    teardownInfrastructure();

    bgImageRef.current = null;
    modeRef.current    = 'none';

    setBackgroundMode('none');
    setBackgroundImageState(null);
    BP('99', 'cleanup 완료');
  }, [stopLoop, teardownInfrastructure, replaceSFUTrack, localStreamRef, updatePreview]);

  useEffect(() => {
    return () => {
      activeRef.current  = false;
      loopIdRef.current += 1;
      if (rafRef.current)      cancelAnimationFrame(rafRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (firstFrameResolveRef.current) {
        firstFrameResolveRef.current();
        firstFrameResolveRef.current = null;
      }
    };
  }, []);

  return {
    backgroundMode,
    backgroundImage,
    setBackground,
    setBackgroundImage,
    cleanup,
    outputStream,
    outputStreamRef,
  };
}