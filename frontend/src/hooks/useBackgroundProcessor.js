// frontend/src/hooks/useBackgroundProcessor.js
//
// ★ 배경 처리 훅 v11 — 영상 미표시 버그 완전 수정 ★
//
// ■ v11 수정 내용 (v10 → v11)
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [BUG-E] ★★★ 배경 ON 시 검은 화면 — srcObject=null 트랙 종료 버그
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//   증상: 배경 blur/image 선택 시 완전히 검은 화면, 인물 전혀 안 보임.
//         특히 두 번째 이후 배경 전환 시 더 심각.
//   원인: ensureInfrastructure에서 이전 video 정리 시
//         videoElRef.current.srcObject = null 설정.
//         Chrome은 srcObject=null 시 해당 MediaStream의 getUserMedia 트랙을
//         자동으로 ended 상태로 전환시킴.
//         → rawStream(localStreamRef.current)의 트랙이 ended
//         → ensureInfrastructure 초입 liveTracks.length === 0 → 즉시 return false
//         → 또는 이후 루프에서 videoEl에 ended 트랙만 남아 drawImage가 검은 화면
//   수정: srcObject = null 완전 제거. pause()만 호출 후 videoElRef.current = null.
//         대신 rawStream 트랙을 직접 참조하는 새 MediaStream 래퍼(wrapperStream)를
//         video.srcObject에 연결. 래퍼가 해제돼도 원본 트랙은 ended 안 됨.
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [BUG-F] ★★ composeFrame readyState 불일치 → 검은 화면
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//   증상: 처음 배경 선택 시 잠깐 검은 화면, 또는 계속 검은 화면.
//   원인: 함수 상단에서 readyState < 1 이면 return (통과 조건: readyState >= 1).
//         그러나 내부의 모든 ctx.drawImage 호출은 readyState >= 2 조건으로 보호.
//         readyState = 1(HAVE_METADATA)인 경우: 상단 체크 통과 → 내부 drawImage 전부 실행 안 됨
//         → 캔버스에 아무것도 안 그려짐 → 검은 화면.
//   수정: 상단 early-return 조건을 readyState < 2 로 변경.
//         drawImage 호출 시 readyState >= 2 조건 제거 (상단에서 이미 보장됨).
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [BUG-G] ★★ seg.send 비동기 완료 vs onResults 타이밍 → mask=null → 인물 없음
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//   증상: 배경이미지/blur 선택 시 배경만 보이고 인물 없음 (이미지 모드)
//         또는 blur 화면만 보이고 인물 없음.
//   원인: 루프에서 await seg.send({image: videoEl}) 완료 후
//         즉시 composeFrame(videoEl, lastResultsRef.current) 호출.
//         일부 MediaPipe 버전/환경에서 seg.send()의 Promise가 onResults 콜백
//         호출 이전에 resolve됨 → lastResultsRef.current 아직 null
//         → composeFrame에서 mask=null 분기 → 배경 위에 원본 영상 덮어쓰기
//         (블러 배경 위에 원본 = 블러 안 됨, 이미지 배경 위에 원본 = 이미지 안 보임)
//         또는 mask=null → early return 없이 아무것도 그리지 않는 경우도 발생.
//   수정: composeFrame 호출을 onResults 콜백 내부로 이전.
//         seg.send()의 Promise resolves는 루프 타이밍 제어에만 사용.
//         onResults가 실제 results를 가지고 composeFrame을 직접 호출.
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v10 수정 내용 유지:
//  [BUG-A] outputStream state 반환 → React 재렌더 보장
//  [BUG-B] ctx.filter restore 후 명시적 none 리셋
//  [BUG-C] SFU에 canvas track 전달
//  [BUG-1] videoEl 클로저 → ref 참조
//  [BUG-2] 다중 루프 → loopId 세대 카운터
//  [BUG-3] setBackgroundImage 이미지 로드 후 setBackground
//  [BUG-4] audio producer 트랙 교체 복원
//  [BUG-5] teardown 후 ended 트랙 방어
//  [BUG-6] 모드 전환 시 이전 results 초기화

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

function resetSegmentationCache() {
  _segInstance = null;
  _segPromise  = null;
}

