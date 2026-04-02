// frontend/src/hooks/useBackgroundProcessor.js
//
// ★ 배경 처리 훅 v7 — 버그 수정 ★
//
// [v7 수정 사항]
//
// 버그 1: 배경 이미지 → 배경없음 전환 시 검은 화면
//   원인: ensureInfrastructure에서 video.srcObject = rawStream 직접 연결 시
//         Chrome이 rawStream videoTrack의 "소유권"을 내부 video로 이전하여
//         이후 rawStream.getVideoTracks()에서 readyState='live' 트랙을 찾지 못함.
//   수정: rawStream을 감싸는 래퍼 MediaStream을 내부 video에 연결.
//         → rawStream 원본 트랙은 항상 live 상태 유지.
//
// 버그 2: 배경 이미지 → 다른 배경 이미지 전환 시 사람 안보임
//   원인: activeRef.current=true이므로 startLoop() skip → seg.onResults 재등록 안됨
//         → lastResults가 null인 채로 composeFrame 호출 → mask 없으면 배경만 그림.
//   수정: 배경 이미지 간 전환 시(mode='image'이고 루프가 이미 active) seg.onResults를
//         명시적으로 재등록하여 lastResults 갱신 보장.
//
// 버그 3: updatePreview에서 동일 stream 비교로 인한 skip
//   원인: none 전환 시 rawStream으로 복원하려 할 때 el.srcObject가 outputStream과 달라
//         정상 작동해야 하나, rawStream이 ended 상태면 검은 화면.
//   수정: none 전환 시 rawStream의 liveTrack이 없으면 videoElRef의 래퍼스트림에서
//         대체 트랙을 찾는 폴백 처리 추가.

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
  const modeRef         = useRef('none');
  const bgImageRef      = useRef(null);
  const activeRef       = useRef(false);
  const rafRef          = useRef(null);
  const intervalRef     = useRef(null);

  // v7: video / canvas / stream 한 번 생성 후 재사용
  const videoElRef      = useRef(null);   // 내부 처리용 video
  // ★ v7 수정: rawStream 래퍼 (rawStream 원본 보호)
  const wrapperStreamRef = useRef(null);  // video.srcObject에 연결되는 래퍼 MediaStream
  const canvasRef        = useRef(null);   // 합성 캔버스
  const outputStreamRef  = useRef(null);  // captureStream 출력

  // seg 인스턴스와 lastResults를 ref로 관리 (루프 간 공유)
  const segRef          = useRef(null);
  const lastResultsRef  = useRef(null);   // ★ v7: ref로 관리하여 루프 간 공유

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
      ctx.filter = `blur(${BLUR_AMOUNT}px)`;
      ctx.drawImage(videoEl, -4, -4, w + 8, h + 8);
      ctx.filter = 'none';
    }
    ctx.restore();

    if (!mask) {
      return; // mask 없으면 배경만 표시
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

  // ── 처리 루프 중지 ──────────────────────────────────────────
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
    if (!el) return;
    // ★ v7: srcObject가 같아도 강제 업데이트 (none 복원 시 안전)
    if (el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
      BP('06', `미리보기 업데이트 — streamId="${stream?.id}"`);
    }
  }, [localVideoRef]);

  // ── ✅ v7 핵심: 처리 인프라 초기화 ──────────────────────────
  //
  // ★ rawStream을 내부 video에 직접 연결하지 않고 래퍼 MediaStream 사용.
  //   이유: Chrome에서 video.srcObject = rawStream 시 rawStream videoTrack의
  //   "live" 상태가 내부 video에 종속됨. video.srcObject를 나중에 변경하거나
  //   null로 설정 시 rawStream 트랙이 ended 상태로 전환될 수 있음.
  //   래퍼를 사용하면 rawStream 원본은 항상 독립적으로 live 유지됨.
  const ensureInfrastructure = useCallback(async (rawStream) => {
    // ✅ [추가] rawStream 트랙이 모두 ended면 getLocalMedia 재호출
    const liveTracks = rawStream.getVideoTracks().filter(t => t.readyState === 'live');
    if (liveTracks.length === 0) {
        BPW('01', '⚠ rawStream 모든 트랙 ended — ensureInfrastructure 중단');
        return false; // 호출자에서 체크 필요
    }
    // video: 이미 있으면 재사용
    if (!videoElRef.current) {
      BP('01', '내부 video 엘리먼트 생성');
      const video = document.createElement('video');

      // ★ v7 핵심 수정: rawStream을 직접 연결하지 않고 래퍼 MediaStream 생성
      // rawStream의 트랙들을 같이 사용하되, 래퍼 객체를 통해 접근
      // → 래퍼가 GC되거나 srcObject에서 제거되어도 rawStream 원본 트랙은 ended 안됨
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
      // ★ v7: lastResultsRef(ref)로 관리 — 루프 재시작 없이도 업데이트 공유
      // onResults를 새로 등록하여 최신 콜백 보장
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

  // ── ★ v7: seg.onResults 재등록 (루프 재시작 없이) ──────────
  // 배경 이미지 간 전환 시 호출하여 onResults 콜백을 새로 등록
  const refreshOnResults = useCallback(() => {
    const seg = segRef.current;
    if (!seg || !activeRef.current) return;
    seg.onResults(r => {
      if (activeRef.current) lastResultsRef.current = r;
    });
    BP('04', 'seg.onResults 재등록 완료');
  }, []);

  // ── 배경 모드 설정 (공개 API) ────────────────────────────
  const setBackground = useCallback(async (mode) => {
    BP('04', `setBackground — mode="${mode}"`);

    const rawStream = localStreamRef?.current;
    if (!rawStream) { BPW('04', 'rawStream 없음'); return; }

    modeRef.current = mode;
    setBackgroundMode(mode);

    if (mode === 'none') {
        // ✅ ensureInfrastructure 실패(트랙 ended) → getUserMedia 재시도
        const ok = await ensureInfrastructure(rawStream);
        if (!ok) {
        BPW('04', '트랙 ended — getLocalMedia 재호출 후 재시도');
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStreamRef.current = newStream;
            await ensureInfrastructure(newStream);
        } catch (e) {
            BPE('04', '미디어 재획득 실패:', e.message);
            return;
        }
        }
      // ── 배경 OFF ─────────────────────────────────────────
      stopLoop();

      // ★ v7: rawStream에서 live 트랙 확인
      const liveTrack = rawStream.getVideoTracks().find(t => t.readyState === 'live');
      BP('04', `none 전환 — liveTrack: ${liveTrack?.readyState ?? 'none'} (id=${liveTrack?.id?.slice(0,8) ?? 'N/A'})`);

      if (liveTrack) {
        await replaceSFUTrack(liveTrack);
        updatePreview(rawStream);
      } else {
        // ★ v7 폴백: rawStream 트랙이 ended인 경우 래퍼스트림에서 찾기
        BPW('04', 'rawStream liveTrack 없음 — 래퍼스트림 폴백 시도');
        const wrapperTrack = wrapperStreamRef.current?.getVideoTracks()
          .find(t => t.readyState === 'live');
        if (wrapperTrack) {
          await replaceSFUTrack(wrapperTrack);
        }
        // 미리보기 복원: rawStream이 ended라도 srcObject를 rawStream으로 복원
        // (Chrome이 rawStream ref가 있으면 재활성화 시도)
        const el = localVideoRef?.current;
        if (el) {
          el.srcObject = rawStream;
          el.play().catch(() => {});
          BP('04', `미리보기 폴백 복원 — rawStream id="${rawStream.id}"`);
        }
      }

      setBackgroundImageState(null);
      lastResultsRef.current = null; // ★ v7: none 전환 시 lastResults 초기화

    } else {
      // ── 배경 ON ──────────────────────────────────────────
      // 1) 인프라 준비 (이미 있으면 재사용)
      await ensureInfrastructure(rawStream);

      // 2) 루프가 중지된 경우만 재시작, 이미 active이면 onResults만 재등록
      if (!activeRef.current) {
        lastResultsRef.current = null; // 새 루프 시작 전 초기화
        await startLoop();
      } else {
        // ★ v7 핵심 수정: 루프가 이미 돌고 있어도 onResults 재등록
        // 이렇게 하면 다른 배경 이미지로 전환해도 lastResults가 계속 갱신됨
        refreshOnResults();
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
    replaceSFUTrack, updatePreview, refreshOnResults, localVideoRef,
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

    if (videoElRef.current) {
      try { videoElRef.current.pause(); } catch (_) {}
      // srcObject = null 금지! (rawStream 트랙 ended 방지)
      videoElRef.current = null;
    }

    wrapperStreamRef.current = null;
    outputStreamRef.current  = null;
    canvasRef.current        = null;
    bgImageRef.current       = null;
    modeRef.current          = 'none';
    lastResultsRef.current   = null;
    segRef.current           = null;

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