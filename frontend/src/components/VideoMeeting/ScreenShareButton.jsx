// frontend/src/components/VideoMeeting/ScreenShareButton.jsx
import React from 'react';
import { MonitorUp, MonitorX } from 'lucide-react';

export function ScreenShareButton({ 
  isScreenSharing, 
  onStart, 
  onStop,
  disabled = false 
}) {
  const handleClick = () => {
    if (isScreenSharing) {
      onStop();
    } else {
      onStart();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`p-3 rounded-full transition ${
        isScreenSharing
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'bg-white text-gray-900 hover:bg-gray-200'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
      title={isScreenSharing ? '화면 공유 중지' : '화면 공유 시작'}
    >
      {isScreenSharing ? (
        <MonitorX className="w-6 h-6" />
      ) : (
        <MonitorUp className="w-6 h-6" />
      )}
    </button>
  );
}