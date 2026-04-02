// frontend/src/components/VideoMeeting/BackgroundSelector.jsx
//
// ✅ v2 수정:
//   - SVG 프리셋에서 linearGradient id 중복 제거
//     (오피스/거실/다크가 모두 id="g"를 사용해 브라우저 렌더링 오류)
//   - 각 SVG마다 고유 id 부여 (id="g-office", "g-living" 등)

import React, { useRef, useCallback } from 'react';
import { Blend, ImageOff, ImagePlus, X } from 'lucide-react';

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
    reader.onload = (ev) => { onSetBackgroundImage(ev.target.result); };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [onSetBackgroundImage]);

  if (!isOpen) return null;

  return (
    <>
      {/* 모바일 배경 오버레이 */}
      <div className="fixed inset-0 z-40 md:hidden" onClick={onClose} />

      {/* 패널 본체 */}
      <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-80 bg-gray-800 rounded-2xl shadow-2xl border border-gray-600 z-50 overflow-hidden animate-scale-in">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <span className="text-white font-semibold text-sm">배경 효과</span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition p-1 rounded-lg hover:bg-gray-700"
            type="button"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">

          {/* ── 기본 옵션 (배경 없음 / 블러) ── */}
          <div className="grid grid-cols-2 gap-2">

            {/* 배경 없음 */}
            <button
              type="button"
              onClick={() => onSetBackground('none')}
              className={`
                flex flex-col items-center gap-2 p-3 rounded-xl transition-all border-2
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
              {backgroundMode === 'none' && (
                <span className="text-[10px] text-blue-400 font-semibold">현재 적용 중</span>
              )}
            </button>

            {/* 배경 블러 */}
            <button
              type="button"
              onClick={() => onSetBackground('blur')}
              className={`
                flex flex-col items-center gap-2 p-3 rounded-xl transition-all border-2
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
              {backgroundMode === 'blur' && (
                <span className="text-[10px] text-blue-400 font-semibold">현재 적용 중</span>
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
                  className={`
                    relative aspect-video rounded-lg overflow-hidden border-2 transition-all
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
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-600 hover:border-gray-400 rounded-xl text-gray-400 hover:text-gray-200 transition-all hover:bg-gray-700/50 text-sm"
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
                onClick={() => onSetBackground('none')}
                className="text-gray-400 hover:text-red-400 transition flex-shrink-0"
                title="배경 제거"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <p className="text-[11px] text-gray-500 leading-relaxed">
            💡 AI 인물 인식으로 배경을 처리합니다. 조명이 밝고 배경과 대비가 뚜렷할수록 효과가 좋습니다.
          </p>
        </div>
      </div>
    </>
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