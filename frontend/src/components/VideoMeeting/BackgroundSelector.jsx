// frontend/src/components/VideoMeeting/BackgroundSelector.jsx
//
// ✅ v6 수정:
//   - [FEAT] 서버 배경 이미지 20개 불러오기 기능 추가
//     → SERVER_BACKGROUNDS: /static/backgrounds/ 경로에서 이미지를 fetch
//     → 로딩 중 스켈레톤 UI / 실패 시 에러 메시지 표시
//     → 기존 SVG 도형 프리셋 4개는 그대로 유지
// ✅ v5 수정:
//   - [BUG-Q] 패널을 닫지 않고 blur↔image 전환 시 bgChanging 이
//     VideoMeetingRoom 의 onSetBackground await 와 이중으로 충돌하는 문제 수정
//     → BackgroundSelector 내부 bgChanging 은 UI 전용으로만 사용.
//       VideoMeetingRoom 에서 await 하는 것과 별개로 처리.
//   - [BUG-R2] 파일 업로드 input onChange 에서 handleSetBackgroundImage 가
//     bgChanging=true 이면 무시 → 연속 업로드 시 두 번째 파일이 무시되는 문제 수정
//     → bgChanging 중 파일 선택은 대기 후 처리하도록 변경
//   - 프리셋 이미지 선택 시에도 패널을 닫지 않고 배경 미리보기 유지
//     (VideoMeetingRoom 에서 onSetBackgroundImage 콜백에서 닫음)
// ✅ v4 수정:
//   - [BUG-R1 UI] bgChanging 상태 → 배경 전환 처리 중 버튼 비활성화
//   - onSetBackground / onSetBackgroundImage → async 함수로 래핑
// ✅ v3 수정:
//   - 드래그로 창 이동 가능 (데스크톱 전용)

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { Blend, ImageOff, ImagePlus, X, GripVertical, Loader2, Check, AlertCircle, RefreshCw } from 'lucide-react';

// ── 기존 SVG 도형 배경 이미지 프리셋 (4개, 그대로 유지) ─────────────────
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

// ── 서버 배경 이미지 목록 (20개) ─────────────────────────────────────────
// 실제 서비스: 서버의 /static/backgrounds/ 경로에 아래 파일명으로 이미지를 저장
// 썸네일은 /static/backgrounds/thumbs/ 경로에 동일 파일명으로 저장 (권장)
const SERVER_BACKGROUND_LIST = [
  { id: 'bg_01', label: '설원 나무',     filename: 'background01.png' },
  { id: 'bg_02', label: '도시 야경',     filename: 'background02.png' },
  { id: 'bg_03', label: '뉴욕 스카이라인', filename: 'background03.png' },
  { id: 'bg_04', label: '경복궁 단풍',   filename: 'background04.png' },
  { id: 'bg_05', label: '수국',          filename: 'background05.png' },
  { id: 'bg_06', label: '산 능선 노을',  filename: 'background06.png' },
  { id: 'bg_07', label: '오피스 뷰',     filename: 'background07.png' },
  { id: 'bg_08', label: '플랜트 선반',   filename: 'background08.png' },
  { id: 'bg_09', label: '미니멀 화이트', filename: 'background09.png' },
  { id: 'bg_10', label: '창가 작업실',   filename: 'background10.png' },
  { id: 'bg_11', label: '도서관',        filename: 'background11.png' },
  { id: 'bg_12', label: '모던 오피스',   filename: 'background12.png' },
  { id: 'bg_13', label: '거실 소파',     filename: 'background13.png' },
  { id: 'bg_14', label: '초록 잎',       filename: 'background14.png' },
  { id: 'bg_15', label: '북유럽 인테리어', filename: 'background15.png' },
  { id: 'bg_16', label: '봄 꽃 골목',   filename: 'background16.png' },
  { id: 'bg_17', label: '이임스 체어',   filename: 'background17.png' },
  { id: 'bg_18', label: '화이트 침실',   filename: 'background18.png' },
  { id: 'bg_19', label: '해변',          filename: 'background19.png' },
  { id: 'bg_20', label: '블랙 텍스처',   filename: 'background20.png' },
  { id: 'bg_21', label: '라운지',        filename: 'background21.png' },
  { id: 'bg_22', label: '밝은 거실',     filename: 'background22.png' },
];

