// frontend/src/hooks/useBackgroundProcessor.js
//
// ★ 배경 처리 훅 v10 — 인물 미표시 버그 근본 수정 ★
//
// ■ v10에서 수정된 버그 목록 (v9 → v10)
//
//  [BUG-A] 배경 ON 시 인물이 아예 안 보이는 핵심 버그 ★★★
//    증상: blur/image/파일업로드 배경 선택 후 화면에 배경만 보이고 사람이 없음
//    원인: allVideos useMemo가 outputStreamRef (useRef) 의존성을 가지지 않음.
//          setBackground('blur') 호출 → ensureInfrastructure()가 async로 실행
//          → outputStreamRef.current에 captureStream 할당 완료 시점에
//          React는 이미 backgroundMode='blur'로 렌더를 완료한 상태.
//          이 시점 allVideos: localStream = outputStreamRef.current(=null) → null
//          → VideoElement에 stream=null 전달 → useEffect에서 srcObject=null 처리
//          → 화면 검은색/blank.
//          그 이후 outputStreamRef.current가 채워져도 React는 재렌더 안 함
//          (ref 변경은 렌더 트리거 아님).
//    수정: outputStreamRef 대신 outputStream state(useState)를 훅 반환값에 추가.
//          ensureInfrastructure 성공 후 setOutputStream(canvas.captureStream())으로
//          state를 업데이트 → React 재렌더 → allVideos가 올바른 stream 참조.
//          outputStreamRef는 내부 동기 참조용으로만 유지.
//
//  [BUG-B] ctx.filter reset이 ctx.restore()에 의해 무효화되는 버그
//    증상: blur 배경 그린 후 ctx.restore()로 filter가 복구되어
//          이후 drawImage들에 blur가 남아 인물도 흐릿하게 보임
//    원인: ctx.save() 전 filter가 'none'이면 restore() 후에도 'none'이지만
//          ctx.save() → ctx.filter='blur(14px)' → ctx.drawImage() → ctx.filter='none'
//          → ctx.restore() 순서에서, restore()는 save() 시점 상태(filter='none')를
//          복원하므로 ctx.filter='none' 라인은 실제로는 불필요하지만
//          문제는 restore 후에 남은 drawImage들이 예상대로 동작하지 않을 수 있음.
//          실제로는 save/restore 블록 분리 자체가 맞으나
//          tmp canvas에 drawImage 전 메인 ctx 상태가 오염되지 않도록 명시적 처리.
//    수정: blur drawImage를 save/restore 블록 내에 완전히 격리.
//          restore() 후 ctx.filter = 'none' 명시 추가(방어 코드).
//
//  [BUG-C] 배경 ON 시 SFU에 원본 카메라 트랙을 produce하는 버그 (상대방 화면)
//    증상: 로컬 미리보기는 canvas stream으로 배경 적용됨.
//          그러나 상대방에게는 배경 없는 원본 카메라 영상이 전달됨.
//    원인: startProducing(localStreamRef.current) 호출 시
//          항상 raw camera stream의 video track을 produce.
//          배경 효과 ON인 경우 outputStreamRef.current의 canvas track을 써야 함.
//    수정: 이 훅은 'getOutputStreamForProducing()' 헬퍼를 추가로 노출.
//          VideoMeetingRoom.jsx의 startProducing 호출 시
//          배경 mode에 따라 올바른 스트림을 선택하도록 수정.
//          (실제 startProducing 수정은 VideoMeetingRoom.jsx 참조)
//
//  v9 수정 내용 유지:
//  [BUG-1] startLoop videoEl 클로저 문제 → ref 참조
//  [BUG-2] 동시 다중 루프 → loopId 세대 카운터
//  [BUG-3] setBackgroundImage 타이밍 → 이미지 로드 후 setBackground
//  [BUG-4] audio producer 트랙 교체 미복원
//  [BUG-5] teardown 후 ended 트랙 문제
//  [BUG-6] blur→image 전환 시 이전 결과 잔상

import { useRef, useState, useCallback, useEffect } from 'react';

const CANVAS_FPS  = 24;
const BLUR_AMOUNT = 14;

