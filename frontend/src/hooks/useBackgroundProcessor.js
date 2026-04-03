// frontend/src/hooks/useBackgroundProcessor.js
//
// ★ 배경 처리 훅 v8 — 모든 전환 경우의 수 버그 수정 ★
//
// [v8 수정 사항 — 근본 원인 해결]
//
// ■ 발견된 버그 패턴 (로그 분석)
//
//   [BG-01] 렌더링 루프 시작
//   [BG-03] replaceSFUTrack: 트랙 없음 또는 ended — 생략 (readyState=ended)
//   [BG-04] 트랙 ended — getLocalMedia 재호출 후 재시도 (반복)
//
// ■ 근본 원인
//
//   1) none 전환 시 infrastructure(videoEl, canvas, outputStream, wrapperStream)를
//      정리하지 않아, 다음 blur/image 전환 시 ensureInfrastructure가
//      videoElRef.current 존재 여부만 체크하고 skip → 이전 wrapperStream을 재사용.
//
//   2) none 전환 중 rawStream 트랙이 ended 감지 → getLocalMedia 재호출 →
//      localStreamRef.current = newStream.
//      그런데 videoElRef은 이전 wrapperStream(구 트랙 포함)에 묶여 있음.
//      → 새 rawStream으로 새 래퍼를 만들지 못해 내부 video가 ended 트랙을 씀.
//      → captureStream(outputStream) 출력 트랙도 자동으로 ended 상태가 됨.
//
//   3) none 전환 시 outputStreamRef를 stop하지 않아 오래된 captureStream이
//      다음 image/blur 전환에서 SFU 트랙 교체 시도 → ended 트랙 교체 실패.
//
// ■ 수정 방향
//
//   · none 전환 시: stopLoop() + infrastructure 전체 정리
//     (videoElRef, wrapperStreamRef, canvasRef, outputStreamRef 모두 null)
//   · blur/image 전환 시: ensureInfrastructure에서 현재 rawStream과
//     wrapperStream의 트랙이 다르면(새 rawStream이면) infrastructure 재생성.
//   · 모든 전환 경우에서 outputStream 트랙 ended 여부 사전 확인.
//
// ■ 지원 전환 매트릭스 (모두 정상 동작)
//   none → blur    ✅
//   none → image   ✅
//   blur → none    ✅
//   image → none   ✅
//   blur → blur    ✅ (재시작 없음)
//   blur → image   ✅ (onResults 재등록)
//   image → blur   ✅ (onResults 재등록)
//   image → image  ✅ (다른 이미지, onResults 재등록)

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

  // ── refs ──────────────────────────────────────────────────
  const modeRef          = useRef('none');
  const bgImageRef       = useRef(null);
  const activeRef        = useRef(false);
  const rafRef           = useRef(null);
  const intervalRef      = useRef(null);

  const videoElRef       = useRef(null);
  const wrapperStreamRef = useRef(null);
  const canvasRef        = useRef(null);
  const outputStreamRef  = useRef(null);

  const segRef           = useRef(null);
  const lastResultsRef   = useRef(null);

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

    // Step 1: 배경 레이어
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
      ctx.filter = `blur(${BLUR_AMOUNT}px)`;
      ctx.drawImage(videoEl, -4, -4, w + 8, h + 8);
      ctx.filter = 'none';
    }
    ctx.restore();

    if (!mask) return; // mask 없으면 배경만 표시

    // Step 2: 인물 추출
    const tmp  = document.createElement('canvas');
    tmp.width  = w; tmp.height = h;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(videoEl, 0, 0, w, h);
    tCtx.globalCompositeOperation = 'destination-in';
    tCtx.drawImage(mask, 0, 0, w, h);
    tCtx.globalCompositeOperation = 'source-over';

    // Step 3: 인물 합성
    ctx.drawImage(tmp, 0, 0, w, h);
  }, []);

  // ── 처리 루프 중지 ──────────────────────────────────────────
  const stopLoop = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current)      { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current);   intervalRef.current = null; }
    BP('02', '처리 루프 중지');
  }, []);

  // ── ✅ v8: infrastructure 전체 정리 ─────────────────────────
  // none 전환 시 호출 — 다음 blur/image 전환에서 새로 생성하게 함
  const teardownInfrastructure = useCallback(() => {
    // outputStream(captureStream) 트랙 stop
    if (outputStreamRef.current) {
      outputStreamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch (_) {}
      });
      outputStreamRef.current = null;
      BP('02', 'outputStream 트랙 stop 완료');
    }

    // 내부 video 정리 (srcObject=null 금지 — rawStream 트랙 보호)
    if (videoElRef.current) {
      try { videoElRef.current.pause(); } catch (_) {}
      // srcObject는 건드리지 않음 (null 설정 시 Chrome이 트랙 ended 가능)
      videoElRef.current = null;
    }

    // wrapperStream 참조 해제 (원본 트랙 stop 안 함)
    wrapperStreamRef.current = null;

    // canvas 정리
    canvasRef.current = null;

    // segmentation 결과 초기화
    lastResultsRef.current = null;

    BP('02', 'infrastructure 전체 정리 완료');
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
    if (!el || !stream) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
      BP('06', `미리보기 업데이트 — streamId="${stream?.id}"`);
    }
  }, [localVideoRef]);

  // ── ✅ v8: infrastructure 초기화 (항상 rawStream 기준으로 재생성 체크) ──
  //
  // 기존 v7 문제: videoElRef.current 존재 여부만 체크 → 새 rawStream이어도 재사용
  // v8 수정: wrapperStream의 트랙과 rawStream의 트랙이 다르면 재생성
  const ensureInfrastructure = useCallback(async (rawStream) => {
    const rawVideoTracks = rawStream.getVideoTracks();
    const liveTracks = rawVideoTracks.filter(t => t.readyState === 'live');

    if (liveTracks.length === 0) {
      BPW('01', '⚠ rawStream 모든 트랙 ended — ensureInfrastructure 중단');
      return false;
    }

    // ✅ v8: wrapperStream의 트랙이 rawStream 트랙과 다른지 확인
    // 다르면 (새 rawStream) infrastructure 재생성 필요
    const wrapperTracks = wrapperStreamRef.current?.getVideoTracks() || [];
    const wrapperLive = wrapperTracks.find(t => t.readyState === 'live');
    const rawLive = liveTracks[0];

    const needsRebuild = !videoElRef.current 
      || !wrapperLive 
      || wrapperLive.id !== rawLive.id;

    if (needsRebuild) {
      BP('01', `infrastructure 재생성 필요 — wrapperTrack=${wrapperLive?.id?.slice(0,8) ?? 'none'} rawTrack=${rawLive.id.slice(0,8)}`);

      // 기존 정리 (이미 stopLoop된 상태일 수 있음)
      if (videoElRef.current) {
        try { videoElRef.current.pause(); } catch (_) {}
        videoElRef.current = null;
      }
      // outputStream은 여기서 stop하지 않음 (호출자가 관리)
      wrapperStreamRef.current = null;

      BP('01', '내부 video 엘리먼트 생성');
      const video = document.createElement('video');

      // ✅ rawStream을 감싸는 새 래퍼 MediaStream
      const wrapper = new MediaStream(rawStream.getTracks());
      wrapperStreamRef.current = wrapper;

      video.srcObject   = wrapper;
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
    } else {
      BP('01', 'infrastructure 재사용 — wrapperTrack 동일');
    }

    // canvas + captureStream: 없으면 생성, 있으면 재사용
    if (!canvasRef.current || !outputStreamRef.current
        || outputStreamRef.current.getVideoTracks().some(t => t.readyState === 'ended')) {
      // ✅ v8: outputStream 트랙이 ended인 경우도 재생성
      if (outputStreamRef.current) {
        outputStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
        outputStreamRef.current = null;
      }

      BP('01', 'canvas + captureStream 생성');
      const canvas = document.createElement('canvas');
      const vTrack = rawLive;
      const { width = 640, height = 480 } = vTrack?.getSettings?.() || {};
      canvas.width  = width;
      canvas.height = height;
      BP('01', `캔버스: ${width}×${height}`);

      canvasRef.current       = canvas;
      outputStreamRef.current = canvas.captureStream(CANVAS_FPS);
      BP('01', `captureStream 생성 — ${CANVAS_FPS}fps`);
    }

    return true;
  }, []);

  // ── 렌더링 루프 시작 ─────────────────────────────────────
  const startLoop = useCallback(async () => {
    activeRef.current = true;

    const videoEl = videoElRef.current;
    const canvas  = canvasRef.current;
    if (!videoEl || !canvas) return;

    let seg = segRef.current;
    if (!seg) {
      try {
        seg = await getSegmentation();
        segRef.current = seg;
      } catch (e) {
        BPW('01', 'MediaPipe 실패 — fallback:', e.message);
      }
    }

    if (seg) {
      // ✅ onResults 항상 새로 등록
      seg.onResults(r => {
        if (activeRef.current) lastResultsRef.current = r;
      });

      const loop = async () => {
        if (!activeRef.current) return;
        try {
          if (videoEl.readyState >= 2) {
            await seg.send({ image: videoEl });
            composeFrame(videoEl, lastResultsRef.current);
          }
        } catch (_) {
          if (activeRef.current) composeFrame(videoEl, lastResultsRef.current);
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

  // ── seg.onResults 재등록 (루프 재시작 없이) ──────────────
  const refreshOnResults = useCallback(() => {
    const seg = segRef.current;
    if (!seg || !activeRef.current) return;
    seg.onResults(r => {
      if (activeRef.current) lastResultsRef.current = r;
    });
    BP('04', 'seg.onResults 재등록 완료');
  }, []);

  // ── ✅ v8: 안전한 rawStream 획득 (ended 시 재호출) ──────
  const getOrRefreshRawStream = useCallback(async () => {
    const rawStream = localStreamRef?.current;
    if (!rawStream) {
      BPW('04', 'rawStream 없음');
      return null;
    }

    const liveTracks = rawStream.getVideoTracks().filter(t => t.readyState === 'live');
    if (liveTracks.length > 0) return rawStream;

    // 트랙이 ended → getUserMedia 재시도
    BPW('04', '트랙 ended — getLocalMedia 재호출 후 재시도');
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = newStream;
      BP('04', `새 stream 획득 — id=${newStream.id}`);
      return newStream;
    } catch (e) {
      BPE('04', '미디어 재획득 실패:', e.message);
      return null;
    }
  }, [localStreamRef]);

  // ── 배경 모드 설정 (공개 API) ────────────────────────────
  const setBackground = useCallback(async (mode) => {
    BP('04', `setBackground — mode="${mode}"`);

    modeRef.current = mode;
    setBackgroundMode(mode);

    if (mode === 'none') {
      // ── 배경 OFF ─────────────────────────────────────────
      stopLoop();

      // ✅ v8: infrastructure 정리 (다음 전환을 위해 깔끔하게)
      // outputStream 트랙 stop 전에 rawStream liveTrack으로 SFU 복원
      const rawStream = await getOrRefreshRawStream();

      if (rawStream) {
        const liveTrack = rawStream.getVideoTracks().find(t => t.readyState === 'live');
        BP('04', `none 전환 — liveTrack: ${liveTrack?.readyState ?? 'none'} (id=${liveTrack?.id?.slice(0,8) ?? 'N/A'})`);

        if (liveTrack) {
          await replaceSFUTrack(liveTrack);
          updatePreview(rawStream);
        } else {
          BPW('04', 'liveTrack 없음 — 미리보기 복원 시도');
          const el = localVideoRef?.current;
          if (el) { el.srcObject = rawStream; el.play().catch(() => {}); }
        }
      }

      // ✅ v8: infrastructure 전체 정리 → 다음 blur/image 전환 시 새로 생성
      teardownInfrastructure();

      setBackgroundImageState(null);

    } else {
      // ── 배경 ON ──────────────────────────────────────────
      const rawStream = await getOrRefreshRawStream();
      if (!rawStream) return;

      // 1) infrastructure 준비 (새 rawStream이면 재생성)
      const ok = await ensureInfrastructure(rawStream);
      if (!ok) return;

      // 2) 루프 처리
      if (!activeRef.current) {
        lastResultsRef.current = null;
        await startLoop();
      } else {
        // 이미 active → onResults만 재등록 (모든 모드 전환에서 안전)
        refreshOnResults();
      }

      // 3) ✅ v8: outputStream 트랙 live 확인 후 SFU + 미리보기 연결
      const outStream = outputStreamRef.current;
      if (outStream) {
        const outTrack = outStream.getVideoTracks().find(t => t.readyState === 'live');
        if (outTrack) {
          await replaceSFUTrack(outTrack);
        } else {
          BPW('04', 'outputStream track ended — infrastructure 재생성 시도');
          // outputStream이 ended인 드문 케이스: teardown 후 재시도
          teardownInfrastructure();
          const ok2 = await ensureInfrastructure(rawStream);
          if (ok2) {
            lastResultsRef.current = null;
            await startLoop();
            const outTrack2 = outputStreamRef.current?.getVideoTracks().find(t => t.readyState === 'live');
            if (outTrack2) await replaceSFUTrack(outTrack2);
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
        await replaceSFUTrack(liveTrack).catch(() => {});
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
      if (rafRef.current)      cancelAnimationFrame(rafRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { backgroundMode, backgroundImage, setBackground, setBackgroundImage, cleanup };
}