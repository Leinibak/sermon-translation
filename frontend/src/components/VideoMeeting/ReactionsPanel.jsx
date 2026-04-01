// frontend/src/components/VideoMeeting/ReactionsPanel.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Smile } from 'lucide-react';

// ── 이모티콘 목록 확장 (기존 6개 → 20개) ───────────────────────
const REACTION_EMOJIS = [
  { emoji: '👍', label: '좋아요' },
  { emoji: '👏', label: '박수' },
  { emoji: '❤️', label: '하트' },
  { emoji: '😂', label: '웃음' },
  { emoji: '🎉', label: '축하' },
  { emoji: '🤔', label: '생각중' },
  { emoji: '😮', label: '놀람' },
  { emoji: '😢', label: '슬픔' },
  { emoji: '🔥', label: '불꽃' },
  { emoji: '👋', label: '손흔들기' },
  { emoji: '💯', label: '100점' },
  { emoji: '🙏', label: '감사' },
  { emoji: '😍', label: '사랑' },
  { emoji: '🤣', label: '빵터짐' },
  { emoji: '👀', label: '주목' },
  { emoji: '💪', label: '파이팅' },
  { emoji: '✅', label: '확인' },
  { emoji: '❌', label: '반대' },
  { emoji: '⭐', label: '별' },
  { emoji: '🎵', label: '음악' },
];

/**
 * 반응 선택 패널 (팝오버)
 */
export function ReactionsPopover({ isOpen, onClose, onSelectReaction, anchorRef }) {
  const popoverRef = useRef(null);

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
        className="absolute bottom-full mb-3 left-1/2 transform -translate-x-1/2 bg-gray-800 rounded-2xl shadow-2xl p-3 z-50 animate-scale-in border border-gray-600"
        style={{ width: '264px' }}
      >
        {/* 화살표 */}
        <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-gray-800 rotate-45 border-r border-b border-gray-600" />

        <div className="grid grid-cols-5 gap-1.5 relative z-10">
          {REACTION_EMOJIS.map(({ emoji, label }) => (
            <button
              key={emoji}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelectReaction(emoji);
                onClose();
              }}
              className="w-11 h-11 flex items-center justify-center text-2xl hover:bg-gray-700 active:bg-gray-600 rounded-xl transition-all duration-100 hover:scale-125 active:scale-110 touch-manipulation"
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
 * 반응 버튼 (ControlBar에 추가용)
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
 * - 화면 우측 하단에서 올라오는 방식 (Zoom 스타일)
 * - 좌우 흔들림 없이 부드럽게 수직 상승
 */
export function ReactionsOverlay({ reactions }) {
  return (
    <div className="fixed inset-0 pointer-events-none z-30 overflow-hidden">
      {reactions.map((reaction) => (
        <FloatingReaction
          key={reaction.id}
          emoji={reaction.emoji}
          username={reaction.username}
          index={reaction.index ?? 0}
        />
      ))}
    </div>
  );
}

/**
 * 개별 떠오르는 반응 — Zoom 스타일
 * - 화면 우측 하단 고정 출발점
 * - 순수 수직 상승 (X 이동 없음)
 * - 각 반응은 index 기반 살짝 오프셋으로 겹침 방지
 */
function FloatingReaction({ emoji, username, index }) {
  // 우측에서 살짝 랜덤 offset (10px 이내) — 흔들리지 않도록 최소화
  const offsetX = (index % 5) * 14; // 0, 14, 28, 42, 56 px

  return (
    <div
      className="absolute reaction-float-up pointer-events-none flex flex-col items-center gap-1"
      style={{
        right: `${24 + offsetX}px`,
        bottom: '80px',
      }}
    >
      <span className="text-4xl md:text-5xl drop-shadow-lg leading-none">{emoji}</span>
      <span className="text-[11px] text-white bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-full whitespace-nowrap font-medium">
        {username}
      </span>
    </div>
  );
}