// frontend/src/components/VideoMeeting/IOSPlayButton.jsx
// 기존 코드 개선

import React from 'react';
import { Play } from 'lucide-react';

export function IOSPlayButton({ onPlay, show }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-6 max-w-sm text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Play className="w-8 h-8 text-blue-600" />
        </div>
        
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          비디오 재생 시작
        </h3>
        
        <p className="text-gray-600 mb-6">
          iOS Safari에서는 사용자 동작이 필요합니다.<br />
          아래 버튼을 눌러 상대방의 영상을 재생하세요.
        </p>
        
        <button
          onClick={onPlay}
          className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center touch-manipulation"
        >
          <Play className="w-5 h-5 mr-2" />
          재생 시작
        </button>
        
        {/* ⭐ 추가: 안내 텍스트 */}
        <p className="text-xs text-gray-500 mt-4">
          💡 Safari 설정 {'>'} 카메라/마이크 권한 확인
        </p>
      </div>
    </div>
  );
}