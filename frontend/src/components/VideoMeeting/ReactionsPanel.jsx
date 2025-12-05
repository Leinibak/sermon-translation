// frontend/src/components/VideoMeeting/ReactionsPanel.jsx
import React, { useState } from 'react';
import { Smile } from 'lucide-react';

const REACTION_EMOJIS = [
  { emoji: '👍', label: '좋아요' },
  { emoji: '👏', label: '박수' },
  { emoji: '❤️', label: '하트' },
  { emoji: '😂', label: '웃음' },
  { emoji: '🎉', label: '축하' },
  { emoji: '🤔', label: '생각중' }
];

/**
 * 반응 선택 패널 (팝오버)
 */
export function ReactionsPopover({ isOpen, onClose, onSelectReaction }) {
  if (!isOpen) return null;

  return (
    <>
      {/* 오버레이 */}
      <div 
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      
      {/* 팝오버 */}
      <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-xl p-2 z-50 animate-scale-in">
        <div className="grid grid-cols-3 gap-2">
          {REACTION_EMOJIS.map(({ emoji, label }) => (
            <button
              key={emoji}
              onClick={() => {
                onSelectReaction(emoji);
                onClose();
              }}
              className="w-12 h-12 flex items-center justify-center text-2xl hover:bg-gray-100 rounded-lg transition"
              title={label}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * 반응 버튼 (ControlBar에 추가용)
 */
export function ReactionsButton({ onSendReaction }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-3 bg-white text-gray-900 rounded-full hover:bg-gray-200 transition"
        title="반응 보내기"
      >
        <Smile className="w-6 h-6" />
      </button>

      <ReactionsPopover
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSelectReaction={(emoji) => {
          onSendReaction(emoji);
          setIsOpen(false);
        }}
      />
    </div>
  );
}

/**
 * 반응 애니메이션 오버레이
 * (화면 중앙에 떠오르는 이모지들)
 */
export function ReactionsOverlay({ reactions }) {
  return (
    <div className="fixed inset-0 pointer-events-none z-30">
      {reactions.map((reaction) => (
        <FloatingReaction
          key={reaction.id}
          emoji={reaction.emoji}
          username={reaction.username}
        />
      ))}
    </div>
  );
}

/**
 * 개별 떠오르는 반응 애니메이션
 */
function FloatingReaction({ emoji, username }) {
  // 랜덤 위치 생성
  const randomX = Math.random() * 80 + 10; // 10% ~ 90%
  const randomDelay = Math.random() * 0.3; // 0 ~ 0.3초 지연

  return (
    <div
      className="absolute animate-float-up"
      style={{
        left: `${randomX}%`,
        bottom: '20%',
        animationDelay: `${randomDelay}s`
      }}
    >
      <div className="flex flex-col items-center">
        <span className="text-5xl mb-2">{emoji}</span>
        <span className="text-xs text-white bg-black bg-opacity-50 px-2 py-1 rounded">
          {username}
        </span>
      </div>
    </div>
  );
}

// CSS 애니메이션 추가 (Tailwind config 또는 globals.css에)
/*
@keyframes float-up {
  0% {
    transform: translateY(0) scale(0.8);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    transform: translateY(-200px) scale(1.2);
    opacity: 0;
  }
}

@keyframes scale-in {
  0% {
    transform: translate(-50%, 10px) scale(0.8);
    opacity: 0;
  }
  100% {
    transform: translate(-50%, 0) scale(1);
    opacity: 1;
  }
}

.animate-float-up {
  animation: float-up 3s ease-out forwards;
}

.animate-scale-in {
  animation: scale-in 0.2s ease-out;
}
*/