// ─────────────────────────────────────────────────────────────────
export function useBackgroundProcessor({ localStreamRef, producersRef, localVideoRef }) {
  const [backgroundMode,  setBackgroundMode]      = useState('none');
  const [backgroundImage, setBackgroundImageState] = useState(null);
  // [BUG-A] outputStream을 state로 관리 → 변경 시 React 재렌더 트리거
  const [outputStream,    setOutputStream]         = useState(null);

  // ── refs ──────────────────────────────────────────────────
  const modeRef          = useRef('none');
  const bgImageRef       = useRef(null);
  const activeRef        = useRef(false);
  const loopIdRef        = useRef(0);
  const rafRef           = useRef(null);
  const intervalRef      = useRef(null);

  const videoElRef       = useRef(null);
  // [BUG-E 수정] rawStream 트랙을 래핑하는 별도 MediaStream — srcObject=null 방지용
  const wrapperStreamRef = useRef(null);
  const canvasRef        = useRef(null);
  // outputStreamRef: 내부 동기 참조용 (state와 항상 동기화 유지)
  const outputStreamRef  = useRef(null);

  const segRef           = useRef(null);

  // ── [BUG-B + BUG-F 수정] composeFrame ──────────────────────
  // BUG-F: 호출 전에 readyState >= 2 보장 → 내부 조건 제거
  // BUG-B: blur save/restore 격리 + restore 후 filter 명시적 none
  const composeFrame = useCallback((videoEl, results) => {
    const canvas = canvasRef.current;
    if (!canvas || !videoEl) return;

    // [BUG-F 수정] readyState >= 2 체크를 여기서도 유지 (방어용)
    // 하지만 startLoop에서 이미 보장하므로 실제로 이 return은 거의 안 탐
    if (videoEl.readyState < 2) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const mode = modeRef.current;

    if (mode === 'none') {
      ctx.drawImage(videoEl, 0, 0, w, h);
      return;
    }

    const mask = results?.segmentationMask;

    // Step 1: 배경 레이어 — save/restore로 filter 완전 격리
    ctx.save();
    if (mode === 'blur') {
      ctx.filter = `blur(${BLUR_AMOUNT}px)`;
      ctx.drawImage(videoEl, -4, -4, w + 8, h + 8);
    } else if (mode === 'image' && bgImageRef.current) {
      const img = bgImageRef.current;
      const s = Math.max(w / img.width, h / img.height);
      const dw = img.width * s;
      const dh = img.height * s;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      // bgImage 아직 없으면 blur fallback
      ctx.filter = `blur(${BLUR_AMOUNT}px)`;
      ctx.drawImage(videoEl, -4, -4, w + 8, h + 8);
    }
    ctx.restore();
    // [BUG-B 수정] restore 후 filter 명시적 초기화 (방어 코드)
    ctx.filter = 'none';

    if (!mask) {
      // mask 없을 때(MediaPipe 초기화 직후) 원본 영상 표시
      ctx.drawImage(videoEl, 0, 0, w, h);
      return;
    }

    // Step 2: 인물 추출 (임시 캔버스)
    // MediaPipe SelfieSegmentation: 인물=white(A=255), 배경=black(A=0)
    // destination-in: 소스(mask) A가 높은 곳의 목적지 픽셀만 유지
    // → 인물 영역만 남기고 배경은 투명 처리
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

  // ── infrastructure 전체 정리 ─────────────────────────────────
  const teardownInfrastructure = useCallback(() => {
    if (outputStreamRef.current) {
      outputStreamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch (_) {}
      });
      outputStreamRef.current = null;
      // [BUG-A] state도 null로 업데이트 → React 재렌더
      setOutputStream(null);
      BP('02', 'outputStream 트랙 stop 완료');
    }

    if (videoElRef.current) {
      try {
        videoElRef.current.pause();
        // [BUG-E 수정] srcObject = null 절대 금지 → Chrome이 rawStream 트랙을 ended 시킴
        // videoElRef.current.srcObject = null;  ← 제거
      } catch (_) {}
      videoElRef.current = null;
    }

    // [BUG-E 수정] wrapperStream 참조만 해제 (트랙 stop 안 함 — 원본 트랙 보호)
    wrapperStreamRef.current = null;
    canvasRef.current = null;

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

    const rawLive = liveTracks[0];

    // [BUG-E 수정] wrapperStream 트랙 ID로 재사용 여부 판단
    const wrapperTracks = wrapperStreamRef.current?.getVideoTracks() || [];
    const wrapperLive = wrapperTracks.find(t => t.readyState === 'live');

    const needsRebuild = !videoElRef.current
      || !wrapperLive
      || wrapperLive.id !== rawLive.id;

    if (needsRebuild) {
      BP('01', `infrastructure 재생성 필요 — wrapperTrack=${wrapperLive?.id?.slice(0,8) ?? 'none'} rawTrack=${rawLive.id.slice(0,8)}`);

      if (videoElRef.current) {
        try {
          videoElRef.current.pause();
          // [BUG-E 수정] srcObject = null 제거! pause()만 사용
          // Chrome에서 srcObject=null 하면 getUserMedia 트랙이 ended됨
        } catch (_) {}
        videoElRef.current = null;
      }

      // [BUG-E 수정] 이전 wrapperStream 참조만 해제 (트랙은 살아있음)
      wrapperStreamRef.current = null;

      BP('01', '내부 video 엘리먼트 생성');
      const video = document.createElement('video');

      // [BUG-E 수정] rawStream 직접 사용 대신 트랙을 공유하는 새 래퍼 스트림 생성
      // 래퍼가 해제/null이 돼도 원본 rawStream의 트랙은 ended 안 됨
      const wrapper = new MediaStream(rawStream.getTracks());
      wrapperStreamRef.current = wrapper;

      video.srcObject   = wrapper;
      video.autoplay    = true;
      video.playsInline = true;
      video.muted       = true;

      // [BUG-F 수정] readyState >= 2(HAVE_CURRENT_DATA) 이상이 될 때까지 대기
      // 이전: readyState >= 2 즉시 resolve → video.play() 미호출 → readyState 진행 안 됨
      // 수정: video.play()를 먼저 호출하고 canplay 이벤트 대기
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
      BP('01', `✅ 내부 video 준비 완료 — readyState=${video.readyState}`);

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

      // [BUG-A] state 업데이트 → React 재렌더 트리거
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
      // [BUG-G 수정] onResults 콜백에서 직접 composeFrame 호출
      // seg.send()의 Promise가 onResults 이전에 resolve되는 타이밍 문제 해결
      seg.onResults(results => {
        if (!activeRef.current || loopIdRef.current !== myLoopId) return;
        const videoEl = videoElRef.current;
        if (!videoEl) return;
        // [BUG-F 수정] readyState >= 2 보장된 경우만 그리기
        if (videoEl.readyState >= 2) {
          composeFrame(videoEl, results);
        }
      });

      const loop = async () => {
        if (!activeRef.current || loopIdRef.current !== myLoopId) return;

        const videoEl = videoElRef.current;
        const canvas  = canvasRef.current;
        if (!videoEl || !canvas) return;

        // [BUG-F 수정] readyState >= 2 미만이면 다음 프레임에서 재시도
        if (videoEl.readyState < 2) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }

        try {
          // [BUG-G 수정] seg.send() 후 composeFrame을 직접 호출하지 않음
          // composeFrame은 onResults 콜백에서 호출됨
          await seg.send({ image: videoEl });
        } catch (_) {
          // send 실패 시 마지막 유효 results로 fallback 렌더
          if (activeRef.current && loopIdRef.current === myLoopId) {
            const videoEl2 = videoElRef.current;
            if (videoEl2 && videoEl2.readyState >= 2) {
              composeFrame(videoEl2, null);
            }
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
        // [BUG-F 수정] readyState >= 2 체크
        if (!videoEl || videoEl.readyState < 2) return;
        composeFrame(videoEl, null);
      }, 1000 / CANVAS_FPS);
    }

    BP('01', '✅ 렌더링 루프 시작');
  }, [composeFrame]);

  // ── seg.onResults 재등록 ──────────────────────────────────
  // [BUG-G 수정] 모드 전환 시 onResults 재등록도 composeFrame 직접 호출 방식으로
  const refreshOnResults = useCallback(() => {
    const seg = segRef.current;
    if (!seg || !activeRef.current) return;
    const myLoopId = loopIdRef.current;
    seg.onResults(results => {
      if (!activeRef.current || loopIdRef.current !== myLoopId) return;
      const videoEl = videoElRef.current;
      if (videoEl && videoEl.readyState >= 2) {
        composeFrame(videoEl, results);
      }
    });
    BP('04', 'seg.onResults 재등록 완료');
  }, [composeFrame]);

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
      // 세그멘테이션 캐시 초기화 (다음 사용 시 재로드)
      segRef.current = null;
      resetSegmentationCache();

    } else {
      // ── 배경 ON (blur / image) ──────────────────────────
      const rawStream = await getOrRefreshRawStream();
      if (!rawStream) return;

      // 1) infrastructure 준비 (이 안에서 outputStreamRef + state 모두 설정됨)
      const ok = await ensureInfrastructure(rawStream);
      if (!ok) return;

      // [BUG-6] 모드 전환 시 이전 results 초기화
      // lastResultsRef 제거됨 → onResults 콜백이 직접 처리하므로 불필요

      // 2) 루프 처리
      if (!activeRef.current) {
        stopLoop(); // 혹시 남아있는 루프 정리
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
          segRef.current = null;
          const ok2 = await ensureInfrastructure(rawStream);
          if (ok2) {
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

    bgImageRef.current = null;
    modeRef.current    = 'none';
    segRef.current     = null;
    resetSegmentationCache();

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
    // [BUG-A] outputStream (state) 반환 — React 재렌더 트리거용
    outputStream,
    // outputStreamRef는 하위 호환성 유지 (VideoMeetingRoom에서 직접 사용하는 경우)
    outputStreamRef,
  };
}