// frontend/src/components/VideoMeeting/ReactionsPanel.jsx (수정 버전)
import React, { useState, useRef, useEffect } from 'react';
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
 * 반응 선택 패널 (팝오버) - 개선 버전
 */
export function ReactionsPopover({ isOpen, onClose, onSelectReaction, anchorRef }) {
  const popoverRef = useRef(null);

  // 외부 클릭 감지
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(event.target) &&
        anchorRef.current &&
        !anchorRef.current.contains(event.target)
      ) {
        onClose();
      }
    };

    // 약간의 지연 후 이벤트 리스너 등록 (버튼 클릭과 충돌 방지)
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 100);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  return (
    <>
      {/* 모바일용 배경 오버레이 */}
      <div 
        className="fixed inset-0 z-40 md:hidden"
        onClick={onClose}
      />
      
      {/* 팝오버 */}
      <div 
        ref={popoverRef}
        className="absolute bottom-full mb-3 left-1/2 transform -translate-x-1/2 bg-white rounded-xl shadow-2xl p-3 z-50 animate-scale-in border-2 border-gray-200"
        style={{
          minWidth: '200px'
        }}
      >
        {/* 작은 화살표 (선택사항) */}
        <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-white rotate-45 border-r-2 border-b-2 border-gray-200" />
        
        <div className="grid grid-cols-3 gap-2 relative z-10 bg-white rounded-lg">
          {REACTION_EMOJIS.map(({ emoji, label }) => (
            <button
              key={emoji}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelectReaction(emoji);
                onClose();
              }}
              className="w-14 h-14 flex items-center justify-center text-3xl hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors touch-manipulation"
              title={label}
              type="button"
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
 * 반응 버튼 (ControlBar에 추가용) - 개선 버전
 */
export function ReactionsButton({ onSendReaction }) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef(null);

  const handleToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="p-2 md:p-3 bg-white text-gray-900 rounded-full hover:bg-gray-200 transition touch-manipulation"
        title="반응 보내기"
        type="button"
      >
        <Smile className="w-5 h-5 md:w-6 md:h-6" />
      </button>

      <ReactionsPopover
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSelectReaction={(emoji) => {
          onSendReaction(emoji);
          setIsOpen(false);
        }}
        anchorRef={buttonRef}
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
      className="absolute animate-float-up pointer-events-none"
      style={{
        left: `${randomX}%`,
        bottom: '20%',
        animationDelay: `${randomDelay}s`
      }}
    >
      <div className="flex flex-col items-center">
        <span className="text-4xl md:text-5xl mb-2">{emoji}</span>
        <span className="text-xs text-white bg-black bg-opacity-50 px-2 py-1 rounded whitespace-nowrap">
          {username}
        </span>
      </div>
    </div>
  );
}