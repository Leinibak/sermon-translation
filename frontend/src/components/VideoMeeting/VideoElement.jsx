// frontend/src/components/VideoMeeting/VideoElement.jsx
//
// ★ DIAGNOSTIC BUILD ★
// [VE-Dxx] 태그로 진단 로그 추가.
// 브라우저 콘솔에서 "VE-D" 로 필터.
//
// 진단 포인트:
//  VE-D01  stream/srcObject 연결 시점
//  VE-D02  track 상태 (kind / readyState / enabled / muted)
//  VE-D03  video element 상태 (readyState / paused / error)
//  VE-D04  iOS 재생 시도/성공/실패

import React, { useRef, useEffect } from 'react';

const VED = (tag, ...args) => {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`%c[VE-D${tag}] ${ts}`, 'color:#ce93d8;font-weight:bold', ...args);
};
const VEDE = (tag, ...args) => {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`%c[VE-D${tag}] ${ts}`, 'color:#f44336;font-weight:bold', ...args);
};
const VEDW = (tag, ...args) => {
  const ts = new Date().toISOString().slice(11, 23);
  console.warn(`%c[VE-D${tag}] ${ts}`, 'color:#ff9800;font-weight:bold', ...args);
};

export const VideoElement = React.forwardRef(({ stream, isLocal, isVideoOff }, ref) => {
  const defaultRef = useRef(null);
  const resolvedRef = ref ?? defaultRef;
  const playAttemptedRef  = useRef(false);
  const playRetryCountRef = useRef(0);
  const maxRetries = 5;

  useEffect(() => {
    const videoEl = resolvedRef.current;
    if (!videoEl) {
      VEDW('01', `videoElement ref is null — isLocal=${isLocal}`);
      return;
    }

    if (!stream) {
      if (videoEl.srcObject) {
        VEDW('01', `stream=null → srcObject 해제 (isLocal=${isLocal})`);
        videoEl.srcObject = null;
      }
      playAttemptedRef.current  = false;
      playRetryCountRef.current = 0;
      return;
    }

    // ── [VE-D01] stream → srcObject 연결 ───────────────────
    const tracks   = stream.getTracks();
    const vTracks  = stream.getVideoTracks();
    const aTracks  = stream.getAudioTracks();

    VED('01', `stream 연결 — isLocal=${isLocal} streamId="${stream.id}" totalTracks=${tracks.length}`);
    VED('02', `  videoTracks=${vTracks.length}:`, vTracks.map(t => `id=${t.id.slice(0,8)} readyState=${t.readyState} enabled=${t.enabled} muted=${t.muted}`));
    VED('02', `  audioTracks=${aTracks.length}:`, aTracks.map(t => `id=${t.id.slice(0,8)} readyState=${t.readyState} enabled=${t.enabled} muted=${t.muted}`));

    if (tracks.length === 0) {
      VEDW('01', `★ stream에 트랙이 없음 — 검은 화면/소리없음의 원인`);
    }

    if (vTracks.length === 0 && !isLocal) {
      VEDW('01', `★ videoTrack 없음 — audio only 스트림이거나 video consume 실패`);
    }

    if (videoEl.srcObject !== stream) {
      VED('01', `srcObject 신규 연결 (이전 srcObject=${!!videoEl.srcObject})`);
      videoEl.srcObject = stream;
      playAttemptedRef.current  = false;
      playRetryCountRef.current = 0;
    } else {
      VED('01', `srcObject 동일 스트림 — 재연결 불필요`);
    }

    // ── [VE-D03] video element 현재 상태 ───────────────────
    VED('03', `<video> 상태 — readyState=${videoEl.readyState} paused=${videoEl.paused} muted=${videoEl.muted} autoplay=${videoEl.autoplay} playsInline=${videoEl.playsInline}`);

    // ── [VE-D04] iOS 재생 처리 ──────────────────────────────
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isIOSDevice && !isLocal && !playAttemptedRef.current) {
      playAttemptedRef.current = true;
      VED('04', `iOS 감지 — 원격 비디오 재생 시도 예약`);

      const attemptPlay = async () => {
        try {
          VED('04', `iOS 재생 시도 #${playRetryCountRef.current + 1}/${maxRetries} — readyState=${videoEl.readyState}`);

          const videoTracks = stream.getVideoTracks();
          const audioTracks = stream.getAudioTracks();

          if (videoTracks.length === 0 && audioTracks.length === 0) {
            throw new Error('No tracks in stream');
          }

          if (videoEl.readyState < 2) {
            VED('04', `readyState<2 — canplay/loadeddata 이벤트 대기`);
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Metadata loading timeout'));
              }, 5000);
              const onCanPlay = () => {
                clearTimeout(timeout);
                videoEl.removeEventListener('canplay', onCanPlay);
                videoEl.removeEventListener('loadeddata', onCanPlay);
                VED('04', `canplay/loadeddata 이벤트 수신 — readyState=${videoEl.readyState}`);
                resolve();
              };
              videoEl.addEventListener('canplay', onCanPlay);
              videoEl.addEventListener('loadeddata', onCanPlay);
            });
          }

          await videoEl.play();
          VED('04', `✅ iOS 재생 성공`);

        } catch (error) {
          VEDW('04', `iOS 재생 실패 #${playRetryCountRef.current + 1}: ${error.name} — ${error.message}`);

          if (!isLocal) {
            playRetryCountRef.current += 1;
            if (playRetryCountRef.current >= maxRetries) {
              VEDE('04', `${maxRetries}회 재시도 실패 → IOSPlayButton 표시 요청`);
              window.dispatchEvent(new CustomEvent('ios-play-required', {
                detail: { streamId: stream.id, error: error.name, isLocal: false },
              }));
            } else {
              const retryDelay = 1000 * Math.pow(1.5, playRetryCountRef.current - 1);
              VED('04', `${retryDelay}ms 후 재시도...`);
              setTimeout(async () => {
                try {
                  await videoEl.play();
                  VED('04', `✅ iOS 재시도 성공 #${playRetryCountRef.current}`);
                } catch (retryError) {
                  VEDE('04', `iOS 재시도 실패 #${playRetryCountRef.current}: ${retryError.name}`);
                  if (playRetryCountRef.current < maxRetries) attemptPlay();
                }
              }, retryDelay);
            }
          }
        }
      };

      setTimeout(attemptPlay, 800);
    }

  }, [stream, resolvedRef, isLocal]);

  // track 상태 변화 감시 (live tracks)
  useEffect(() => {
    if (!stream) return;
    const tracks = stream.getTracks();
    const onended = (e) => VEDW('02', `track ended — kind="${e.target.kind}" id="${e.target.id.slice(0,8)}"`);
    const onmute  = (e) => VEDW('02', `track muted  — kind="${e.target.kind}" id="${e.target.id.slice(0,8)}"`);
    const onunmute= (e) => VED  ('02', `track unmuted— kind="${e.target.kind}" id="${e.target.id.slice(0,8)}"`);
    tracks.forEach(t => {
      t.addEventListener('ended',   onended);
      t.addEventListener('mute',    onmute);
      t.addEventListener('unmute',  onunmute);
    });
    return () => {
      tracks.forEach(t => {
        t.removeEventListener('ended',  onended);
        t.removeEventListener('mute',   onmute);
        t.removeEventListener('unmute', onunmute);
      });
    };
  }, [stream]);

  return (
    <video
      ref={resolvedRef}
      autoPlay
      playsInline
      muted={isLocal}
      className={`w-full h-full object-cover ${isLocal ? '-scale-x-100' : ''}`}
      style={{ display: isVideoOff ? 'none' : 'block' }}
      onPlay={() => {
        const v = resolvedRef.current;
        VED('03', `▶️ onPlay — isLocal=${isLocal} videoWidth=${v?.videoWidth} videoHeight=${v?.videoHeight}`);
      }}
      onCanPlay={() => {
        const v = resolvedRef.current;
        VED('03', `canPlay — readyState=${v?.readyState} videoWidth=${v?.videoWidth}×${v?.videoHeight}`);
      }}
      onLoadedMetadata={() => {
        const v = resolvedRef.current;
        VED('03', `loadedMetadata — videoWidth=${v?.videoWidth} videoHeight=${v?.videoHeight}`);
        if (v?.videoWidth === 0 && !isLocal) {
          VEDW('03', `★ videoWidth=0 — 영상 트랙이 없거나 아직 미수신`);
        }
      }}
      onPause={() => {
        if (!isLocal) VEDW('03', `⏸️ onPause (예상치 못한 일시정지) — isLocal=${isLocal}`);
      }}
      onStalled={() => VEDW('03', `onStalled — 버퍼 중단 isLocal=${isLocal}`)}
      onWaiting={() => VED ('03', `onWaiting — 버퍼 부족 isLocal=${isLocal}`)}
      onError={(e) => {
        const v = resolvedRef.current;
        VEDE('03', `onError — isLocal=${isLocal} error.code=${v?.error?.code} error.message=${v?.error?.message}`, e);
      }}
      webkit-playsinline="true"
      x-webkit-airplay="allow"
    />
  );
});

VideoElement.displayName = 'VideoElement';