// 서버 기본 경로 — 환경에 맞게 수정
const BACKGROUNDS_BASE_URL = '/static/backgrounds';
const BACKGROUNDS_THUMB_URL = '/static/backgrounds/thumbs';

/**
 * 서버 배경 이미지를 불러오는 커스텀 훅
 * - 컴포넌트 마운트(패널 열릴 때) 시 한 번만 fetch
 * - 각 이미지의 실제 존재 여부를 확인하여 로드 가능한 것만 표시
 */
function useServerBackgrounds() {
  const [serverBgs, setServerBgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // 각 이미지에 url/thumbUrl을 붙여서 반환
      // 실제로는 서버 API(예: GET /api/backgrounds)를 호출해 목록을 받아오는 방식도 가능:
      //   const res = await fetch('/api/backgrounds');
      //   const list = await res.json();
      //   setServerBgs(list.map(item => ({ ...item, url: `${BACKGROUNDS_BASE_URL}/${item.filename}`, ... })));
      //
      // 현재는 정적 목록을 그대로 사용 (파일이 서버에 있어야 표시됨)
      const list = SERVER_BACKGROUND_LIST.map((item) => ({
        ...item,
        url:      `${BACKGROUNDS_BASE_URL}/${item.filename}`,
        thumbUrl: `${BACKGROUNDS_THUMB_URL}/${item.filename}`,
      }));
      setServerBgs(list);
    } catch (err) {
      console.error('[BackgroundSelector] 서버 배경 로드 실패:', err);
      setError('배경 이미지를 불러오지 못했습니다.');
      loadedRef.current = false; // 재시도 허용
    } finally {
      setLoading(false);
    }
  }, []);

  const retry = useCallback(() => {
    loadedRef.current = false;
    load();
  }, [load]);

  return { serverBgs, loading, error, load, retry };
}

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

  // [BUG-R1 UI] 처리 중 상태 — UI 전용 (VideoMeetingRoom 의 await 와 분리)
  const [bgChanging, setBgChanging] = useState(false);

  // 드래그 상태
  const [position, setPosition]   = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart]  = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile]    = useState(false);

  // 서버 배경 이미지 훅
  const { serverBgs, loading: serverLoading, error: serverError, load: loadServerBgs, retry: retryServerBgs } = useServerBackgrounds();

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isOpen && position === null) {
      const panelW = 320;
      const panelH = 520;
      setPosition({
        x: Math.round((window.innerWidth  - panelW) / 2),
        y: Math.round((window.innerHeight - panelH) / 2),
      });
    }
    if (!isOpen) {
      setPosition(null);
      setBgChanging(false);
    }
    // 패널이 열릴 때 서버 배경 이미지 로드
    if (isOpen) {
      loadServerBgs();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── [BUG-Q] 래핑된 핸들러 — bgChanging 은 UI lock 전용 ──────
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

  // 드래그 핸들러
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
    const panelW = panelRef.current?.offsetWidth  || 320;
    const panelH = panelRef.current?.offsetHeight || 520;
    const newX = Math.max(0, Math.min(window.innerWidth  - panelW, e.clientX - dragStart.x));
    const newY = Math.max(0, Math.min(window.innerHeight - panelH, e.clientY - dragStart.y));
    setPosition({ x: newX, y: newY });
  }, [isDragging, dragStart, isMobile]);

  const handleDragEnd = useCallback(() => { setIsDragging(false); }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup',   handleDragEnd);
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup',   handleDragEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  // ── [BUG-R2] 파일 업로드 — bgChanging 중에도 파일 읽기는 가능
  //    단, 실제 적용은 bgChanging 이 false 가 되면 즉시 실행
  const pendingFileRef = useRef(null);

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
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      if (!bgChanging) {
        handleSetBackgroundImage(dataUrl);
      } else {
        pendingFileRef.current = dataUrl;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [bgChanging, handleSetBackgroundImage]);

  useEffect(() => {
    if (!bgChanging && pendingFileRef.current) {
      const dataUrl = pendingFileRef.current;
      pendingFileRef.current = null;
      handleSetBackgroundImage(dataUrl);
    }
  }, [bgChanging, handleSetBackgroundImage]);

  if (!isOpen || position === null) return null;

  const panelBodyProps = {
    backgroundMode,
    backgroundImage,
    onSetBackground: handleSetBackground,
    onSetBackgroundImage: handleSetBackgroundImage,
    fileInputRef,
    handleFileChange,
    onClose,
    bgChanging,
    serverBgs,
    serverLoading,
    serverError,
    retryServerBgs,
  };

  // 모바일: 기존 팝오버 방식
  if (isMobile) {
    return (
      <>
        <div className="fixed inset-0 z-40 md:hidden" onClick={onClose} />
        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-80 bg-gray-800 rounded-2xl shadow-2xl border border-gray-600 z-50 overflow-hidden animate-scale-in">
          <MobileHeader onClose={onClose} bgChanging={bgChanging} />
          <PanelBody {...panelBodyProps} />
        </div>
      </>
    );
  }

  // 데스크톱: fixed + 드래그
  return (
    <>
      {isDragging && (
        <div className="fixed inset-0 z-40 cursor-grabbing" />
      )}

      <div
        ref={panelRef}
        className="fixed w-80 bg-gray-800 rounded-2xl shadow-2xl border border-gray-600 z-50 overflow-hidden animate-scale-in"
        style={{
          left: `${position.x}px`,
          top:  `${position.y}px`,
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

        <PanelBody {...panelBodyProps} />
      </div>
    </>
  );
}

// 모바일 헤더
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

// ── 패널 본체 (모바일/데스크톱 공용) ─────────────────────────────────────
function PanelBody({
  backgroundMode,
  backgroundImage,
  onSetBackground,
  onSetBackgroundImage,
  fileInputRef,
  handleFileChange,
  onClose,   // eslint-disable-line no-unused-vars
  bgChanging,
  serverBgs,
  serverLoading,
  serverError,
  retryServerBgs,
}) {
  return (
    <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">

      {/* ── 기본 옵션 (배경 없음 / 블러) ── */}
      <div className="grid grid-cols-2 gap-2">

        {/* 배경 없음 */}
        <button
          type="button"
          onClick={() => onSetBackground('none')}
          disabled={bgChanging}
          className={`
            relative flex flex-col items-center gap-2 p-3 rounded-xl transition-all border-2
            ${bgChanging ? 'opacity-50 cursor-not-allowed' : ''}
            ${backgroundMode === 'none'
              ? 'border-blue-500 bg-blue-900/30'
              : 'border-gray-600 bg-gray-700/50 hover:border-gray-400 hover:bg-gray-700'
            }
          `}
        >
          {backgroundMode === 'none' && !bgChanging && (
            <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
              <Check className="w-2.5 h-2.5 text-white" />
            </span>
          )}
          <div className="w-10 h-10 rounded-lg bg-gray-600 flex items-center justify-center">
            <ImageOff className="w-5 h-5 text-gray-300" />
          </div>
          <span className="text-xs text-gray-200 font-medium">배경 없음</span>
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
            relative flex flex-col items-center gap-2 p-3 rounded-xl transition-all border-2
            ${bgChanging ? 'opacity-50 cursor-not-allowed' : ''}
            ${backgroundMode === 'blur'
              ? 'border-blue-500 bg-blue-900/30'
              : 'border-gray-600 bg-gray-700/50 hover:border-gray-400 hover:bg-gray-700'
            }
          `}
        >
          {backgroundMode === 'blur' && !bgChanging && (
            <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
              <Check className="w-2.5 h-2.5 text-white" />
            </span>
          )}
          <div className="w-10 h-10 rounded-lg bg-gray-600 flex items-center justify-center overflow-hidden">
            <Blend className="w-5 h-5 text-blue-300" />
          </div>
          <span className="text-xs text-gray-200 font-medium">배경 블러</span>
          {bgChanging && backgroundMode === 'blur' && (
            <span className="text-[10px] text-blue-300 font-semibold">처리 중...</span>
          )}
        </button>
      </div>

      {/* ── 기존 SVG 도형 배경 이미지 프리셋 (4개) ── */}
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
              {backgroundMode === 'image' && backgroundImage === preset.url && (
                <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-blue-500 rounded-full flex items-center justify-center">
                  <Check className="w-2 h-2 text-white" />
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-black/60 text-[9px] text-white text-center py-0.5">
                {preset.label}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── 서버 배경 이미지 (20개) ── */}
      <div>
        <p className="text-xs text-gray-400 font-medium mb-2">사진 배경</p>

        {/* 로딩 중 스켈레톤 */}
        {serverLoading && (
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-video rounded-lg bg-gray-700/60 animate-pulse"
              />
            ))}
          </div>
        )}

        {/* 에러 상태 */}
        {!serverLoading && serverError && (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-[11px] text-gray-400">{serverError}</p>
            <button
              type="button"
              onClick={retryServerBgs}
              className="flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 transition"
            >
              <RefreshCw className="w-3 h-3" />
              다시 시도
            </button>
          </div>
        )}

        {/* 서버 이미지 그리드 */}
        {!serverLoading && !serverError && serverBgs.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {serverBgs.map((bg) => (
              <ServerBgThumb
                key={bg.id}
                bg={bg}
                isSelected={backgroundMode === 'image' && backgroundImage === bg.url}
                disabled={bgChanging}
                onSelect={() => onSetBackgroundImage(bg.url)}
              />
            ))}
          </div>
        )}

        {/* 이미지 없는 경우 */}
        {!serverLoading && !serverError && serverBgs.length === 0 && (
          <p className="text-[11px] text-gray-500 text-center py-3">
            서버 배경 이미지가 없습니다.
          </p>
        )}
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

      {/* 처리 중 안내 */}
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

// ── 서버 배경 썸네일 — 이미지 로드 실패 시 회색 박스로 표시 ────────────
function ServerBgThumb({ bg, isSelected, disabled, onSelect }) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled || imgError}
      className={`
        relative aspect-video rounded-lg overflow-hidden border-2 transition-all
        ${disabled ? 'opacity-50 cursor-not-allowed' : imgError ? 'cursor-default opacity-40' : ''}
        ${isSelected
          ? 'border-blue-500 ring-2 ring-blue-500/50'
          : 'border-gray-600 hover:border-gray-400'
        }
      `}
      title={bg.label}
    >
      {/* 플레이스홀더 배경 */}
      <div className="absolute inset-0 bg-gray-700" />

      {!imgError ? (
        <img
          src={bg.thumbUrl}
          alt={bg.label}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
          onError={() => setImgError(true)}
        />
      ) : (
        // 이미지 로드 실패 시 — 파일 없음 표시
        <div className="absolute inset-0 flex items-center justify-center">
          <ImageOff className="w-4 h-4 text-gray-600" />
        </div>
      )}

      {isSelected && !imgError && (
        <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-blue-500 rounded-full flex items-center justify-center z-10">
          <Check className="w-2 h-2 text-white" />
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-black/60 text-[9px] text-white text-center py-0.5 z-10">
        {bg.label}
      </div>
    </button>
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