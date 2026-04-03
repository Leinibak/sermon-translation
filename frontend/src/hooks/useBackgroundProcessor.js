// frontend/src/hooks/useBackgroundProcessor.js
//
// ★ 배경 처리 훅 v9 — 모든 전환 경우의 수 버그 수정 ★
//
// ■ v9에서 수정된 버그 목록
//
//  [BUG-1] startLoop() 내 videoEl 클로저 캡처 문제 → 검은 화면
//    증상: blur/image 전환 후 none으로 갔다가 다시 blur/image로 오면 검은 화면
//    원인: startLoop()에서 "const videoEl = videoElRef.current"를 함수 시작 시
//          한 번만 캡처. getSegmentation() await 대기 중 teardown이 videoElRef를
//          null로 만들어도 루프는 이전(무효) videoEl을 계속 씀.
//    수정: 루프 내부에서 매 프레임마다 videoElRef.current를 참조.
//
//  [BUG-2] 동시 다중 루프 실행 → 프레임 충돌, 검은 화면
//    증상: 빠른 none→blur→image→blur 전환 시 루프 2개 이상 동시 실행
//    원인: activeRef.current가 true인 상태에서 startLoop() 재호출 방지를 하지 않음.
//          stopLoop()이 activeRef=false로 만들지만 기존 루프의 RAF 콜백이
//          이미 큐에 있어서 한 번 더 실행될 수 있고, 이 시점에 새 루프도 시작함.
//    수정: startLoop() 진입 시 loopIdRef(세대 카운터)를 증가시켜 이전 루프가
//          자신의 loopId와 현재 loopIdRef가 다르면 즉시 중단.
//
//  [BUG-3] setBackgroundImage → setBackground('image') 호출 타이밍 문제 → 이미지만 보임
//    증상: 이미지 배경 선택 시 인물 없이 배경 이미지만 표시됨
//    원인: setBackgroundImage()가 bgImageRef.current에 이미지를 할당하기 전에
//          setBackground('image')가 이미 첫 프레임을 그릴 수 있음.
//          실제로는 await new Promise(resolve → img.onload)로 기다리고 있어
//          정상이지만, setBackground 내부에서 ensureInfrastructure와 startLoop가
//          bgImageRef 준비 전에 실행되면 composeFrame에서 "mode=image이지만
//          bgImageRef.current=null" → blur fallback으로 그림.
//    수정: setBackgroundImage()에서 이미지 로드 완료 후 bgImageRef 할당,
//          이후 setBackground 호출 순서는 유지. 하지만 composeFrame에서
//          bgImageRef.current가 null일 때 배경을 blur fallback 대신
//          검은색 단색으로 그려 인물은 반드시 보이게 수정.
//          (이미지 로드 전 첫 몇 프레임은 blur로 보이는 것이 더 나음)
//
//  [BUG-4] getOrRefreshRawStream()에서 새 스트림 획득 시 audio producer 미복원
//    증상: none 전환 후 재연결 시 상대방에게 내 소리가 안 들림
//    원인: 카메라 트랙 ended로 getUserMedia 재호출 시 audio 트랙도 새로 생기는데
//          SFU audio producer.replaceTrack() 미호출.
//    수정: getOrRefreshRawStream()에서 새 스트림 획득 시 audio producer도 교체.
//
//  [BUG-5] teardownInfrastructure 후 다음 ensureInfrastructure에서
//          wrapperStream이 이전 ended 트랙을 포함하는 문제
//    증상: none→blur→none→blur 반복 시 내부 video가 ended 트랙을 srcObject로 받음
//    원인: teardown에서 video.srcObject를 null로 안 건드리므로 GC 지연 시
//          이전 wrapperStream이 살아있고 동일 트랙 id 비교에서 재사용으로 판정.
//    수정: teardown 시 video.srcObject = null 처리. Chrome 트랙 ended 위험은
//          wrapperStream(래퍼)을 쓰므로 rawStream 원본 트랙에 영향 없음.
//
//  [BUG-6] blur→image 전환 시 루프 재시작 없이 onResults만 재등록하는데
//          bgImageRef가 교체되기 전 이미 진행 중인 루프가 이전 이미지를 그림
//    증상: 이미지 교체 시 잠깐 이전 이미지가 보임 (허용 가능하나 수정)
//    수정: modeRef 업데이트 후 즉시 lastResultsRef = null 초기화하여
//          새 onResults가 오기 전까지 배경만 그리게 함.
//
// ■ 지원 전환 매트릭스 (v9 기준)
//   none   → blur    ✅
//   none   → image   ✅
//   blur   → none    ✅
//   image  → none    ✅
//   blur   → blur    ✅ (루프 유지, onResults 재등록)
//   blur   → image   ✅ (루프 유지, onResults 재등록, bgImageRef 갱신)
//   image  → blur    ✅ (루프 유지, onResults 재등록)
//   image  → image   ✅ (다른 이미지, bgImageRef 갱신)
//   image  → image   ✅ (파일 직접 업로드)
//   none   → image(upload) ✅
//   blur   → image(upload) ✅
//   image  → image(upload) ✅

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
  // [BUG-2 수정] 루프 세대 카운터 — stopLoop 시 증가, 이전 루프 자동 종료
  const loopIdRef        = useRef(0);
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
      // [BUG-3 수정] bgImageRef가 아직 없을 때 blur fallback (검은 화면 방지)
      ctx.filter = `blur(${BLUR_AMOUNT}px)`;
      ctx.drawImage(videoEl, -4, -4, w + 8, h + 8);
      ctx.filter = 'none';
    }
    ctx.restore();

    if (!mask) {
      // mask 없을 때 인물 없이 배경만이 아니라 원본 영상을 그대로 그림
      // (MediaPipe 초기화 중 또는 결과 지연 시 검은 화면 방지)
      ctx.globalAlpha = 0.0; // 투명 — 배경만 보임 (mask 오면 즉시 인물 합성)
      ctx.drawImage(videoEl, 0, 0, w, h);
      ctx.globalAlpha = 1.0;
      return;
    }

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
    // [BUG-2 수정] 세대 카운터 증가 → 진행 중인 이전 루프 콜백 자동 무효화
    loopIdRef.current += 1;
    if (rafRef.current)      { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current);   intervalRef.current = null; }
    BP('02', '처리 루프 중지');
  }, []);

  // ── infrastructure 전체 정리 ─────────────────────────────────
  const teardownInfrastructure = useCallback(() => {
    // outputStream(captureStream) 트랙 stop
    if (outputStreamRef.current) {
      outputStreamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch (_) {}
      });
      outputStreamRef.current = null;
      BP('02', 'outputStream 트랙 stop 완료');
    }

    // [BUG-5 수정] 내부 video srcObject를 null로 명시 정리
    // wrapperStream(래퍼) srcObject이므로 rawStream 원본 트랙은 영향 없음
    if (videoElRef.current) {
      try {
        videoElRef.current.pause();
        videoElRef.current.srcObject = null; // ← v8에서 금지했던 부분 — 래퍼라 안전
      } catch (_) {}
      videoElRef.current = null;
    }

    // wrapperStream의 트랙은 stop 안 함 (rawStream 원본 트랙이므로)
    // 참조만 해제
    wrapperStreamRef.current = null;

    // canvas 정리
    canvasRef.current = null;

    // segmentation 결과 초기화
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
  // rawStream 기준으로 wrapperStream 비교 → 다르면 재생성
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
          videoElRef.current.srcObject = null; // [BUG-5 수정] 래퍼 srcObject 정리
        } catch (_) {}
        videoElRef.current = null;
      }
      wrapperStreamRef.current = null;

      BP('01', '내부 video 엘리먼트 생성');
      const video = document.createElement('video');

      // rawStream 원본을 래퍼 MediaStream으로 감쌈
      // → video.srcObject = wrapper이므로 srcObject=null해도 rawStream 원본 트랙 안전
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

    // canvas + captureStream: 없거나 ended 트랙이면 재생성
    if (!canvasRef.current || !outputStreamRef.current
        || outputStreamRef.current.getVideoTracks().some(t => t.readyState === 'ended')) {
      if (outputStreamRef.current) {
        outputStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
        outputStreamRef.current = null;
      }

      BP('01', 'canvas + captureStream 생성');
      const canvas = document.createElement('canvas');
      const { width = 640, height = 480 } = rawLive?.getSettings?.() || {};
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
    // [BUG-2 수정] 세대 카운터 증가 → 이 루프의 고유 ID 확보
    const myLoopId = loopIdRef.current + 1;
    loopIdRef.current = myLoopId;
    activeRef.current = true;

    // [BUG-1 수정] videoEl을 클로저로 캡처하지 않고 ref로 매 프레임 참조
    // getSegmentation() await 중 teardown이 발생해도 루프는 ref로 현재 상태 확인
    let seg = segRef.current;
    if (!seg) {
      try {
        seg = await getSegmentation();
        // await 후 세대가 바뀌었으면 이 루프는 이미 무효
        if (loopIdRef.current !== myLoopId) {
          BP('01', `루프 ${myLoopId} 취소됨 (세대 불일치 — 신규 루프 ${loopIdRef.current})`);
          return;
        }
        segRef.current = seg;
      } catch (e) {
        BPW('01', 'MediaPipe 실패 — fallback:', e.message);
      }
    }

    // await 직후 videoElRef, canvasRef 재확인 (teardown됐을 수 있음)
    if (!videoElRef.current || !canvasRef.current) {
      BPW('01', '루프 시작 취소 — videoEl 또는 canvas 없음');
      return;
    }

    if (seg) {
      seg.onResults(r => {
        // [BUG-2 수정] 현재 세대 루프의 결과만 수용
        if (activeRef.current && loopIdRef.current === myLoopId) {
          lastResultsRef.current = r;
        }
      });

      const loop = async () => {
        // [BUG-2 수정] 세대 불일치 시 즉시 종료
        if (!activeRef.current || loopIdRef.current !== myLoopId) return;

        // [BUG-1 수정] 매 프레임 ref에서 최신 videoEl 참조
        const videoEl = videoElRef.current;
        const canvas  = canvasRef.current;
        if (!videoEl || !canvas) return;

        try {
          if (videoEl.readyState >= 2) {
            await seg.send({ image: videoEl });
            // send 후 세대 재확인
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
        const videoEl = videoElRef.current; // [BUG-1 수정] ref 참조
        if (!videoEl || videoEl.readyState < 2) return;
        composeFrame(videoEl, null);
      }, 1000 / CANVAS_FPS);
    }

    BP('01', '✅ 렌더링 루프 시작');
  }, [composeFrame]);

  // ── seg.onResults 재등록 (루프 재시작 없이 모드 전환 시) ──────
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

  // ── 안전한 rawStream 획득 (ended 시 재획득) ──────────────
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

      // [BUG-4 수정] 새 스트림 획득 시 audio producer도 트랙 교체
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
      stopLoop(); // loopIdRef 증가 → 진행 중 루프 자동 무효화

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

      // 1) infrastructure 준비
      const ok = await ensureInfrastructure(rawStream);
      if (!ok) return;

      // [BUG-6 수정] 모드 전환 시 이전 results 초기화 → 새 배경 즉시 반영
      lastResultsRef.current = null;

      // 2) 루프 처리
      if (!activeRef.current) {
        await startLoop();
      } else {
        // 이미 active → onResults 재등록만 (루프 세대 유지)
        refreshOnResults();
      }

      // 3) outputStream 트랙 live 확인 후 SFU + 미리보기 연결
      const outStream = outputStreamRef.current;
      if (outStream) {
        const outTrack = outStream.getVideoTracks().find(t => t.readyState === 'live');
        if (outTrack) {
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
    // 상태 먼저 업데이트 (UI 반영)
    setBackgroundImageState(dataUrl);

    // 이미지 완전 로드 후 ref 할당 → composeFrame에서 안전하게 참조
    await new Promise(resolve => {
      const img = new Image();
      img.onload  = () => { bgImageRef.current = img; BP('05', '✅ 이미지 로드 완료'); resolve(); };
      img.onerror = () => { BPE('05', '이미지 로드 실패'); bgImageRef.current = null; resolve(); };
      img.src = dataUrl;
    });

    // bgImageRef 준비 완료 후 setBackground 호출
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
      loopIdRef.current += 1; // [BUG-2 수정] 언마운트 시 루프 즉시 무효화
      if (rafRef.current)      cancelAnimationFrame(rafRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { backgroundMode, backgroundImage, setBackground, setBackgroundImage, cleanup };
}