// frontend/src/components/VideoMeeting/RaiseHandButton.jsx
import React from 'react';
import { Hand } from 'lucide-react';

/**
 * 손들기 버튼 (ControlBar에 추가용)
 */
export function RaiseHandButton({ isHandRaised, onRaise, onLower }) {
  const handleClick = () => {
    if (isHandRaised) {
      onLower();
    } else {
      onRaise();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`p-3 rounded-full transition ${
        isHandRaised
          ? 'bg-yellow-500 text-white hover:bg-yellow-600 animate-bounce'
          : 'bg-white text-gray-900 hover:bg-gray-200'
      }`}
      title={isHandRaised ? '손내리기' : '손들기'}
    >
      <Hand className="w-6 h-6" />
    </button>
  );
}

/**
 * 손든 사용자 목록 패널 (방장용)
 */
export function RaisedHandsPanel({ 
  raisedHands, 
  isOpen, 
  onClose 
}) {
  if (!isOpen || raisedHands.length === 0) return null;

  return (
    <div className="absolute bottom-full mb-2 right-0 bg-white rounded-lg shadow-xl p-4 w-64 z-50 animate-scale-in">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-semibold text-gray-900 flex items-center">
          <Hand className="w-4 h-4 mr-2 text-yellow-500" />
          손든 참가자 ({raisedHands.length})
        </h4>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          ×
        </button>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto">
        {raisedHands.map((hand, index) => (
          <div
            key={hand.username}
            className="flex items-center justify-between bg-yellow-50 p-2 rounded"
          >
            <div className="flex items-center">
              <span className="text-yellow-600 font-bold mr-2">
                {index + 1}.
              </span>
              <span className="text-gray-900 font-medium">
                {hand.username}
              </span>
            </div>
            <span className="text-xs text-gray-500">
              {formatRelativeTime(hand.raised_at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 비디오 위 손들기 표시 배지
 */
export function HandRaisedBadge() {
  return (
    <div className="absolute top-2 right-2 bg-yellow-500 text-white px-2 py-1 rounded-full flex items-center text-xs font-medium animate-bounce">
      <Hand className="w-3 h-3 mr-1" />
      손들기
    </div>
  );
}

/**
 * 상대 시간 포맷 (예: "방금", "1분 전")
 */
function formatRelativeTime(timestamp) {
  const now = new Date();
  const time = new Date(timestamp);
  const diffInSeconds = Math.floor((now - time) / 1000);

  if (diffInSeconds < 60) return '방금';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}분 전`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}시간 전`;
  return `${Math.floor(diffInSeconds / 86400)}일 전`;
}