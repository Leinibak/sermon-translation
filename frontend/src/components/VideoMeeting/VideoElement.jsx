// VideoElement.jsx - iOS 비디오 재생 로직 개선

import React, { useRef, useEffect } from 'react';

export const VideoElement = React.forwardRef(({ stream, isLocal, isVideoOff }, ref) => {
  const defaultRef = useRef();
  const resolvedRef = ref || defaultRef;
  const playAttemptedRef = useRef(false);
  const playRetryCountRef = useRef(0);
  const maxRetries = 5; // ⭐ 재시도 횟수 증가

  useEffect(() => {
    const videoElement = resolvedRef.current;
    
    if (!videoElement) return;

    // 스트림 변경 시 srcObject 업데이트
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

    // 📱 iOS Safari 감지
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    // ⭐ 수정: 원격 비디오에서만 자동 재생 시도
    if (isIOS && !isLocal && !playAttemptedRef.current) {
      playAttemptedRef.current = true;
      
      const attemptPlay = async () => {
        try {
          console.log(`📱 iOS: ${isLocal ? '로컬' : '원격'} 비디오 재생 시도 (${playRetryCountRef.current + 1}/${maxRetries})`);
          
          // ⭐⭐⭐ 1단계: 스트림 트랙 확인
          const videoTracks = stream.getVideoTracks();
          const audioTracks = stream.getAudioTracks();
          
          console.log('📊 스트림 트랙:', {
            video: videoTracks.length,
            audio: audioTracks.length,
            videoReady: videoTracks[0]?.readyState,
            audioReady: audioTracks[0]?.readyState
          });
          
          if (videoTracks.length === 0 && audioTracks.length === 0) {
            throw new Error('No tracks in stream');
          }
          
          // ⭐⭐⭐ 2단계: readyState 확인 및 대기
          if (videoElement.readyState < 2) { // HAVE_CURRENT_DATA
            console.log(`⏳ iOS: readyState=${videoElement.readyState} - 대기 중...`);
            
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Metadata loading timeout'));
              }, 5000); // ⭐ 타임아웃 5초로 증가
              
              const onCanPlay = () => {
                clearTimeout(timeout);
                videoElement.removeEventListener('canplay', onCanPlay);
                videoElement.removeEventListener('loadeddata', onCanPlay);
                console.log(`✅ iOS: 비디오 데이터 로드 완료`);
                resolve();
              };
              
              videoElement.addEventListener('canplay', onCanPlay);
              videoElement.addEventListener('loadeddata', onCanPlay);
            });
          }
          
          // ⭐⭐⭐ 3단계: 재생 시도
          console.log(`🎬 iOS: 재생 시도 (readyState=${videoElement.readyState})`);
          
          await videoElement.play();
          console.log(`✅ iOS: 재생 성공`);
          
        } catch (error) {
          console.warn(`⚠️ iOS 자동 재생 실패 (${isLocal ? '로컬' : '원격'}):`, error.name, error.message);
          
          // ⭐⭐⭐ 핵심: 원격 비디오 재생 실패 시 이벤트 발송
          if (!isLocal) {
            playRetryCountRef.current += 1;
            
            if (playRetryCountRef.current >= maxRetries) {
              console.error(`❌ iOS: ${maxRetries}번 재시도 실패 → IOSPlayButton 표시 요청`);
              
              // ⭐ 커스텀 이벤트 발송
              window.dispatchEvent(new CustomEvent('ios-play-required', {
                detail: {
                  streamId: stream.id,
                  videoElement: videoElement,
                  error: error.name,
                  isLocal: false
                }
              }));
            } else {
              // 🔄 재시도 (지수 백오프)
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

      // ⏳ 약간의 지연 후 재생 시도
      const initialDelay = isLocal ? 100 : 800; // ⭐ 원격 비디오 지연 증가
      setTimeout(attemptPlay, initialDelay);
    }

  }, [stream, resolvedRef, isLocal]);

  return (
    <video
      ref={resolvedRef}
      autoPlay
      playsInline
      muted={isLocal}
      className={`w-full h-full object-cover ${isLocal ? '-scale-x-100' : ''}`}
      style={{ 
        display: isVideoOff ? 'none' : 'block',
        transform: isLocal ? 'scaleX(-1)' : 'none'
      }}
      // ⭐ iOS 디버깅용 이벤트 핸들러
      onPlay={() => {
        if (!isLocal) {
          console.log('▶️ 원격 비디오 재생 시작');
        }
      }}
      onPause={() => {
        if (!isLocal) {
          console.warn('⏸️ 원격 비디오 일시정지됨');
        }
      }}
      onError={(e) => {
        console.error('❌ 비디오 오류:', e);
      }}
      // ⭐ iOS 최적화 속성 추가
      webkit-playsinline="true"
      x-webkit-airplay="allow"
    />
  );
});

VideoElement.displayName = 'VideoElement';