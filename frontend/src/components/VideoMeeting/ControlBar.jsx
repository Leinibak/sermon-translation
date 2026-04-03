// frontend/src/components/VideoMeeting/ControlBar.jsx
// [변경 내역]
// - BackgroundButton import 및 렌더링 추가
// - onToggleBackground, backgroundMode prop 추가
// - ✅ [버그수정] 방장 나가기: window.confirm 팝업 → 버튼 주위 팝오버 메뉴로 교체
//   - 방장: 버튼 클릭 시 "방폭파"(회의 종료) / "방외출"(나만 나가기) 미니 메뉴 표시
//   - 일반 참가자: 기존대로 onLeave 바로 호출

import React, { useState, useRef, useEffect } from 'react';
import { Video, VideoOff, Mic, MicOff, PhoneOff, Bomb, LogOut } from 'lucide-react';
import { BackgroundButton } from './BackgroundSelector';

export function ControlBar({
  isMicOn,
  isVideoOn,
  onToggleMic,
  onToggleVideo,
  onLeave,
  onEndMeeting,   // 방장 전용: 회의 종료 (모든 참가자 퇴장)
  isHost = false,
  // ── 배경 효과 관련 (선택적 props) ──
  backgroundMode = 'none',
  onToggleBackground,
}) {
  const [showLeaveMenu, setShowLeaveMenu] = useState(false);
  const leaveMenuRef = useRef(null);
  const leaveButtonRef = useRef(null);

  // 메뉴 바깥 클릭 시 닫기
  useEffect(() => {
    if (!showLeaveMenu) return;
    const handler = (e) => {
      if (
        leaveMenuRef.current && !leaveMenuRef.current.contains(e.target) &&
        leaveButtonRef.current && !leaveButtonRef.current.contains(e.target)
      ) {
        setShowLeaveMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLeaveMenu]);

  const handleLeaveButtonClick = () => {
    if (isHost) {
      setShowLeaveMenu(prev => !prev);
    } else {
      onLeave?.();
    }
  };

  const handleEndMeeting = async () => {
    setShowLeaveMenu(false);
    onEndMeeting?.();
  };

  const handleLeaveOnly = async () => {
    setShowLeaveMenu(false);
    onLeave?.();
  };

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

      {/* 나가기 버튼 (방장이면 팝오버 메뉴) */}
      <div className="relative">
        <button
          ref={leaveButtonRef}
          onClick={handleLeaveButtonClick}
          className={`p-2 md:p-3 rounded-full transition ${
            showLeaveMenu
              ? 'bg-red-900 text-white ring-2 ring-red-400'
              : 'bg-red-800 text-white hover:bg-red-900'
          }`}
          title={isHost ? '나가기 옵션' : '회의 나가기'}
        >
          <PhoneOff className="w-5 h-5 md:w-6 md:h-6" />
        </button>

        {/* ── 방장 전용 팝오버 메뉴 ── */}
        {isHost && showLeaveMenu && (
          <div
            ref={leaveMenuRef}
            className="absolute bottom-full mb-2 right-0 z-50 min-w-[160px]"
            style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.6))' }}
          >
            {/* 말풍선 꼬리 */}
            <div
              className="absolute bottom-0 right-4 translate-y-full"
              style={{
                width: 0, height: 0,
                borderLeft: '7px solid transparent',
                borderRight: '7px solid transparent',
                borderTop: '7px solid #1f2937',
              }}
            />
            <div className="bg-gray-800 border border-gray-600 rounded-xl overflow-hidden">
              {/* 방폭파: 모든 참가자 퇴장 */}
              <button
                onClick={handleEndMeeting}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-red-900/40 transition-colors"
              >
                <Bomb className="w-4 h-4 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-semibold">방 폭파</div>
                  <div className="text-xs text-red-300/70">모든 참가자 퇴장</div>
                </div>
              </button>
              {/* 구분선 */}
              <div className="h-px bg-gray-600 mx-3" />
              {/* 방외출: 나만 나가기 */}
              <button
                onClick={handleLeaveOnly}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-semibold">방 외출</div>
                  <div className="text-xs text-gray-400">나만 나가기</div>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}