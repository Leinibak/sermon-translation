// frontend/src/components/VideoMeeting/BackgroundSelector.jsx
//
// ✅ v4 수정:
//   - [BUG-R1 UI] bgChanging 상태 추가 → 배경 전환 처리 중 버튼 비활성화
//     (useBackgroundProcessor v14의 operationId 직렬화와 이중 방어)
//   - 처리 중 스피너 표시 → 사용자에게 진행 중임을 명확히 안내
//   - onSetBackground / onSetBackgroundImage → async 함수로 래핑
// ✅ v3 수정:
//   - 드래그로 창 이동 가능 (데스크톱 전용)
//   - fixed 위치 + useState position으로 드래그 구현
//   - 헤더 전체를 드래그 핸들로 사용

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { Blend, ImageOff, ImagePlus, X, GripVertical, Loader2 } from 'lucide-react';

// ── 배경 이미지 프리셋 ──────────────────────────────────────
// ✅ SVG id 충돌 수정: 각 SVG마다 고유 id 사용
const PRESET_BACKGROUNDS = [
  {
    id: 'office',
    label: '오피스',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g-office" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%23e8f0fe"/><stop offset="1" stop-color="%23c5cae9"/></linearGradient></defs><rect width="640" height="360" fill="url(%23g-office)"/><rect x="0" y="240" width="640" height="120" fill="%23d7ccc8"/><rect x="60" y="100" width="200" height="150" fill="%23b0bec5" rx="4"/><rect x="380" y="80" width="180" height="170" fill="%23b0bec5" rx="4"/><text x="320" y="340" text-anchor="middle" fill="%23795548" font-size="14" font-family="sans-serif">사무실</text></svg>',
    thumb: '#c5cae9',
  },
  {
    id: 'living',
    label: '거실',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g-living" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="%23fff9c4"/><stop offset="1" stop-color="%23fff176"/></linearGradient></defs><rect width="640" height="360" fill="url(%23g-living)"/><rect x="0" y="270" width="640" height="90" fill="%23a1887f"/><rect x="100" y="180" width="440" height="100" fill="%23795548" rx="8"/><rect x="240" y="140" width="160" height="50" fill="%238d6e63" rx="4"/><text x="320" y="345" text-anchor="middle" fill="%23fff" font-size="14" font-family="sans-serif">거실</text></svg>',
    thumb: '#fff176',
  },
  {
    id: 'nature',
    label: '자연',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="%2387ceeb"/><stop offset="1" stop-color="%23e0f7fa"/></linearGradient></defs><rect width="640" height="360" fill="url(%23g-sky)"/><rect x="0" y="260" width="640" height="100" fill="%234caf50"/><circle cx="100" cy="200" r="60" fill="%2366bb6a"/><circle cx="200" cy="180" r="80" fill="%2381c784"/><circle cx="500" cy="210" r="55" fill="%2366bb6a"/><circle cx="600" cy="190" r="75" fill="%2381c784"/><text x="320" y="345" text-anchor="middle" fill="%23fff" font-size="14" font-family="sans-serif">자연</text></svg>',
    thumb: '#87ceeb',
  },
  {
    id: 'dark',
    label: '다크',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g-dark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%23212121"/><stop offset="1" stop-color="%23424242"/></linearGradient></defs><rect width="640" height="360" fill="url(%23g-dark)"/><rect x="50" y="80" width="540" height="200" fill="%23303030" rx="8" opacity="0.5"/><text x="320" y="345" text-anchor="middle" fill="%23757575" font-size="14" font-family="sans-serif">다크</text></svg>',
    thumb: '#424242',
  },
];

