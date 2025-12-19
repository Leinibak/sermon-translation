import React, { useRef, useEffect } from 'react';

export const VideoElement = React.forwardRef(({ stream, isLocal, isVideoOff }, ref) => {
  const defaultRef = useRef();
  const resolvedRef = ref || defaultRef;

  useEffect(() => {
    // 💡 개선 1: stream이 바뀔 때마다 srcObject를 명시적으로 다시 할당
    // 가끔 브라우저가 stream 객체는 유지되는데 내부 트랙이 바뀔 때 갱신을 못하는 경우가 있습니다.
    if (resolvedRef.current) {
      if (stream) {
        if (resolvedRef.current.srcObject !== stream) {
          console.log(`🎥 [VideoElement] 스트림 연결 (${isLocal ? '로컬' : '원격'})`);
          resolvedRef.current.srcObject = stream;
        }
      } else {
        resolvedRef.current.srcObject = null;
      }
    }
  }, [stream, resolvedRef, isLocal]);

  return (
    <video
      ref={resolvedRef}
      autoPlay
      playsInline
      muted={isLocal}
      // 💡 개선 2: scaleX(-1)은 CSS className보다는 style이 더 안정적일 수 있습니다.
      // 또한 className에 'transform'을 직접 쓰는 대신 템플릿 리터럴을 잘 활용하셨습니다.
      className={`w-full h-full object-cover ${isLocal ? '-scale-x-100' : ''}`} // Tailwind 사용 시
      style={{ 
        display: isVideoOff ? 'none' : 'block',
        // 로컬 화면(내 화면)은 거울처럼 보이게 반전시키는 것이 사용자에게 자연스럽습니다.
        transform: isLocal ? 'scaleX(-1)' : 'none' 
      }}
    />
  );
});

VideoElement.displayName = 'VideoElement';