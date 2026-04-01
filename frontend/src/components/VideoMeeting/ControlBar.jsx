// frontend/src/components/VideoMeeting/ControlBar.jsx
// [변경 내역]
// - BackgroundButton import 및 렌더링 추가
// - onToggleBackground, backgroundMode prop 추가

import React from 'react';
import { Video, VideoOff, Mic, MicOff, PhoneOff } from 'lucide-react';
import { BackgroundButton } from './BackgroundSelector';

export function ControlBar({
  isMicOn,
  isVideoOn,
  onToggleMic,
  onToggleVideo,
  onLeave,
  // ── 배경 효과 관련 (선택적 props) ──
  backgroundMode = 'none',
  onToggleBackground,
}) {
  return (
    <div className="flex justify-center items-center gap-3 md:gap-6">
      {/* 마이크 버튼 */}
      <button
        onClick={onToggleMic}
        className={`p-2 md:p-3 rounded-full transition ${
          isMicOn
            ? 'bg-white text-gray-900 hover:bg-gray-200'
            : 'bg-red-600 text-white hover:bg-red-700'
        }`}
        title={isMicOn ? '마이크 끄기' : '마이크 켜기'}
      >
        {isMicOn ? (
          <Mic className="w-5 h-5 md:w-6 md:h-6" />
        ) : (
          <MicOff className="w-5 h-5 md:w-6 md:h-6" />
        )}
      </button>

      {/* 비디오 버튼 */}
      <button
        onClick={onToggleVideo}
        className={`p-2 md:p-3 rounded-full transition ${
          isVideoOn
            ? 'bg-white text-gray-900 hover:bg-gray-200'
            : 'bg-red-600 text-white hover:bg-red-700'
        }`}
        title={isVideoOn ? '비디오 끄기' : '비디오 켜기'}
      >
        {isVideoOn ? (
          <Video className="w-5 h-5 md:w-6 md:h-6" />
        ) : (
          <VideoOff className="w-5 h-5 md:w-6 md:h-6" />
        )}
      </button>

      {/* ── 배경 효과 버튼 (onToggleBackground가 있을 때만 표시) ── */}
      {onToggleBackground && (
        <BackgroundButton
          backgroundMode={backgroundMode}
          onClick={onToggleBackground}
        />
      )}

      {/* 나가기 버튼 */}
      <button
        onClick={onLeave}
        className="p-2 md:p-3 bg-red-800 text-white rounded-full hover:bg-red-900 transition"
        title="회의 나가기"
      >
        <PhoneOff className="w-5 h-5 md:w-6 md:h-6" />
      </button>
    </div>
  );
}