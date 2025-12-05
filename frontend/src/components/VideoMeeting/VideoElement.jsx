// frontend/src/components/VideoMeeting/VideoElement.jsx
import React, { useRef, useEffect } from 'react';

export const VideoElement = React.forwardRef(({ stream, isLocal, isVideoOff }, ref) => {
  const defaultRef = useRef();
  const resolvedRef = ref || defaultRef;

  useEffect(() => {
    if (resolvedRef.current && stream) {
      resolvedRef.current.srcObject = stream;
    }
  }, [stream, resolvedRef]);

  return (
    <video
      ref={resolvedRef}
      autoPlay
      playsInline
      muted={isLocal}
      className={`w-full h-full object-cover ${isLocal ? 'transform scaleX(-1)' : ''}`}
      style={{ display: isVideoOff ? 'none' : 'block' }}
    />
  );
});

VideoElement.displayName = 'VideoElement';