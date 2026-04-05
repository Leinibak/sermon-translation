// frontend/src/hooks/useBackgroundProcessor.js
//
// ★ 배경 처리 훅 v15 — blur↔image↔파일업로드 전환 완전 수정 ★
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [BUG-K] blur → image 전환 시 영상 소실
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ■ 원인: setBackground('image') 호출 시 stopLoop() 후
//          ensureInfrastructure() 가 needsCanvas 조건에서
//          이전 captureStream 을 stop 하고 새 canvas 를 만듦.
//          이때 startLoop() 가 아직 시작 전인데
//          replaceSFUTrack 을 곧바로 호출하므로
//          outTrack 이 ended 상태로 SFU 에 전달됨.
//  ■ 수정: blur → image 는 동일한 canvas/outputStream 을 재사용
//          (teardownOutputStream 미호출). 루프만 재시작.
//          SFU replaceTrack 은 루프가 첫 프레임을 그린 후 호출.
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [BUG-M] image 모드에서 bgImageRef 가 null 인 채로 첫 프레임 렌더
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ■ 원인: setBackgroundImage() 에서 img.onload 콜백이 비동기라
//          startLoop() 보다 늦게 실행될 수 있음.
//          첫 몇 프레임에 bgImageRef.current = null 이어서
//          blur fallback 으로 렌더되다가 급격히 전환.
//  ■ 수정: setBackgroundImage() 에서 이미지 로드 완료를 확실히 await
//          한 뒤 setBackground('image') 호출. (기존과 동일하나
//          로드 실패 시에도 이미지 없는 blur fallback이 아닌
//          이전 bgImageRef 를 유지하도록 처리.)
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [BUG-N] blur/image 전환 시 SFU replaceTrack 타이밍 문제
//         → 상대방 화면이 검거나 멈추는 현상
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ■ 원인: stopLoop() → startLoop() (비동기) 완료 전에
//          outputStreamRef.current 의 track 을 replaceSFUTrack 호출.
//          MediaPipe seg.send() 가 아직 첫 onResults 를 firing 하기
//          전이므로 canvas 에 아무것도 그려지지 않은 상태.
//  ■ 수정: startLoop() 완료 후 첫 프레임이 실제로 그려졌음을
//          확인(firstFrameDrawn Promise)한 뒤 replaceSFUTrack.
//          blur 모드는 MediaPipe 없이도 즉시 렌더되므로 1프레임만 대기.
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [BUG-O] none → image/blur 전환 후 로컬 미리보기가 rawStream 으로 복귀
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ■ 원인: updatePreview 가 outputStream 이 아닌 rawStream 을 받는 경우
//  ■ 수정: 배경 ON 전환 완료 후 항상 outputStreamRef.current 로 preview
//
// ■ 수정 이력
//  v15: [BUG-K][BUG-N] blur↔image 는 canvas 재사용, firstFrameDrawn 후 SFU replace
//       [BUG-M] setBackgroundImage 이미지 로드 실패 시 이전 bgImage 유지
//       [BUG-O] 배경 ON 완료 시 outputStream 으로 preview 보장
//  v14: [BUG-J] 카메라 이중 점유 해제, callId race condition 가드
//  v13: window.__mediapipeSeg 고정, none 전환 시 videoEl 유지
//  v12: teardownOutputStream 분리
//  v11: srcObject=null 제거(BUG-E), readyState<2(BUG-F)
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
let _segLoadingPromise = null;

