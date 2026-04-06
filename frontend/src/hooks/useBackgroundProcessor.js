// frontend/src/hooks/useBackgroundProcessor.js
//
// ★ 배경 처리 훅 v21 ★
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [BUG-X] ★★★ image/blur → none 사이클마다 rawTrack ended 반복 (v20 미해결)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  ■ 로그로 확인된 사실:
//    callId=4 none 시작 시 [BG-02] 처리 루프 중지 직후
//    getOrRefreshRawStream() 호출 전에 이미 rawTrack이 ended.
//    즉 teardownOutputStream의 captureStream.stop() 이전에 발생.
//    stopLoop()의 cancelAnimationFrame도 track에 영향 없음.
//
//    → rawTrack이 callId=3 image 처리 완료 시점부터 이미 ended 상태.
//
//  ■ 근본 원인:
//    ensureInfrastructure에서
//      wrapper = new MediaStream(rawStream.getTracks())
//    로 rawTrack 원본을 wrapper에 직접 넣음.
//
//    MediaPipe(WebGL/WASM)가 seg.send({ image: videoEl })를 통해
//    videoEl → wrapper → rawTrack에 접근하는 과정에서,
//    Chrome이 내부적으로 해당 rawTrack을 ended시키는 현상 발생.
//    (Chrome의 MediaStreamTrack 수명 관리와 WebGL 텍스처 처리의 상호작용)
//
//  ■ 수정: wrapper에 rawTrack 원본 대신 clone() 사용
//
//    const clonedVideoTrack = rawLive.clone();
//    const wrapper = new MediaStream([clonedVideoTrack, ...audioTracks]);
//
//    clone된 트랙이 ended되어도 rawStream 원본 rawTrack은 살아있음.
//    teardown 시 clonedVideoTrack.stop()으로 clone 정리.
//
//    wrapperClonedVideoRef 에 clone track 보관 → teardown 시 stop().
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 수정 이력
//  v21: [BUG-X] wrapper에 rawTrack.clone() 사용 → 원본 rawTrack 보호
//  v20: [BUG-W] tmp canvas 재사용 + willReadFrequently → 이미지 인물 합성 수정
//               wrapperStream 폐기 시 removeTrack → rawTrack ended 방지 (미해결)
//  v19: [BUG-V] teardownOutputStream 에서 captureStream stop 전
//               videoEl srcObject 먼저 해제 → rawTrack ended 방지 (미해결)
//  v18: [BUG-U] videoEl 폐기 시 srcObject = new MediaStream([]) 로 교체
//  v17: [BUG-T] getOrRefreshRawStream 에서 videoEl/wrapper 즉시 무효화
//  v16: [BUG-S] waitForFirstFrame() 독립 분리
//  v15: [BUG-K][BUG-N][BUG-M][BUG-O]
//  v14: [BUG-J] 카메라 이중 점유 해제, callId race condition 가드
//  v13: window.__mediapipeSeg 고정
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  ■ 버그 1: 배경이미지 선택 시 사람 영상 안보임
//
//    원인: composeFrame() 에서 mode='image' 일 때 배경 이미지를 먼저
//          그리고 mask 로 인물을 합성한 뒤 ctx.drawImage(tmp) 로 올림.
//          그런데 tmp canvas 의 getContext('2d') 에서
//          willReadFrequently 옵션 없이 destination-in 합성을 하면
//          일부 GPU 드라이버 환경에서 알파 채널이 0으로 초기화되어
//          인물 영역이 투명(=배경이미지만 보임)해지는 현상 발생.
//
//          또한 tmp canvas 를 매 프레임마다 createElement 로 생성하면
//          GPU 텍스처 업로드 지연으로 첫 몇 프레임은 빈 캔버스가
//          destination-in 에 사용되어 인물이 완전히 지워짐.
//
//    수정:
//      - tmp canvas 를 매 프레임 생성하지 않고 한 번만 생성하여 재사용
//        (tmpCanvasRef 에 보관)
//      - tmp canvas 재사용 시 clearRect 로 명시적 초기화
//      - getContext('2d', { willReadFrequently: true }) 옵션 추가
//
//  ■ 버그 2: image/blur → none 사이클마다 rawTrack ended 반복
//
//    원인: teardownOutputStream() 에서
//          wrapperStreamRef.current = null 만 하면 wrapper MediaStream 객체가
//          GC(가비지 컬렉션) 대상이 됨. Chrome 은 MediaStream 객체가 GC 될 때
//          해당 스트림에 포함된 track 들을 ended 시킬 수 있음.
//          wrapper 는 rawStream 의 track 을 참조하므로 rawTrack 이 ended.
//
//    수정:
//      - wrapperStreamRef.current = null 전에
//        wrapper.getTracks().forEach(t => wrapper.removeTrack(t)) 호출
//        → track 을 stream 에서 제거하면 stream GC 시 track 이 ended 되지 않음
//      - ensureInfrastructure 에서도 기존 wrapper 교체 시 동일 처리
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 수정 이력
//  v20: [BUG-W] tmp canvas 재사용 + willReadFrequently → 이미지 인물 합성 수정
//               wrapperStream 폐기 시 removeTrack → rawTrack ended 방지
//  v19: [BUG-V] teardownOutputStream 에서 captureStream stop 전
//               videoEl srcObject 먼저 해제 → rawTrack ended 방지
//  v18: [BUG-U] videoEl 폐기 시 srcObject = new MediaStream([]) 로 교체
//               → Chrome GC 시 rawStream track ended 방지
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
    return seg;  // ★ null 이 아닌 seg 반환
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
  // ★ [BUG-W] tmp canvas 재사용 — 매 프레임 createElement 하지 않음
  const tmpCanvasRef     = useRef(null);
  // ★ [BUG-X] wrapper에 넣은 cloned video track 보관 → teardown 시 stop()
  const wrapperClonedVideoRef = useRef(null);

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
    // ★ [BUG-W] tmp canvas 재사용 (매 프레임 createElement 하지 않음)
    //   매 프레임 new canvas 를 만들면 GPU 텍스처 업로드 지연으로
    //   첫 몇 프레임이 빈 캔버스로 destination-in 되어 인물이 사라짐.
    if (!tmpCanvasRef.current
      || tmpCanvasRef.current.width  !== w
      || tmpCanvasRef.current.height !== h) {
      const tc  = document.createElement('canvas');
      tc.width  = w;
      tc.height = h;
      tmpCanvasRef.current = tc;
    }
    const tmp  = tmpCanvasRef.current;
    // ★ 명시적 초기화 (이전 프레임 잔상 제거)
    const tCtx = tmp.getContext('2d', { willReadFrequently: true });
    tCtx.clearRect(0, 0, w, h);
    tCtx.drawImage(videoEl, 0, 0, w, h);
    tCtx.globalCompositeOperation = 'destination-in';
    tCtx.drawImage(mask, 0, 0, w, h);
    tCtx.globalCompositeOperation = 'source-over';

    // Step 3: 인물을 배경 위에 합성
    ctx.drawImage(tmp, 0, 0, w, h);
  }, []);

  // ── [BUG-S] waitForFirstFrame — stopLoop/startLoop 과 완전 독립 ──
  const waitForFirstFrame = useCallback((maxWait = 800) => {
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
  const stopLoop = useCallback(() => {
    activeRef.current  = false;
    loopIdRef.current += 1;
    if (rafRef.current)      { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current);   intervalRef.current = null; }
    BP('02', '처리 루프 중지');
  }, []);

  // ── canvas/outputStream 정리 ──────────────────────────────
  // ★ [BUG-V] captureStream 트랙 stop 전에 videoEl srcObject 를 먼저 해제.
  //   Chrome 은 captureStream 트랙 stop 시 연결된 video 의 rawTrack 도
  //   ended 시킬 수 있으므로, videoEl 을 먼저 분리해야 함.
  const teardownOutputStream = useCallback(() => {
    // ★ 먼저 videoEl srcObject 해제 (captureStream stop 보다 앞서야 함)
    if (videoElRef.current) {
      try { videoElRef.current.pause(); } catch (_) {}
      try { videoElRef.current.srcObject = new MediaStream([]); } catch (_) {}
      videoElRef.current = null;
      BP('02', 'videoElRef 선제 정리 (captureStream stop 전)');
    }

    // ★ [BUG-W] wrapper 폐기 전 removeTrack 으로 rawTrack 참조 해제
    //   wrapperStreamRef = null 만 하면 wrapper MediaStream 이 GC 될 때
    //   Chrome 이 포함된 rawTrack 도 ended 시킬 수 있음.
    //   removeTrack 으로 미리 제거하면 stream GC 시 track 이 살아있음.
    if (wrapperStreamRef.current) {
      try {
        wrapperStreamRef.current.getTracks().forEach(t => {
          try { wrapperStreamRef.current.removeTrack(t); } catch (_) {}
        });
      } catch (_) {}
    }
    wrapperStreamRef.current = null;

    // ★ [BUG-X] clone된 video track 정리 (원본 rawTrack 과 별개)
    if (wrapperClonedVideoRef.current) {
      try { wrapperClonedVideoRef.current.stop(); } catch (_) {}
      wrapperClonedVideoRef.current = null;
    }

    // 그 다음 captureStream 트랙 stop
    if (outputStreamRef.current) {
      outputStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
      outputStreamRef.current = null;
      setOutputStream(null);
      BP('02', 'outputStream(canvas captureStream) 트랙 stop 완료');
    }
    canvasRef.current    = null;
    tmpCanvasRef.current = null;  // ★ [BUG-W] tmp canvas 도 함께 정리
    BP('02', 'canvas/outputStream 정리 완료 — MediaPipe 유지');
  }, []);

  // ── infrastructure 전체 정리 (언마운트 시에만) ────────────────
  const teardownInfrastructure = useCallback(() => {
    teardownOutputStream();
    // teardownOutputStream 에서 videoEl 이미 정리됨
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
        // ★ [BUG-U] srcObject 를 빈 스트림으로 교체
        try { videoElRef.current.srcObject = new MediaStream([]); } catch (_) {}
        videoElRef.current = null;
      }
      // ★ [BUG-W] 기존 wrapper 교체 시 removeTrack 으로 rawTrack 참조 해제
      if (wrapperStreamRef.current) {
        try {
          wrapperStreamRef.current.getTracks().forEach(t => {
            try { wrapperStreamRef.current.removeTrack(t); } catch (_) {}
          });
        } catch (_) {}
      }
      wrapperStreamRef.current = null;
      // ★ [BUG-X] 기존 cloned track 정리
      if (wrapperClonedVideoRef.current) {
        try { wrapperClonedVideoRef.current.stop(); } catch (_) {}
        wrapperClonedVideoRef.current = null;
      }

      // ★ [BUG-X] wrapper 에 rawTrack 원본 대신 clone 사용
      //   MediaPipe(WebGL)가 videoEl → wrapper → rawTrack 에 접근하는 과정에서
      //   Chrome 이 rawTrack 을 ended 시키는 현상 방지.
      //   clone 이 ended 되어도 rawStream 원본 rawTrack 은 살아있음.
      const clonedVideoTrack = rawLive.clone();
      wrapperClonedVideoRef.current = clonedVideoTrack;

      const audioTracks = rawStream.getAudioTracks();
      const wrapper = new MediaStream([clonedVideoTrack, ...audioTracks]);
      wrapperStreamRef.current = wrapper;

      const video = document.createElement('video');

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
  const getOrRefreshRawStream = useCallback(async () => {
    const rawStream = localStreamRef?.current;
    if (!rawStream) { BPW('04', 'rawStream 없음'); return null; }

    const liveTracks = rawStream.getVideoTracks().filter(t => t.readyState === 'live');
    if (liveTracks.length > 0) return rawStream;

    BPW('04', '트랙 ended — getUserMedia 재호출');
    try {
      rawStream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
      BP('04', '기존 stream 트랙 stop 완료');

      if (videoElRef.current) {
        try { videoElRef.current.pause(); } catch (_) {}
        try { videoElRef.current.srcObject = new MediaStream([]); } catch (_) {}
        videoElRef.current = null;
        BP('04', 'videoElRef 무효화 (stream 교체 전)');
      }
      // ★ [BUG-W] wrapper 폐기 시 removeTrack 으로 rawTrack 참조 해제
      if (wrapperStreamRef.current) {
        try {
          wrapperStreamRef.current.getTracks().forEach(t => {
            try { wrapperStreamRef.current.removeTrack(t); } catch (_) {}
          });
        } catch (_) {}
      }
      wrapperStreamRef.current = null;
      // ★ [BUG-X] cloned track 정리
      if (wrapperClonedVideoRef.current) {
        try { wrapperClonedVideoRef.current.stop(); } catch (_) {}
        wrapperClonedVideoRef.current = null;
      }

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

      if (callId !== setBackgroundCallIdRef.current) {
        BP('04', `setBackground none callId=${callId} 취소 (teardown 직전)`);
        return;
      }

      // ★ [BUG-V] teardownOutputStream 내부에서 videoEl 먼저 정리 후 captureStream stop
      //   (중복 videoEl 정리 코드 제거 — teardownOutputStream 이 담당)
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
      await startLoop();

      if (callId !== setBackgroundCallIdRef.current) {
        BP('04', `setBackground ${mode} callId=${callId} 취소 (startLoop 후)`);
        return;
      }

      const outStream = outputStreamRef.current;
      if (outStream) {
        const outTrack = outStream.getVideoTracks().find(t => t.readyState === 'live');
        if (outTrack) {
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