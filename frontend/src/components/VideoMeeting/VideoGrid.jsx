// frontend/src/components/VideoMeeting/VideoGrid.jsx
/**
 * VideoGrid — Active Speaker View
 *
 * 레이아웃 모드:
 *   1인  → 로컬 전체화면
 *   2인  → 상대방 메인 + 로컬 PiP (우하단)
 *   3인+ → 상단 썸네일 스트립 + 메인 발표자 영역
 *
 * Props:
 *   videos          — allVideos 배열 (VideoMeetingRoom 기존 형식 그대로)
 *   HandRaisedBadge — 손들기 배지 컴포넌트
 *   mainSpeakerId   — 현재 메인으로 표시할 peerId
 *   pinnedPeerId    — 수동 고정된 peerId
 *   volumeLevels    — Map<peerId, 0‥1>
 *   isSpeaking      — (peerId) => boolean
 *   onPin           — (peerId) => void
 *   onUnpin         — () => void
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { VideoOff, Mic, MicOff, Pin, PinOff, Volume2 } from 'lucide-react';
import { VideoElement } from './VideoElement';

// ── 상수 ─────────────────────────────────────────────────────
const THUMBNAIL_H_DESKTOP = 112; // px, 상단 썸네일 스트립 높이 (데스크톱)
const THUMBNAIL_H_MOBILE  = 88;  // px, 모바일
const THUMBNAIL_W_DESKTOP = 160; // px, 썸네일 카드 너비
const THUMBNAIL_W_MOBILE  = 110; // px

// ══════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ══════════════════════════════════════════════════════════════
export function VideoGrid({
  videos = [],
  HandRaisedBadge,
  mainSpeakerId,
  pinnedPeerId,
  volumeLevels = new Map(),
  isSpeaking   = () => false,
  onPin        = () => {},
  onUnpin      = () => {},
}) {
  const [isMobile, setIsMobile]         = useState(false);
  const [isLandscape, setIsLandscape]   = useState(false);
  const [contextMenu, setContextMenu]   = useState(null); // { peerId, x, y }
  const containerRef                    = useRef(null);
  const longPressTimerRef               = useRef(null);

  // ── 반응형 감지 ────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      setIsMobile(window.innerWidth < 768);
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // ── 컨텍스트 메뉴 외부 클릭 닫기 ───────────────────────────
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [contextMenu]);

  // ── 우클릭 핸들러 ──────────────────────────────────────────
  const handleContextMenu = useCallback((e, peerId) => {
    e.preventDefault();
    setContextMenu({ peerId, x: e.clientX, y: e.clientY });
  }, []);

  // ── 모바일 롱프레스 핸들러 ──────────────────────────────────
  const handleTouchStart = useCallback((e, peerId) => {
    longPressTimerRef.current = setTimeout(() => {
      const touch = e.touches[0];
      setContextMenu({ peerId, x: touch.clientX, y: touch.clientY });
    }, 600);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  // ── 핀 토글 ────────────────────────────────────────────────
  const handlePinToggle = useCallback((peerId) => {
    if (pinnedPeerId === peerId) onUnpin();
    else onPin(peerId);
    setContextMenu(null);
  }, [pinnedPeerId, onPin, onUnpin]);

  // ── 현재 메인 비디오 결정 ──────────────────────────────────
  const mainVideo = videos.find(v => v.peerId === mainSpeakerId)
    ?? videos.find(v => !v.isLocal)   // fallback: 첫 번째 원격
    ?? videos[0];                     // fallback: 로컬만 있을 때

  // 썸네일 목록 (메인 제외)
  const thumbnailVideos = videos.filter(v => v.peerId !== mainVideo?.peerId);

  // ──────────────────────────────────────────────────────────
  // 1인: 로컬 전체화면
  // ──────────────────────────────────────────────────────────
  if (videos.length <= 1) {
    return (
      <div ref={containerRef} className="flex-1 bg-gray-900 relative overflow-hidden">
        {videos[0] && (
          <FullscreenCard
            video={videos[0]}
            HandRaisedBadge={HandRaisedBadge}
            isSpeaking={isSpeaking(videos[0].peerId)}
            volume={volumeLevels.get(videos[0].peerId) ?? 0}
            isPinned={pinnedPeerId === videos[0].peerId}
            onContextMenu={(e) => handleContextMenu(e, videos[0].peerId)}
            onTouchStart={(e) => handleTouchStart(e, videos[0].peerId)}
            onTouchEnd={handleTouchEnd}
          />
        )}
        <ContextMenuOverlay
          menu={contextMenu}
          pinnedPeerId={pinnedPeerId}
          onPinToggle={handlePinToggle}
          onClose={() => setContextMenu(null)}
        />
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────
  // 2인: 메인 + PiP
  // ──────────────────────────────────────────────────────────
  if (videos.length === 2) {
    const remoteVideo = videos.find(v => !v.isLocal) ?? videos[1];
    const localVideo  = videos.find(v => v.isLocal)  ?? videos[0];

    return (
      <div ref={containerRef} className="flex-1 bg-gray-900 relative overflow-hidden">
        {/* 메인: 상대방 */}
        <FullscreenCard
          video={remoteVideo}
          HandRaisedBadge={HandRaisedBadge}
          isSpeaking={isSpeaking(remoteVideo.peerId)}
          volume={volumeLevels.get(remoteVideo.peerId) ?? 0}
          isPinned={pinnedPeerId === remoteVideo.peerId}
          onContextMenu={(e) => handleContextMenu(e, remoteVideo.peerId)}
          onTouchStart={(e) => handleTouchStart(e, remoteVideo.peerId)}
          onTouchEnd={handleTouchEnd}
        />
        {/* PiP: 로컬 */}
        <PictureInPicture
          video={localVideo}
          isMobile={isMobile}
          isSpeaking={isSpeaking(localVideo.peerId)}
          onContextMenu={(e) => handleContextMenu(e, localVideo.peerId)}
          onTouchStart={(e) => handleTouchStart(e, localVideo.peerId)}
          onTouchEnd={handleTouchEnd}
        />
        <ContextMenuOverlay
          menu={contextMenu}
          pinnedPeerId={pinnedPeerId}
          onPinToggle={handlePinToggle}
          onClose={() => setContextMenu(null)}
        />
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────
  // 3인+: Active Speaker View
  // ──────────────────────────────────────────────────────────
  const thumbH = isMobile ? THUMBNAIL_H_MOBILE : THUMBNAIL_H_DESKTOP;
  const thumbW = isMobile ? THUMBNAIL_W_MOBILE  : THUMBNAIL_W_DESKTOP;

  // 모바일 가로: 좌측 세로 스트립
  if (isMobile && isLandscape) {
    return (
      <div ref={containerRef} className="flex-1 bg-gray-900 flex overflow-hidden">
        {/* 좌측 세로 썸네일 스트립 */}
        <div
          className="flex flex-col gap-1.5 overflow-y-auto bg-gray-950 py-1.5 px-1 shrink-0"
          style={{ width: `${thumbW}px` }}
        >
          {videos.map(video => (
            <ThumbnailCard
              key={video.peerId}
              video={video}
              isActive={video.peerId === mainSpeakerId}
              isPinned={pinnedPeerId === video.peerId}
              isSpeaking={isSpeaking(video.peerId)}
              volume={volumeLevels.get(video.peerId) ?? 0}
              HandRaisedBadge={HandRaisedBadge}
              width={thumbW - 8}
              height={thumbH - 8}
              onClick={() => onPin(video.peerId)}
              onContextMenu={(e) => handleContextMenu(e, video.peerId)}
              onTouchStart={(e) => handleTouchStart(e, video.peerId)}
              onTouchEnd={handleTouchEnd}
            />
          ))}
        </div>
        {/* 메인 발표자 */}
        <div className="flex-1 relative overflow-hidden">
          {mainVideo && (
            <FullscreenCard
              video={mainVideo}
              HandRaisedBadge={HandRaisedBadge}
              isSpeaking={isSpeaking(mainVideo.peerId)}
              volume={volumeLevels.get(mainVideo.peerId) ?? 0}
              isPinned={pinnedPeerId === mainVideo.peerId}
              showSpeakerLabel
              onContextMenu={(e) => handleContextMenu(e, mainVideo.peerId)}
              onTouchStart={(e) => handleTouchStart(e, mainVideo.peerId)}
              onTouchEnd={handleTouchEnd}
            />
          )}
        </div>
        <ContextMenuOverlay
          menu={contextMenu}
          pinnedPeerId={pinnedPeerId}
          onPinToggle={handlePinToggle}
          onClose={() => setContextMenu(null)}
        />
      </div>
    );
  }

  // 기본 (데스크톱 + 모바일 세로): 상단 썸네일 + 메인
  return (
    <div ref={containerRef} className="flex-1 bg-gray-900 flex flex-col overflow-hidden">
      {/* ── 상단 썸네일 스트립 ─────────────────────────────── */}
      <div
        className="bg-gray-950 border-b border-gray-800 flex items-center gap-2 px-2 overflow-x-auto shrink-0"
        style={{ height: `${thumbH}px` }}
      >
        {videos.map(video => (
          <ThumbnailCard
            key={video.peerId}
            video={video}
            isActive={video.peerId === mainSpeakerId}
            isPinned={pinnedPeerId === video.peerId}
            isSpeaking={isSpeaking(video.peerId)}
            volume={volumeLevels.get(video.peerId) ?? 0}
            HandRaisedBadge={HandRaisedBadge}
            width={thumbW}
            height={thumbH - 12}
            onClick={() => onPin(video.peerId)}
            onContextMenu={(e) => handleContextMenu(e, video.peerId)}
            onTouchStart={(e) => handleTouchStart(e, video.peerId)}
            onTouchEnd={handleTouchEnd}
          />
        ))}
      </div>

      {/* ── 메인 발표자 영역 ────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {mainVideo && (
          <FullscreenCard
            video={mainVideo}
            HandRaisedBadge={HandRaisedBadge}
            isSpeaking={isSpeaking(mainVideo.peerId)}
            volume={volumeLevels.get(mainVideo.peerId) ?? 0}
            isPinned={pinnedPeerId === mainVideo.peerId}
            showSpeakerLabel
            onContextMenu={(e) => handleContextMenu(e, mainVideo.peerId)}
            onTouchStart={(e) => handleTouchStart(e, mainVideo.peerId)}
            onTouchEnd={handleTouchEnd}
          />
        )}
        {/* 고정 표시 배지 */}
        {pinnedPeerId && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 pointer-events-none">
            <Pin className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-xs text-yellow-300 font-medium">고정됨</span>
          </div>
        )}
      </div>

      {/* 컨텍스트 메뉴 */}
      <ContextMenuOverlay
        menu={contextMenu}
        pinnedPeerId={pinnedPeerId}
        onPinToggle={handlePinToggle}
        onClose={() => setContextMenu(null)}
      />
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
// 전체화면 카드 (메인 발표자 / 1인 / 2인 상대방)
// ══════════════════════════════════════════════════════════════
function FullscreenCard({
  video,
  HandRaisedBadge,
  isSpeaking,
  volume,
  isPinned,
  showSpeakerLabel = false,
  onContextMenu,
  onTouchStart,
  onTouchEnd,
}) {
  return (
    <div
      className="w-full h-full relative overflow-hidden bg-gray-900"
      onContextMenu={onContextMenu}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* 비디오 */}
      <VideoElement
        ref={video.ref}
        stream={video.stream}
        isLocal={video.isLocal}
        isVideoOff={video.isVideoOff}
      />

      {/* 비디오 꺼짐 오버레이 */}
      {video.isVideoOff && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900">
          <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center mb-4 ring-4 ring-gray-600">
            <span className="text-white text-4xl font-bold">
              {video.username?.charAt(0).toUpperCase()}
            </span>
          </div>
          <VideoOff className="w-7 h-7 text-gray-500" />
        </div>
      )}

      {/* 발언 중 테두리 */}
      {isSpeaking && (
        <div className="absolute inset-0 pointer-events-none rounded-none ring-[3px] ring-inset ring-green-400 speaking-ring" />
      )}

      {/* 하단 정보 바 */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* 마이크 상태 */}
            <div className={`rounded-full p-1.5 ${video.isMuted ? 'bg-red-500/90' : 'bg-black/50'}`}>
              {video.isMuted
                ? <MicOff className="w-4 h-4 text-white" />
                : <Mic    className="w-4 h-4 text-white" />
              }
            </div>
            {/* 이름 */}
            <span className="text-white font-semibold text-sm drop-shadow truncate max-w-[200px] md:max-w-[400px]">
              {video.username}
            </span>
            {/* 발언 중 표시 */}
            {isSpeaking && (
              <span className="flex items-center gap-1">
                <VolumeWave volume={volume} />
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isPinned && <Pin className="w-4 h-4 text-yellow-400" />}
            {video.isHandRaised && HandRaisedBadge && <HandRaisedBadge />}
          </div>
        </div>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
// 썸네일 카드 (상단 스트립)
// ══════════════════════════════════════════════════════════════
function ThumbnailCard({
  video,
  isActive,
  isPinned,
  isSpeaking,
  volume,
  HandRaisedBadge,
  width,
  height,
  onClick,
  onContextMenu,
  onTouchStart,
  onTouchEnd,
}) {
  return (
    <div
      className={`
        relative rounded-lg overflow-hidden cursor-pointer shrink-0
        transition-all duration-200
        ${isActive
          ? 'ring-2 ring-blue-400 shadow-lg shadow-blue-500/20'
          : 'ring-1 ring-gray-700 hover:ring-gray-500'
        }
        ${isSpeaking && !isActive ? 'ring-2 ring-green-400' : ''}
      `}
      style={{ width: `${width}px`, height: `${height}px` }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* 비디오 */}
      <VideoElement
        ref={video.ref}
        stream={video.stream}
        isLocal={video.isLocal}
        isVideoOff={video.isVideoOff}
      />

      {/* 비디오 꺼짐 */}
      {video.isVideoOff && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
          <div className="w-9 h-9 rounded-full bg-gray-600 flex items-center justify-center">
            <span className="text-white text-sm font-bold">
              {video.username?.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {/* 발언 중 오버레이 */}
      {isSpeaking && (
        <div className="absolute inset-0 pointer-events-none ring-2 ring-inset ring-green-400 rounded-lg" />
      )}

      {/* 하단 이름 */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
        <div className="flex items-center gap-1">
          {video.isMuted
            ? <MicOff className="w-2.5 h-2.5 text-red-400 shrink-0" />
            : isSpeaking
              ? <Volume2 className="w-2.5 h-2.5 text-green-400 shrink-0" />
              : <Mic className="w-2.5 h-2.5 text-gray-400 shrink-0" />
          }
          <span className="text-white text-[10px] font-medium truncate">
            {video.username}
          </span>
          {isPinned && <Pin className="w-2 h-2 text-yellow-400 shrink-0" />}
        </div>
      </div>

      {/* 손들기 배지 */}
      {video.isHandRaised && HandRaisedBadge && (
        <div className="absolute top-1 right-1 scale-75">
          <HandRaisedBadge />
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
// PiP 카드 (2인 모드 로컬 뷰)
// ══════════════════════════════════════════════════════════════
function PictureInPicture({ video, isMobile, isSpeaking, onContextMenu, onTouchStart, onTouchEnd }) {
  const w = isMobile ? 100 : 180;
  const h = isMobile ? 75  : 135;

  return (
    <div
      className={`
        absolute bottom-20 right-3 rounded-xl overflow-hidden cursor-pointer
        shadow-2xl border-2 transition-all duration-200 z-10
        ${isSpeaking ? 'border-green-400' : 'border-gray-700'}
      `}
      style={{ width: `${w}px`, height: `${h}px` }}
      onContextMenu={onContextMenu}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <VideoElement
        ref={video.ref}
        stream={video.stream}
        isLocal={video.isLocal}
        isVideoOff={video.isVideoOff}
      />
      {video.isVideoOff && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
          <span className="text-white text-lg font-bold">
            {video.username?.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5">
        <span className="text-white text-[10px] truncate block">{video.username}</span>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
// 볼륨 웨이브 인디케이터
// ══════════════════════════════════════════════════════════════
function VolumeWave({ volume }) {
  const bars = 4;
  return (
    <span className="flex items-end gap-[2px] h-4">
      {Array.from({ length: bars }).map((_, i) => {
        const heightPct = Math.min(100, (volume * 100) * ((i % 2 === 0 ? 1 : 0.7) + Math.random() * 0.3));
        return (
          <span
            key={i}
            className="bg-green-400 rounded-full w-[3px] speaking-bar"
            style={{
              height:          `${Math.max(20, heightPct)}%`,
              animationDelay:  `${i * 80}ms`,
            }}
          />
        );
      })}
    </span>
  );
}


// ══════════════════════════════════════════════════════════════
// 컨텍스트 메뉴 오버레이
// ══════════════════════════════════════════════════════════════
function ContextMenuOverlay({ menu, pinnedPeerId, onPinToggle, onClose }) {
  if (!menu) return null;
  const isPinned = pinnedPeerId === menu.peerId;

  // 화면 밖으로 나가지 않도록 위치 보정
  const menuW = 168;
  const menuH = 60;
  const x = Math.min(menu.x, window.innerWidth  - menuW - 8);
  const y = Math.min(menu.y, window.innerHeight - menuH - 8);

  return (
    <div
      className="fixed z-50"
      style={{ left: x, top: y }}
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl overflow-hidden"
           style={{ width: `${menuW}px` }}>
        <button
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-gray-700 transition-colors"
          onClick={() => onPinToggle(menu.peerId)}
        >
          {isPinned
            ? <><PinOff className="w-4 h-4 text-yellow-400" /><span>고정 해제</span></>
            : <><Pin    className="w-4 h-4 text-yellow-400" /><span>화면 고정</span></>
          }
        </button>
      </div>
    </div>
  );
}