export function BackgroundSelector({
  isOpen,
  backgroundMode,
  backgroundImage,
  onSetBackground,
  onSetBackgroundImage,
  onClose,
}) {
  const fileInputRef = useRef(null);
  const panelRef = useRef(null);

  // ── [BUG-R1 UI] 처리 중 상태 ────────────────────────────
  // useBackgroundProcessor v14의 operationId 직렬화와 이중 방어.
  // 처리 중에는 모든 배경 옵션 버튼을 비활성화하여 연속 클릭 방지.
  const [bgChanging, setBgChanging] = useState(false);

  // ── 드래그 상태 ──────────────────────────────────────────
  const [position, setPosition] = useState(null); // null = 초기 위치 미설정
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 패널이 열릴 때 초기 위치를 화면 중앙으로 설정
  useEffect(() => {
    if (isOpen && position === null) {
      const panelW = 320;
      const panelH = 480;
      setPosition({
        x: Math.round((window.innerWidth - panelW) / 2),
        y: Math.round((window.innerHeight - panelH) / 2),
      });
    }
    if (!isOpen) {
      setPosition(null); // 닫으면 초기화 → 다음에 열릴 때 다시 중앙
      setBgChanging(false); // 패널 닫힐 때 처리 중 상태 초기화
    }
  }, [isOpen]);

  // ── [BUG-R1 UI] 래핑된 핸들러 ──────────────────────────
  // async 처리 중 bgChanging=true → 버튼 비활성화
  const handleSetBackground = useCallback(async (mode) => {
    if (bgChanging) return;
    setBgChanging(true);
    try {
      await onSetBackground(mode);
    } finally {
      setBgChanging(false);
    }
  }, [bgChanging, onSetBackground]);

  const handleSetBackgroundImage = useCallback(async (dataUrl) => {
    if (bgChanging) return;
    setBgChanging(true);
    try {
      await onSetBackgroundImage(dataUrl);
    } finally {
      setBgChanging(false);
    }
  }, [bgChanging, onSetBackgroundImage]);

  // ── 드래그 핸들러 ─────────────────────────────────────────
  const handleDragStart = (e) => {
    if (isMobile) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - (position?.x ?? 0),
      y: e.clientY - (position?.y ?? 0),
    });
  };

  const handleDragMove = useCallback((e) => {
    if (!isDragging || isMobile) return;
    const panelW = panelRef.current?.offsetWidth || 320;
    const panelH = panelRef.current?.offsetHeight || 480;
    const newX = Math.max(0, Math.min(window.innerWidth - panelW, e.clientX - dragStart.x));
    const newY = Math.max(0, Math.min(window.innerHeight - panelH, e.clientY - dragStart.y));
    setPosition({ x: newX, y: newY });
  }, [isDragging, dragStart, isMobile]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  // ── 파일 업로드 ──────────────────────────────────────────
  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('이미지 크기는 5MB 이하여야 합니다.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => { handleSetBackgroundImage(ev.target.result); };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [handleSetBackgroundImage]);

  if (!isOpen || position === null) return null;

  // ── 모바일: 기존 팝오버 방식 유지 ────────────────────────
  if (isMobile) {
    return (
      <>
        <div className="fixed inset-0 z-40 md:hidden" onClick={onClose} />
        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-80 bg-gray-800 rounded-2xl shadow-2xl border border-gray-600 z-50 overflow-hidden animate-scale-in">
          <MobileHeader onClose={onClose} bgChanging={bgChanging} />
          <PanelBody
            backgroundMode={backgroundMode}
            backgroundImage={backgroundImage}
            onSetBackground={handleSetBackground}
            onSetBackgroundImage={handleSetBackgroundImage}
            fileInputRef={fileInputRef}
            handleFileChange={handleFileChange}
            onClose={onClose}
            bgChanging={bgChanging}
          />
        </div>
      </>
    );
  }

  // ── 데스크톱: fixed + 드래그 ─────────────────────────────
  return (
    <>
      {/* 드래그 중 텍스트 선택 방지용 오버레이 */}
      {isDragging && (
        <div className="fixed inset-0 z-40 cursor-grabbing" />
      )}

      <div
        ref={panelRef}
        className="fixed w-80 bg-gray-800 rounded-2xl shadow-2xl border border-gray-600 z-50 overflow-hidden animate-scale-in"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          cursor: isDragging ? 'grabbing' : 'default',
          userSelect: 'none',
        }}
      >
        {/* 헤더 (드래그 핸들) */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-gray-700 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleDragStart}
          title="드래그하여 이동"
        >
          <div className="flex items-center gap-2">
            <GripVertical className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-white font-semibold text-sm">배경 효과</span>
            {/* [BUG-R1 UI] 처리 중 스피너 */}
            {bgChanging && (
              <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin ml-1" />
            )}
          </div>
          <button
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
            className="text-gray-400 hover:text-white transition p-1 rounded-lg hover:bg-gray-700"
            type="button"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <PanelBody
          backgroundMode={backgroundMode}
          backgroundImage={backgroundImage}
          onSetBackground={handleSetBackground}
          onSetBackgroundImage={handleSetBackgroundImage}
          fileInputRef={fileInputRef}
          handleFileChange={handleFileChange}
          onClose={onClose}
          bgChanging={bgChanging}
        />
      </div>
    </>
  );
}