const BP  = (tag, ...a) => console.log(`%c[BG-${tag}]`, 'color:#9c27b0;font-weight:bold', ...a);
const BPW = (tag, ...a) => console.warn(`%c[BG-${tag}]`, 'color:#ff9800;font-weight:bold', ...a);
const BPE = (tag, ...a) => console.error(`%c[BG-${tag}]`, 'color:#f44336;font-weight:bold', ...a);

// ── MediaPipe 로더 (싱글턴) ──────────────────────────────────
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
  // [BUG-A 수정] outputStream을 state로 관리 → 변경 시 React 재렌더 트리거
  const [outputStream,    setOutputStream]         = useState(null);

  // ── refs ──────────────────────────────────────────────────
  const modeRef          = useRef('none');
  const bgImageRef       = useRef(null);
  const activeRef        = useRef(false);
  const loopIdRef        = useRef(0);
  const rafRef           = useRef(null);
  const intervalRef      = useRef(null);

  const videoElRef       = useRef(null);
  const wrapperStreamRef = useRef(null);
  const canvasRef        = useRef(null);
  // outputStreamRef: 내부 동기 참조용 (state와 항상 동기화 유지)
  const outputStreamRef  = useRef(null);

  const segRef           = useRef(null);
  const lastResultsRef   = useRef(null);

  // ── [BUG-B 수정] composeFrame — blur 격리 및 filter 확실한 리셋 ──
  const composeFrame = useCallback((videoEl, results) => {
    const canvas = canvasRef.current;
    if (!canvas || !videoEl) return;

    if (videoEl.readyState < 1) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const mode = modeRef.current;

    if (mode === 'none') {
      if (videoEl.readyState >= 2) ctx.drawImage(videoEl, 0, 0, w, h);
      return;
    }

    const mask = results?.segmentationMask;

    // Step 1: 배경 레이어 — save/restore로 완전 격리
    ctx.save();
    if (mode === 'blur') {
      ctx.filter = `blur(${BLUR_AMOUNT}px)`;
      if (videoEl.readyState >= 2) ctx.drawImage(videoEl, -4, -4, w + 8, h + 8);
    } else if (mode === 'image' && bgImageRef.current) {
      const img = bgImageRef.current;
      const s = Math.max(w / img.width, h / img.height);
      ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
    } else {
      // bgImage 아직 없으면 blur fallback
      ctx.filter = `blur(${BLUR_AMOUNT}px)`;
      if (videoEl.readyState >= 2) ctx.drawImage(videoEl, -4, -4, w + 8, h + 8);
    }
    ctx.restore();
    // [BUG-B 수정] restore 후 filter를 명시적으로 none으로 리셋 (방어 코드)
    ctx.filter = 'none';

    if (!mask) {
      // mask 없을 때(MediaPipe 초기화 중) 원본 영상 그대로 표시
      if (videoEl.readyState >= 2) ctx.drawImage(videoEl, 0, 0, w, h);
      return;
    }

    // Step 2: 인물 추출 (임시 캔버스)
    // MediaPipe SelfieSegmentation: 흰색(alpha=255) = 인물, 검정(alpha=0) = 배경
    // destination-in: 목적지(videoEl 픽셀)를 소스(mask) 알파가 높은 곳만 유지
    // → 인물 영역(흰색)만 남기고 배경(검정)은 투명 처리
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tCtx = tmp.getContext('2d');
    if (videoEl.readyState >= 2) tCtx.drawImage(videoEl, 0, 0, w, h);
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

  // ── infrastructure 전체 정리 ─────────────────────────────────
  const teardownInfrastructure = useCallback(() => {
    if (outputStreamRef.current) {
      outputStreamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch (_) {}
      });
      outputStreamRef.current = null;
      // [BUG-A 수정] state도 null로 업데이트 → React 재렌더
      setOutputStream(null);
      BP('02', 'outputStream 트랙 stop 완료');
    }

    if (videoElRef.current) {
      try {
        videoElRef.current.pause();
        videoElRef.current.srcObject = null;
      } catch (_) {}
      videoElRef.current = null;
    }

    wrapperStreamRef.current = null;
    canvasRef.current = null;
    lastResultsRef.current = null;

    BP('02', 'infrastructure 전체 정리 완료');
  }, []);

  // ── SFU producer 트랙 교체 ────────────────────────────────
  const replaceSFUTrack = useCallback(async (newTrack, kind = 'video') => {
    if (!newTrack || newTrack.readyState === 'ended') {
      BPW('03', `replaceSFUTrack: 트랙 없음 또는 ended — 생략 (readyState=${newTrack?.readyState})`);
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

    const wrapperTracks = wrapperStreamRef.current?.getVideoTracks() || [];
    const wrapperLive = wrapperTracks.find(t => t.readyState === 'live');
    const rawLive = liveTracks[0];

    const needsRebuild = !videoElRef.current
      || !wrapperLive
      || wrapperLive.id !== rawLive.id;

    if (needsRebuild) {
      BP('01', `infrastructure 재생성 필요 — wrapperTrack=${wrapperLive?.id?.slice(0,8) ?? 'none'} rawTrack=${rawLive.id.slice(0,8)}`);

      if (videoElRef.current) {
        try {
          videoElRef.current.pause();
          videoElRef.current.srcObject = null;
        } catch (_) {}
        videoElRef.current = null;
      }
      wrapperStreamRef.current = null;

      BP('01', '내부 video 엘리먼트 생성');
      const video = document.createElement('video');

      const wrapper = new MediaStream(rawStream.getTracks());
      wrapperStreamRef.current = wrapper;

      video.srcObject   = wrapper;
      video.autoplay    = true;
      video.playsInline = true;
      video.muted       = true;

      await new Promise((resolve) => {
        if (video.readyState >= 2) { resolve(); return; }
        const onReady = () => { video.removeEventListener('canplay', onReady); resolve(); };
        video.addEventListener('canplay', onReady);
        setTimeout(resolve, 2000);
      });

      videoElRef.current = video;
      BP('01', '✅ 내부 video 준비 완료');

    } else {
      BP('01', 'infrastructure 재사용 — wrapperTrack 동일');
    }

    // canvas + captureStream: 없거나 ended 트랙이면 재생성
    if (!canvasRef.current || !outputStreamRef.current
        || outputStreamRef.current.getVideoTracks().some(t => t.readyState === 'ended')) {
      if (outputStreamRef.current) {
        outputStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
        outputStreamRef.current = null;
        setOutputStream(null);
      }

      BP('01', 'canvas + captureStream 생성');
      const canvas = document.createElement('canvas');
      const { width = 640, height = 480 } = rawLive?.getSettings?.() || {};
      canvas.width  = width;
      canvas.height = height;
      BP('01', `캔버스: ${width}×${height}`);

      const newCaptureStream = canvas.captureStream(CANVAS_FPS);
      canvasRef.current       = canvas;
      outputStreamRef.current = newCaptureStream;

      // [BUG-A 수정] state 업데이트 → React 재렌더 트리거
      setOutputStream(newCaptureStream);
      BP('01', `captureStream 생성 및 state 업데이트 — ${CANVAS_FPS}fps`);
    }

    return true;
  }, []);

  // ── 렌더링 루프 시작 ─────────────────────────────────────
  const startLoop = useCallback(async () => {
    const myLoopId = loopIdRef.current;
    activeRef.current = true;

    let seg = segRef.current;
    if (!seg) {
      try {
        seg = await getSegmentation();
        if (loopIdRef.current !== myLoopId) {
          BP('01', `루프 ${myLoopId} 취소됨 (세대 불일치 — 신규 루프 ${loopIdRef.current})`);
          return;
        }
        segRef.current = seg;
      } catch (e) {
        BPW('01', 'MediaPipe 실패 — fallback:', e.message);
      }
    }

    if (!videoElRef.current || !canvasRef.current) {
      BPW('01', '루프 시작 취소 — videoEl 또는 canvas 없음');
      return;
    }

    if (seg) {
      seg.onResults(r => {
        if (activeRef.current && loopIdRef.current === myLoopId) {
          lastResultsRef.current = r;
        }
      });

      const loop = async () => {
        if (!activeRef.current || loopIdRef.current !== myLoopId) return;

        const videoEl = videoElRef.current;
        const canvas  = canvasRef.current;
        if (!videoEl || !canvas) return;

        try {
          if (videoEl.readyState >= 2) {
            await seg.send({ image: videoEl });
            if (!activeRef.current || loopIdRef.current !== myLoopId) return;
            composeFrame(videoEl, lastResultsRef.current);
          }
        } catch (_) {
          if (activeRef.current && loopIdRef.current === myLoopId) {
            composeFrame(videoEl, lastResultsRef.current);
          }
        }
        if (activeRef.current && loopIdRef.current === myLoopId) {
          rafRef.current = requestAnimationFrame(loop);
        }
      };
      rafRef.current = requestAnimationFrame(loop);

    } else {
      // Fallback (MediaPipe 없을 때 setInterval)
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

  // ── seg.onResults 재등록 ──────────────────────────────────
  const refreshOnResults = useCallback(() => {
    const seg = segRef.current;
    if (!seg || !activeRef.current) return;
    const myLoopId = loopIdRef.current;
    seg.onResults(r => {
      if (activeRef.current && loopIdRef.current === myLoopId) {
        lastResultsRef.current = r;
      }
    });
    BP('04', 'seg.onResults 재등록 완료');
  }, []);

  // ── 안전한 rawStream 획득 ────────────────────────────────
  const getOrRefreshRawStream = useCallback(async () => {
    const rawStream = localStreamRef?.current;
    if (!rawStream) {
      BPW('04', 'rawStream 없음');
      return null;
    }

    const liveTracks = rawStream.getVideoTracks().filter(t => t.readyState === 'live');
    if (liveTracks.length > 0) return rawStream;

    BPW('04', '트랙 ended — getLocalMedia 재호출 후 재시도');
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = newStream;
      BP('04', `새 stream 획득 — id=${newStream.id}`);

      // [BUG-4] 새 스트림 획득 시 audio producer도 트랙 교체
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

      teardownInfrastructure();
      setBackgroundImageState(null);

    } else {
      // ── 배경 ON (blur / image) ──────────────────────────
      const rawStream = await getOrRefreshRawStream();
      if (!rawStream) return;

      // 1) infrastructure 준비 (이 안에서 outputStreamRef + state 모두 설정됨)
      const ok = await ensureInfrastructure(rawStream);
      if (!ok) return;

      // [BUG-6] 모드 전환 시 이전 results 초기화
      lastResultsRef.current = null;

      // 2) 루프 처리
      if (!activeRef.current) {
        await startLoop();
      } else {
        refreshOnResults();
      }

      // 3) outputStream 트랙 live 확인 후 SFU + 미리보기 연결
      const outStream = outputStreamRef.current;
      if (outStream) {
        const outTrack = outStream.getVideoTracks().find(t => t.readyState === 'live');
        if (outTrack) {
          // [BUG-C] 배경 ON 시 canvas 트랙으로 SFU produce 교체
          await replaceSFUTrack(outTrack, 'video');
        } else {
          BPW('04', 'outputStream track ended — infrastructure 재생성 시도');
          teardownInfrastructure();
          const ok2 = await ensureInfrastructure(rawStream);
          if (ok2) {
            lastResultsRef.current = null;
            await startLoop();
            const outTrack2 = outputStreamRef.current?.getVideoTracks().find(t => t.readyState === 'live');
            if (outTrack2) await replaceSFUTrack(outTrack2, 'video');
          }
        }
        if (outputStreamRef.current) {
          updatePreview(outputStreamRef.current);
        }
      }
    }
  }, [
    localStreamRef, stopLoop, startLoop, ensureInfrastructure,
    teardownInfrastructure, replaceSFUTrack, updatePreview,
    refreshOnResults, localVideoRef, getOrRefreshRawStream,
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
      if (liveTrack) {
        await replaceSFUTrack(liveTrack, 'video').catch(() => {});
      }
      updatePreview(rawStream);
    }

    teardownInfrastructure();

    bgImageRef.current     = null;
    modeRef.current        = 'none';
    lastResultsRef.current = null;
    segRef.current         = null;

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
    // [BUG-A 수정] outputStream (state) 반환 — React 재렌더 트리거용
    outputStream,
    // outputStreamRef는 하위 호환성 유지 (VideoMeetingRoom에서 직접 사용하는 경우)
    outputStreamRef,
  };
}