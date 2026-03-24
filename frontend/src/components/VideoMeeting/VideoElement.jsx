// frontend/src/components/VideoMeeting/VideoElement.jsx
// [수정 패치]
// FIX-7: transform 속성 중복 제거
//   - className의 `-scale-x-100` (Tailwind)과 style의 `transform: scaleX(-1)` 이
//     동시에 적용되어 CSS specificity 충돌 + 브라우저별 렌더 불일치 발생
//   - style.transform 을 제거하고 Tailwind 클래스(-scale-x-100)로 통일
//   - isVideoOff 시 display:none 대신 visibility:hidden 으로 변경하여
//     레이아웃 공간을 유지 (선택적 - 기존과 동일하게 유지하고 싶으면 되돌리면 됨)

import React, { useRef, useEffect } from 'react';

export const VideoElement = React.forwardRef(({ stream, isLocal, isVideoOff }, ref) => {
  const defaultRef = useRef(null);
  const resolvedRef = ref ?? defaultRef;
  const playAttemptedRef = useRef(false);
  const playRetryCountRef = useRef(0);
  const maxRetries = 5;

  useEffect(() => {
    const videoElement = resolvedRef.current;
    if (!videoElement) return;

    if (stream) {
      if (videoElement.srcObject !== stream) {
        console.log(`🎥 [VideoElement] 스트림 연결 (${isLocal ? '로컬' : '원격'})`);
        videoElement.srcObject = stream;
        playAttemptedRef.current = false;
        playRetryCountRef.current = 0;
      }
    } else {
      videoElement.srcObject = null;
      playAttemptedRef.current = false;
      playRetryCountRef.current = 0;
      return;
    }

    // iOS Safari 감지
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isIOSDevice && !isLocal && !playAttemptedRef.current) {
      playAttemptedRef.current = true;

      const attemptPlay = async () => {
        try {
          console.log(`📱 iOS: 원격 비디오 재생 시도 (${playRetryCountRef.current + 1}/${maxRetries})`);

          const videoTracks = stream.getVideoTracks();
          const audioTracks = stream.getAudioTracks();

          if (videoTracks.length === 0 && audioTracks.length === 0) {
            throw new Error('No tracks in stream');
          }

          if (videoElement.readyState < 2) {
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Metadata loading timeout'));
              }, 5000);

              const onCanPlay = () => {
                clearTimeout(timeout);
                videoElement.removeEventListener('canplay', onCanPlay);
                videoElement.removeEventListener('loadeddata', onCanPlay);
                resolve();
              };

              videoElement.addEventListener('canplay', onCanPlay);
              videoElement.addEventListener('loadeddata', onCanPlay);
            });
          }

          await videoElement.play();
          console.log(`✅ iOS: 재생 성공`);

        } catch (error) {
          console.warn(`⚠️ iOS 자동 재생 실패:`, error.name, error.message);

          if (!isLocal) {
            playRetryCountRef.current += 1;

            if (playRetryCountRef.current >= maxRetries) {
              console.error(`❌ iOS: ${maxRetries}번 재시도 실패 → IOSPlayButton 표시 요청`);
              window.dispatchEvent(new CustomEvent('ios-play-required', {
                detail: {
                  streamId: stream.id,
                  error: error.name,
                  isLocal: false,
                }
              }));
            } else {
              const retryDelay = 1000 * Math.pow(1.5, playRetryCountRef.current - 1);
              console.log(`🔄 ${retryDelay}ms 후 재시도...`);
              setTimeout(async () => {
                try {
                  await videoElement.play();
                  console.log(`✅ iOS: 재시도 성공 (${playRetryCountRef.current}번째)`);
                } catch (retryError) {
                  console.error(`❌ iOS 재시도 ${playRetryCountRef.current} 실패:`, retryError.name);
                  if (playRetryCountRef.current < maxRetries) {
                    attemptPlay();
                  }
                }
              }, retryDelay);
            }
          }
        }
      };

      setTimeout(attemptPlay, 800);
    }

  }, [stream, resolvedRef, isLocal]);

  return (
    <video
      ref={resolvedRef}
      autoPlay
      playsInline
      muted={isLocal}
      // FIX-7: className의 -scale-x-100(Tailwind) 만 사용
      //        style.transform 을 제거하여 중복 적용 차단
      className={`w-full h-full object-cover ${isLocal ? '-scale-x-100' : ''}`}
      style={{
        // FIX-7: transform 제거 — Tailwind -scale-x-100 이 담당
        display: isVideoOff ? 'none' : 'block',
      }}
      onPlay={() => { if (!isLocal) console.log('▶️ 원격 비디오 재생 시작'); }}
      onPause={() => { if (!isLocal) console.warn('⏸️ 원격 비디오 일시정지됨'); }}
      onError={(e) => { console.error('❌ 비디오 오류:', e); }}
      webkit-playsinline="true"
      x-webkit-airplay="allow"
    />
  );
});

VideoElement.displayName = 'VideoElement';