// ── 모바일 헤더 (드래그 없음) ─────────────────────────────
function MobileHeader({ onClose, bgChanging }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
      <div className="flex items-center gap-2">
        <span className="text-white font-semibold text-sm">배경 효과</span>
        {bgChanging && (
          <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
        )}
      </div>
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-white transition p-1 rounded-lg hover:bg-gray-700"
        type="button"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── 패널 본체 (모바일/데스크톱 공용) ─────────────────────
function PanelBody({
  backgroundMode,
  backgroundImage,
  onSetBackground,
  onSetBackgroundImage,
  fileInputRef,
  handleFileChange,
  onClose,
  bgChanging,
}) {
  return (
    <div className="p-4 space-y-4">

      {/* ── 기본 옵션 (배경 없음 / 블러) ── */}
      <div className="grid grid-cols-2 gap-2">

        {/* 배경 없음 */}
        <button
          type="button"
          onClick={() => onSetBackground('none')}
          disabled={bgChanging}
          className={`
            flex flex-col items-center gap-2 p-3 rounded-xl transition-all border-2
            ${bgChanging ? 'opacity-50 cursor-not-allowed' : ''}
            ${backgroundMode === 'none'
              ? 'border-blue-500 bg-blue-900/30'
              : 'border-gray-600 bg-gray-700/50 hover:border-gray-400 hover:bg-gray-700'
            }
          `}
        >
          <div className="w-10 h-10 rounded-lg bg-gray-600 flex items-center justify-center">
            <ImageOff className="w-5 h-5 text-gray-300" />
          </div>
          <span className="text-xs text-gray-200 font-medium">배경 없음</span>
          {backgroundMode === 'none' && !bgChanging && (
            <span className="text-[10px] text-blue-400 font-semibold">현재 적용 중</span>
          )}
          {bgChanging && backgroundMode === 'none' && (
            <span className="text-[10px] text-blue-300 font-semibold">처리 중...</span>
          )}
        </button>

        {/* 배경 블러 */}
        <button
          type="button"
          onClick={() => onSetBackground('blur')}
          disabled={bgChanging}
          className={`
            flex flex-col items-center gap-2 p-3 rounded-xl transition-all border-2
            ${bgChanging ? 'opacity-50 cursor-not-allowed' : ''}
            ${backgroundMode === 'blur'
              ? 'border-blue-500 bg-blue-900/30'
              : 'border-gray-600 bg-gray-700/50 hover:border-gray-400 hover:bg-gray-700'
            }
          `}
        >
          <div className="w-10 h-10 rounded-lg bg-gray-600 flex items-center justify-center overflow-hidden">
            <Blend className="w-5 h-5 text-blue-300" />
          </div>
          <span className="text-xs text-gray-200 font-medium">배경 블러</span>
          {backgroundMode === 'blur' && !bgChanging && (
            <span className="text-[10px] text-blue-400 font-semibold">현재 적용 중</span>
          )}
          {bgChanging && backgroundMode === 'blur' && (
            <span className="text-[10px] text-blue-300 font-semibold">처리 중...</span>
          )}
        </button>
      </div>

      {/* ── 배경 이미지 프리셋 ── */}
      <div>
        <p className="text-xs text-gray-400 font-medium mb-2">배경 이미지</p>
        <div className="grid grid-cols-4 gap-2">
          {PRESET_BACKGROUNDS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSetBackgroundImage(preset.url)}
              disabled={bgChanging}
              className={`
                relative aspect-video rounded-lg overflow-hidden border-2 transition-all
                ${bgChanging ? 'opacity-50 cursor-not-allowed' : ''}
                ${backgroundMode === 'image' && backgroundImage === preset.url
                  ? 'border-blue-500 ring-2 ring-blue-500/50'
                  : 'border-gray-600 hover:border-gray-400'
                }
              `}
              title={preset.label}
            >
              <div className="w-full h-full" style={{ backgroundColor: preset.thumb }} />
              <img
                src={preset.url}
                alt={preset.label}
                className="absolute inset-0 w-full h-full object-cover"
                draggable={false}
              />
              <div className="absolute inset-x-0 bottom-0 bg-black/60 text-[9px] text-white text-center py-0.5">
                {preset.label}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── 이미지 직접 업로드 ── */}
      <div>
        <p className="text-xs text-gray-400 font-medium mb-2">직접 업로드</p>
        <button
          type="button"
          onClick={() => !bgChanging && fileInputRef.current?.click()}
          disabled={bgChanging}
          className={`
            w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed
            border-gray-600 rounded-xl text-sm transition-all
            ${bgChanging
              ? 'opacity-50 cursor-not-allowed text-gray-500'
              : 'hover:border-gray-400 text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
            }
          `}
        >
          <ImagePlus className="w-4 h-4" />
          이미지 파일 선택 (최대 5MB)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* 현재 커스텀 배경 미리보기 */}
      {backgroundMode === 'image' && backgroundImage && (
        <div className="flex items-center gap-3 bg-gray-700/50 rounded-xl p-2.5">
          <img
            src={backgroundImage}
            alt="현재 배경"
            className="w-14 h-9 object-cover rounded-lg border border-gray-600 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white font-medium">배경 적용 중</p>
            <p className="text-[11px] text-gray-400 truncate">이미지 배경이 송출됩니다</p>
          </div>
          <button
            type="button"
            onClick={() => !bgChanging && onSetBackground('none')}
            disabled={bgChanging}
            className={`transition flex-shrink-0 ${bgChanging ? 'opacity-50 cursor-not-allowed text-gray-600' : 'text-gray-400 hover:text-red-400'}`}
            title="배경 제거"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 처리 중 안내 메시지 */}
      {bgChanging && (
        <div className="flex items-center gap-2 text-[11px] text-blue-300 bg-blue-900/20 rounded-xl px-3 py-2">
          <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
          배경 효과를 적용하는 중입니다...
        </div>
      )}

      <p className="text-[11px] text-gray-500 leading-relaxed">
        💡 AI 인물 인식으로 배경을 처리합니다. 조명이 밝고 배경과 대비가 뚜렷할수록 효과가 좋습니다.
      </p>
    </div>
  );
}

export function BackgroundButton({ backgroundMode, onClick }) {
  const isActive = backgroundMode !== 'none';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className={`
          p-2 md:p-3 rounded-full transition-all
          ${isActive
            ? 'bg-blue-600 text-white hover:bg-blue-700 ring-2 ring-blue-400/50'
            : 'bg-white text-gray-900 hover:bg-gray-200'
          }
        `}
        title={isActive ? '배경 효과 적용 중 — 클릭하여 변경' : '배경 효과 설정'}
      >
        <Blend className="w-5 h-5 md:w-6 md:h-6" />
      </button>

      {isActive && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-400 rounded-full border-2 border-gray-800" />
      )}
    </div>
  );
}