async function getSegmentation() {
  if (window.__mediapipeSeg) return window.__mediapipeSeg;
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
  // outputStream state → 변경 시 React 재렌더 트리거 (BUG-A fix)
  const [outputStream,    setOutputStream]         = useState(null);

  // ── refs ──────────────────────────────────────────────────
  const modeRef               = useRef('none');
  const bgImageRef            = useRef(null);
  const activeRef             = useRef(false);
  const loopIdRef             = useRef(0);
  const rafRef                = useRef(null);
  const intervalRef           = useRef(null);
  // [BUG-J] callId race condition guard
  const setBackgroundCallIdRef = useRef(0);

  // [BUG-N] 첫 프레임 draw 완료 알림용
  const firstFrameResolveRef  = useRef(null);

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

    // [BUG-N] 첫 프레임 resolve
    if (firstFrameResolveRef.current) {
      const resolve = firstFrameResolveRef.current;
      firstFrameResolveRef.current = null;
      // resolve 는 이 frame 직후에 호출 (동기적으로)
      setTimeout(resolve, 0);
    }

    if (mode === 'none') {
      ctx.drawImage(videoEl, 0, 0, w, h);
      return;
    }

    const mask = results?.segmentationMask;

    // Step 1: 배경 레이어 — filter 를 save/restore 로 완전 격리
    ctx.save();
    ctx.filter = 'none'; // 방어적 초기화 (이전 상태 오염 방지)
    if (mode === 'blur') {
      ctx.filter = `blur(${BLUR_AMOUNT}px)`;
      ctx.drawImage(videoEl, -4, -4, w + 8, h + 8);
    } else if (mode === 'image' && bgImageRef.current) {
      ctx.filter = 'none';
      const img = bgImageRef.current;
      const s = Math.max(w / img.width, h / img.height);
      const dx = (w - img.width  * s) / 2;
      const dy = (h - img.height * s) / 2;
      ctx.drawImage(img, dx, dy, img.width * s, img.height * s);
    } else {
      // image 모드인데 bgImage 아직 없으면 blur fallback
      ctx.filter = `blur(${BLUR_AMOUNT}px)`;
      ctx.drawImage(videoEl, -4, -4, w + 8, h + 8);
    }
    ctx.restore();
    // ★ restore 후 반드시 filter none 재설정 — Chrome 버그 방어
    ctx.filter = 'none';

    if (!mask) {
      // MediaPipe 준비 전: 원본 영상 표시
      ctx.drawImage(videoEl, 0, 0, w, h);
      return;
    }

    // Step 2: 인물 추출 (임시 캔버스)
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
    // 대기 중인 firstFrame promise 도 해제
    if (firstFrameResolveRef.current) {
      firstFrameResolveRef.current();
      firstFrameResolveRef.current = null;
    }
    BP('02', '처리 루프 중지');
  }, []);

  // ── canvas/outputStream 만 정리 (none 전환 시) ──────────────
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

    // videoEl 재사용 여부 확인
    const videoElTracks = videoElRef.current?.srcObject?.getVideoTracks() || [];
    const videoElLive   = videoElTracks.find(t => t.readyState === 'live');
    const needsRebuild  = !videoElRef.current || !videoElLive || videoElLive.id !== rawLive.id;

    if (needsRebuild) {
      BP('01', `videoEl 재생성 — videoElTrack=${videoElLive?.id?.slice(0,8) ?? 'none'} rawTrack=${rawLive.id.slice(0,8)}`);

      if (videoElRef.current) {
        try { videoElRef.current.pause(); } catch (_) {}
        videoElRef.current = null;
      }
      wrapperStreamRef.current = null;

      const video = document.createElement('video');
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

    // canvas + captureStream 재생성 여부 확인
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
  // [BUG-N] firstFrameDrawn Promise 반환 → SFU replaceTrack 타이밍 보장
  const startLoop = useCallback(async () => {
    const myLoopId = loopIdRef.current;
    activeRef.current = true;

    // firstFrame 이 실제로 그려질 때 resolve 되는 Promise
    const firstFrameDrawn = new Promise(resolve => {
      firstFrameResolveRef.current = resolve;
    });

    // window.__mediapipeSeg 우선 확인 → 없으면 로드
    let seg = window.__mediapipeSeg;
    if (!seg) {
      try {
        seg = await getSegmentation();
        if (loopIdRef.current !== myLoopId) {
          BP('01', `루프 ${myLoopId} 취소됨 (세대 불일치)`);
          return firstFrameDrawn;
        }
      } catch (e) {
        BPW('01', 'MediaPipe 실패 — fallback:', e.message);
      }
    } else {
      BP('01', 'MediaPipe 재사용 (window.__mediapipeSeg)');
    }

    if (!videoElRef.current || !canvasRef.current) {
      BPW('01', '루프 시작 취소 — videoEl 또는 canvas 없음');
      // firstFrame promise 해제
      if (firstFrameResolveRef.current) {
        firstFrameResolveRef.current();
        firstFrameResolveRef.current = null;
      }
      return firstFrameDrawn;
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
    return firstFrameDrawn;
  }, [composeFrame]);

  // ── 안전한 rawStream 획득 ────────────────────────────────
  // [BUG-J] 새 stream 획득 전 이전 stream 의 트랙을 명시적 stop
  const getOrRefreshRawStream = useCallback(async () => {
    const rawStream = localStreamRef?.current;
    if (!rawStream) { BPW('04', 'rawStream 없음'); return null; }

    const liveTracks = rawStream.getVideoTracks().filter(t => t.readyState === 'live');
    if (liveTracks.length > 0) return rawStream;

    BPW('04', '트랙 ended — getLocalMedia 재호출 후 재시도');
    try {
      rawStream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
      BP('04', '기존 stream 트랙 stop 완료 (카메라 점유 해제)');

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
    // [BUG-J] callId race condition guard
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

      // canvas/captureStream 만 정리 — videoEl/wrapper/MediaPipe 유지!
      teardownOutputStream();
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

      stopLoop();
      // [BUG-N] firstFrameDrawn Promise 를 받아서 SFU replace 타이밍 조정
      const firstFrameDrawn = await startLoop();

      if (callId !== setBackgroundCallIdRef.current) {
        BP('04', `setBackground ${mode} callId=${callId} 취소 (startLoop 후)`);
        return;
      }

      const outStream = outputStreamRef.current;
      if (outStream) {
        const outTrack = outStream.getVideoTracks().find(t => t.readyState === 'live');
        if (outTrack) {
          // [BUG-N] 첫 프레임이 실제로 그려질 때까지 최대 500ms 대기
          try {
            await Promise.race([
              firstFrameDrawn,
              new Promise(r => setTimeout(r, 500)),
            ]);
          } catch (_) {}

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
    stopLoop, startLoop, ensureInfrastructure,
    teardownInfrastructure, teardownOutputStream,
    replaceSFUTrack, updatePreview,
    localVideoRef, getOrRefreshRawStream,
  ]);

  // ── 배경 이미지 설정 ─────────────────────────────────────
  const setBackgroundImage = useCallback(async (dataUrl) => {
    BP('05', 'setBackgroundImage 호출');
    setBackgroundImageState(dataUrl);

    // [BUG-M] 이미지 로드 실패 시 이전 bgImageRef 유지
    const prevBgImage = bgImageRef.current;
    const loaded = await new Promise(resolve => {
      const img = new Image();
      img.onload  = () => {
        bgImageRef.current = img;
        BP('05', '✅ 이미지 로드 완료');
        resolve(true);
      };
      img.onerror = () => {
        BPE('05', '이미지 로드 실패 — 이전 이미지 유지');
        bgImageRef.current = prevBgImage; // 실패 시 이전 이미지 복원
        resolve(false);
      };
      img.src = dataUrl;
    });

    if (!loaded && !prevBgImage) {
      // 이미지 로드 실패이고 이전 이미지도 없으면 blur 로 폴백
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

    const rawStream = localStreamRef?.current;
    if (rawStream) {
      const liveTrack = rawStream.getVideoTracks().find(t => t.readyState === 'live');
      if (liveTrack) await replaceSFUTrack(liveTrack, 'video').catch(() => {});
      updatePreview(rawStream);
    }

    teardownInfrastructure();

    bgImageRef.current = null;
    modeRef.current    = 'none';
    // window.__mediapipeSeg 은 유지 (페이지 새로고침 전까지 재사용)

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
    outputStream,      // state — React 재렌더 트리거용
    outputStreamRef,   // ref — 내부 동기 참조용
  };
}