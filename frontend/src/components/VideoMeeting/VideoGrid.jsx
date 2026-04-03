// frontend/src/components/VideoMeeting/VideoGrid.jsx
//
// ▣ Speaker View       — 활성 발언자를 메인으로, 나머지는 우측(PC)/하단(모바일) 스트립
// ▣ Gallery View       — 모든 참가자 균등 그리드 (Zoom Gallery View)
//                        2인: 좌우 균등 분할 | 3인+: N×M 그리드
// ▣ Dynamic Gallery    — 활성 발언자가 자동으로 확대 (Zoom Dynamic Gallery View)
//                        2인: 발언자 메인 + 우측/하단 PiP 스트립 (썸네일 더 크게)
//                        3인+: 발언자 셀 자동 확대, 나머지 균등 배분
//
// ▣ 반응형 동작
//   - PC:       Speaker = 우측 세로 스트립 | Gallery = 균등 그리드 | Dynamic = 메인+스트립
//   - 모바일 세로: Speaker = 하단 가로 스크롤 | Gallery = 2열 | Dynamic = 2열 확대
//   - 모바일 가로: Speaker = 좌측 세로 스트립 | Gallery = 3열 | Dynamic = 3열 확대
//
// [변경 내역 - 2026-04-01]
// - 2인 케이스에서 layout prop 무시하던 문제 수정
//   * 'speaker': 기존과 동일 (메인 + PiP)
//   * 'gallery': 좌우 균등 분할 그리드 (Zoom Gallery View 방식)
//   * 'dynamic': 발언자 메인 + 사이드 스트립 (동적 발언자 추적)
//
// Props:
//   videos        — VideoMeetingRoom에서 전달되는 참가자 배열
//   layout        — 'speaker' | 'gallery' | 'dynamic'
//   HandRaisedBadge, mainSpeakerId, pinnedPeerId,
//   volumeLevels, isSpeaking, onPin, onUnpin

import React, { useState, useEffect, useRef, useCallback, forwardRef } from 'react';
import { VideoOff, Mic, MicOff, Pin, PinOff, Volume2 } from 'lucide-react';
import { VideoElement } from './VideoElement';

const THUMB_H_DESKTOP  = 112;
const THUMB_H_MOBILE   = 88;
const THUMB_W_DESKTOP  = 160;
const THUMB_W_MOBILE   = 110;

// ══════════════════════════════════════════════════════════════
// VideoElementContain — 메인뷰 전용 (object-contain)
// ══════════════════════════════════════════════════════════════
const VideoElementContain = forwardRef(({ stream, isLocal, isVideoOff }, ref) => {
  const defaultRef = useRef(null);
  const resolvedRef = ref ?? defaultRef;

  useEffect(() => {
    const videoEl = resolvedRef.current;
    if (!videoEl) return;
    if (!stream) {
      // [BUG-D fix] isLocal 비디오는 배경 전환 중 stream=null이 될 수 있으므로
      // srcObject를 즉시 null로 해제하지 않음
      if (videoEl.srcObject && !isLocal) {
        videoEl.srcObject = null;
      }
      return;
    }
    if (videoEl.srcObject !== stream) videoEl.srcObject = stream;
  }, [stream, resolvedRef, isLocal]);

  return (
    <video
      ref={resolvedRef}
      autoPlay
      playsInline
      muted={isLocal}
      className={`w-full h-full object-contain ${isLocal ? '-scale-x-100' : ''}`}
      style={{ display: isVideoOff ? 'none' : 'block', backgroundColor: '#111827' }}
      webkit-playsinline="true"
      x-webkit-airplay="allow"
    />
  );
});
VideoElementContain.displayName = 'VideoElementContain';

// ══════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ══════════════════════════════════════════════════════════════
export function VideoGrid({
  videos = [],
  layout = 'speaker',       // ← 부모(VideoMeetingRoom)에서 전달
  HandRaisedBadge,
  mainSpeakerId,
  pinnedPeerId,
  volumeLevels = new Map(),
  isSpeaking   = () => false,
  onPin        = () => {},
  onUnpin      = () => {},
}) {
  const [isMobile,    setIsMobile]    = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const containerRef                  = useRef(null);
  const longPressTimerRef             = useRef(null);

  useEffect(() => {
    const update = () => {
      setIsMobile(window.innerWidth < 768);
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [contextMenu]);

  const handleContextMenu = useCallback((e, peerId) => {
    e.preventDefault();
    setContextMenu({ peerId, x: e.clientX, y: e.clientY });
  }, []);

  const handleTouchStart = useCallback((e, peerId) => {
    longPressTimerRef.current = setTimeout(() => {
      const touch = e.touches[0];
      setContextMenu({ peerId, x: touch.clientX, y: touch.clientY });
    }, 600);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  const handlePinToggle = useCallback((peerId) => {
    if (pinnedPeerId === peerId) onUnpin();
    else onPin(peerId);
    setContextMenu(null);
  }, [pinnedPeerId, onPin, onUnpin]);

  // ── 공통 이벤트 핸들러 팩토리 ──────────────────────────────
  const evts = (peerId) => ({
    onContextMenu: (e) => handleContextMenu(e, peerId),
    onTouchStart:  (e) => handleTouchStart(e, peerId),
    onTouchEnd:    handleTouchEnd,
  });

  // ── 메인 발언자 결정 ────────────────────────────────────────
  const mainVideo =
    (pinnedPeerId && videos.find(v => v.peerId === pinnedPeerId)) ||
    videos.find(v => v.peerId === mainSpeakerId) ||
    videos.find(v => !v.isLocal) ||
    videos[0];

  const thumbH = isMobile ? THUMB_H_MOBILE  : THUMB_H_DESKTOP;
  const thumbW = isMobile ? THUMB_W_MOBILE  : THUMB_W_DESKTOP;

  // ──────────────────────────────────────────────────────────
  // 1인: 로컬 전체화면 (layout 관계없이 동일)
  // ──────────────────────────────────────────────────────────
  if (videos.length <= 1) {
    return (
      <div ref={containerRef} className="w-full h-full bg-gray-900 relative overflow-hidden">
        {videos[0] && (
          <FullscreenCard
            video={videos[0]}
            HandRaisedBadge={HandRaisedBadge}
            isSpeaking={isSpeaking(videos[0].peerId)}
            volume={volumeLevels.get(videos[0].peerId) ?? 0}
            isPinned={pinnedPeerId === videos[0].peerId}
            {...evts(videos[0].peerId)}
          />
        )}
        <ContextMenuOverlay menu={contextMenu} pinnedPeerId={pinnedPeerId} onPinToggle={handlePinToggle} onClose={() => setContextMenu(null)} />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // 2인: layout에 따라 다르게 렌더링
  // ══════════════════════════════════════════════════════════
  if (videos.length === 2) {
    const remoteVideo = videos.find(v => !v.isLocal) ?? videos[1];
    const localVideo  = videos.find(v => v.isLocal)  ?? videos[0];

    // ── 2인 Gallery View: 좌우(PC) 또는 상하(모바일) 균등 분할 ──
    if (layout === 'gallery') {
      // PC/모바일 가로: 좌우 50/50
      // 모바일 세로: 상하 50/50
      const isVerticalMobile = isMobile && !isLandscape;
      return (
        <div
          ref={containerRef}
          className={`w-full h-full bg-gray-950 overflow-hidden p-1.5 ${
            isVerticalMobile ? 'flex flex-col gap-1.5' : 'flex flex-row gap-1.5'
          }`}
        >
          {videos.map((video) => (
            <div key={video.peerId} className="flex-1 min-w-0 min-h-0">
              <GalleryCard
                video={video}
                HandRaisedBadge={HandRaisedBadge}
                isSpeaking={isSpeaking(video.peerId)}
                isPinned={pinnedPeerId === video.peerId}
                volume={volumeLevels.get(video.peerId) ?? 0}
                {...evts(video.peerId)}
              />
            </div>
          ))}
          <ContextMenuOverlay menu={contextMenu} pinnedPeerId={pinnedPeerId} onPinToggle={handlePinToggle} onClose={() => setContextMenu(null)} />
        </div>
      );
    }

    // ── 2인 Dynamic Gallery: 발언자 메인 + 사이드 스트립 ──────
    if (layout === 'dynamic') {
      const dynamicThumbW = isMobile ? 100 : 200;
      const dynamicThumbH = isMobile ? 78  : 150;

      // 현재 활성 발언자(또는 핀된 사람)가 메인, 나머지 스트립
      const activeVideo = (pinnedPeerId && videos.find(v => v.peerId === pinnedPeerId))
        || videos.find(v => v.peerId === mainSpeakerId)
        || remoteVideo;
      const stripVideo = videos.find(v => v.peerId !== activeVideo.peerId) || localVideo;

      // 모바일 세로: 메인 위 + 하단 스트립
      if (isMobile && !isLandscape) {
        return (
          <div ref={containerRef} className="w-full h-full bg-gray-900 flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 relative overflow-hidden">
              <FullscreenCard
                video={activeVideo}
                HandRaisedBadge={HandRaisedBadge}
                isSpeaking={isSpeaking(activeVideo.peerId)}
                volume={volumeLevels.get(activeVideo.peerId) ?? 0}
                isPinned={pinnedPeerId === activeVideo.peerId}
                showSpeakerLabel
                isDynamic
                {...evts(activeVideo.peerId)}
              />
              <div className="absolute top-1.5 left-2 flex items-center gap-1 bg-purple-900/70 backdrop-blur-sm rounded-full px-2 py-0.5 pointer-events-none">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                <span className="text-purple-200 text-[10px] font-medium">자동 추적</span>
              </div>
            </div>
            <div
              className="bg-gray-950 border-t border-gray-800 flex items-center gap-1.5 px-1.5 overflow-x-auto shrink-0 thumbnail-strip-scroll"
              style={{ height: `${dynamicThumbH + 12}px` }}
            >
              <DynamicThumbnailCard
                video={stripVideo}
                isActive={stripVideo.peerId === (pinnedPeerId || mainSpeakerId)}
                isPinned={pinnedPeerId === stripVideo.peerId}
                isSpeaking={isSpeaking(stripVideo.peerId)}
                volume={volumeLevels.get(stripVideo.peerId) ?? 0}
                HandRaisedBadge={HandRaisedBadge}
                width={dynamicThumbW}
                height={dynamicThumbH}
                onClick={() => handlePinToggle(stripVideo.peerId)}
                {...evts(stripVideo.peerId)}
              />
            </div>
            <ContextMenuOverlay menu={contextMenu} pinnedPeerId={pinnedPeerId} onPinToggle={handlePinToggle} onClose={() => setContextMenu(null)} />
          </div>
        );
      }

      // PC / 모바일 가로: 메인 + 우측(또는 좌측) 스트립
      return (
        <div ref={containerRef} className="w-full h-full bg-gray-900 flex overflow-hidden">
          <div className="flex-1 min-w-0 relative overflow-hidden">
            <FullscreenCard
              video={activeVideo}
              HandRaisedBadge={HandRaisedBadge}
              isSpeaking={isSpeaking(activeVideo.peerId)}
              volume={volumeLevels.get(activeVideo.peerId) ?? 0}
              isPinned={pinnedPeerId === activeVideo.peerId}
              showSpeakerLabel
              isDynamic
              {...evts(activeVideo.peerId)}
            />
            {/* Dynamic 표시기 */}
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-purple-900/70 backdrop-blur-sm rounded-full px-2 py-0.5 pointer-events-none">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              <span className="text-purple-200 text-[10px] font-medium">자동 발언자 추적</span>
            </div>
            {pinnedPeerId && (
              <div className="absolute top-2 left-36 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 pointer-events-none">
                <Pin className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-xs text-yellow-300 font-medium">고정됨</span>
              </div>
            )}
          </div>
          {/* 우측 스트립 */}
          <div
            className="flex flex-col justify-center gap-2 overflow-y-auto bg-gray-950 py-2 px-1.5 shrink-0 border-l border-gray-800 thumbnail-strip-scroll"
            style={{ width: `${dynamicThumbW + 12}px` }}
          >
            <DynamicThumbnailCard
              video={stripVideo}
              isActive={stripVideo.peerId === (pinnedPeerId || mainSpeakerId)}
              isPinned={pinnedPeerId === stripVideo.peerId}
              isSpeaking={isSpeaking(stripVideo.peerId)}
              volume={volumeLevels.get(stripVideo.peerId) ?? 0}
              HandRaisedBadge={HandRaisedBadge}
              width={dynamicThumbW}
              height={dynamicThumbH}
              onClick={() => handlePinToggle(stripVideo.peerId)}
              {...evts(stripVideo.peerId)}
            />
          </div>
          <ContextMenuOverlay menu={contextMenu} pinnedPeerId={pinnedPeerId} onPinToggle={handlePinToggle} onClose={() => setContextMenu(null)} />
        </div>
      );
    }

    // ── 2인 Speaker View (기존): 메인 + PiP ───────────────────
    return (
      <div ref={containerRef} className="w-full h-full bg-gray-900 relative overflow-hidden">
        <FullscreenCard
          video={remoteVideo}
          HandRaisedBadge={HandRaisedBadge}
          isSpeaking={isSpeaking(remoteVideo.peerId)}
          volume={volumeLevels.get(remoteVideo.peerId) ?? 0}
          isPinned={pinnedPeerId === remoteVideo.peerId}
          {...evts(remoteVideo.peerId)}
        />
        <PictureInPicture
          video={localVideo}
          isMobile={isMobile}
          isSpeaking={isSpeaking(localVideo.peerId)}
          {...evts(localVideo.peerId)}
        />
        <ContextMenuOverlay menu={contextMenu} pinnedPeerId={pinnedPeerId} onPinToggle={handlePinToggle} onClose={() => setContextMenu(null)} />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // 3인+: Gallery View — 균등 그리드
  // ══════════════════════════════════════════════════════════
  if (layout === 'gallery') {
    // 열 수 결정
    const cols =
      isMobile && !isLandscape ? 2 :
      isMobile && isLandscape  ? 3 :
      videos.length <= 4       ? 2 :
      videos.length <= 9       ? 3 : 4;

    return (
      <div ref={containerRef} className="w-full h-full bg-gray-950 overflow-hidden p-1.5">
        <div
          className="w-full h-full grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridAutoRows: '1fr',
          }}
        >
          {videos.map((video) => (
            <GalleryCard
              key={video.peerId}
              video={video}
              HandRaisedBadge={HandRaisedBadge}
              isSpeaking={isSpeaking(video.peerId)}
              isPinned={pinnedPeerId === video.peerId}
              volume={volumeLevels.get(video.peerId) ?? 0}
              {...evts(video.peerId)}
            />
          ))}
        </div>
        <ContextMenuOverlay menu={contextMenu} pinnedPeerId={pinnedPeerId} onPinToggle={handlePinToggle} onClose={() => setContextMenu(null)} />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // 3인+: Dynamic Gallery View
  // Zoom Dynamic Gallery: 활성 발언자가 자동으로 강조(크게),
  // 나머지는 하단 또는 우측 스트립으로 표시.
  // PC: 발언자 메인 + 우측 썸네일 스트립 (Speaker View와 유사하지만
  //     발언자가 자동 교체되고 썸네일이 더 크게 표시됨)
  // 모바일: 발언자 메인 + 하단 스트립
  // ══════════════════════════════════════════════════════════
  if (layout === 'dynamic') {
    const dynamicThumbW = isMobile ? 100 : 176;
    const dynamicThumbH = isMobile ? 78  : 132;

    // ── 모바일 가로: 좌측 세로 스트립 ──────────────────────────
    if (isMobile && isLandscape) {
      return (
        <div ref={containerRef} className="w-full h-full bg-gray-900 flex overflow-hidden">
          <div
            className="flex flex-col gap-1.5 overflow-y-auto bg-gray-950 py-1.5 px-1 shrink-0 thumbnail-strip-scroll border-r border-gray-800"
            style={{ width: `${dynamicThumbW + 8}px` }}
          >
            {videos.map(video => (
              <DynamicThumbnailCard
                key={video.peerId}
                video={video}
                isActive={video.peerId === (pinnedPeerId || mainSpeakerId)}
                isPinned={pinnedPeerId === video.peerId}
                isSpeaking={isSpeaking(video.peerId)}
                volume={volumeLevels.get(video.peerId) ?? 0}
                HandRaisedBadge={HandRaisedBadge}
                width={dynamicThumbW}
                height={dynamicThumbH}
                onClick={() => handlePinToggle(video.peerId)}
                {...evts(video.peerId)}
              />
            ))}
          </div>
          <div className="flex-1 min-w-0 relative overflow-hidden">
            {mainVideo && (
              <FullscreenCard
                video={mainVideo}
                HandRaisedBadge={HandRaisedBadge}
                isSpeaking={isSpeaking(mainVideo.peerId)}
                volume={volumeLevels.get(mainVideo.peerId) ?? 0}
                isPinned={pinnedPeerId === mainVideo.peerId}
                showSpeakerLabel
                isDynamic
                {...evts(mainVideo.peerId)}
              />
            )}
          </div>
          <ContextMenuOverlay menu={contextMenu} pinnedPeerId={pinnedPeerId} onPinToggle={handlePinToggle} onClose={() => setContextMenu(null)} />
        </div>
      );
    }

    // ── PC: 메인 + 우측 세로 스트립 (더 넓은 썸네일) ───────────
    if (!isMobile) {
      return (
        <div ref={containerRef} className="w-full h-full bg-gray-900 flex overflow-hidden">
          <div className="flex-1 min-w-0 relative overflow-hidden">
            {mainVideo && (
              <FullscreenCard
                video={mainVideo}
                HandRaisedBadge={HandRaisedBadge}
                isSpeaking={isSpeaking(mainVideo.peerId)}
                volume={volumeLevels.get(mainVideo.peerId) ?? 0}
                isPinned={pinnedPeerId === mainVideo.peerId}
                showSpeakerLabel
                isDynamic
                {...evts(mainVideo.peerId)}
              />
            )}
            {/* Dynamic 표시기 */}
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-purple-900/70 backdrop-blur-sm rounded-full px-2 py-0.5 pointer-events-none">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              <span className="text-purple-200 text-[10px] font-medium">자동 발언자 추적</span>
            </div>
            {pinnedPeerId && (
              <div className="absolute top-2 left-36 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 pointer-events-none">
                <Pin className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-xs text-yellow-300 font-medium">고정됨</span>
              </div>
            )}
          </div>
          {/* 우측 썸네일 스트립 */}
          <div
            className="flex flex-col gap-2 overflow-y-auto bg-gray-950 py-2 px-1.5 shrink-0 border-l border-gray-800 thumbnail-strip-scroll"
            style={{ width: `${dynamicThumbW + 12}px` }}
          >
            {videos.map(video => (
              <DynamicThumbnailCard
                key={video.peerId}
                video={video}
                isActive={video.peerId === (pinnedPeerId || mainSpeakerId)}
                isPinned={pinnedPeerId === video.peerId}
                isSpeaking={isSpeaking(video.peerId)}
                volume={volumeLevels.get(video.peerId) ?? 0}
                HandRaisedBadge={HandRaisedBadge}
                width={dynamicThumbW}
                height={dynamicThumbH}
                onClick={() => handlePinToggle(video.peerId)}
                {...evts(video.peerId)}
              />
            ))}
          </div>
          <ContextMenuOverlay menu={contextMenu} pinnedPeerId={pinnedPeerId} onPinToggle={handlePinToggle} onClose={() => setContextMenu(null)} />
        </div>
      );
    }

    // ── 모바일 세로: 메인(위) + 하단 가로 스크롤 스트립 ──────────
    return (
      <div ref={containerRef} className="w-full h-full bg-gray-900 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 relative overflow-hidden">
          {mainVideo && (
            <FullscreenCard
              video={mainVideo}
              HandRaisedBadge={HandRaisedBadge}
              isSpeaking={isSpeaking(mainVideo.peerId)}
              volume={volumeLevels.get(mainVideo.peerId) ?? 0}
              isPinned={pinnedPeerId === mainVideo.peerId}
              showSpeakerLabel
              isDynamic
              {...evts(mainVideo.peerId)}
            />
          )}
          <div className="absolute top-1.5 left-2 flex items-center gap-1 bg-purple-900/70 backdrop-blur-sm rounded-full px-2 py-0.5 pointer-events-none">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            <span className="text-purple-200 text-[10px] font-medium">자동 추적</span>
          </div>
        </div>
        <div
          className="bg-gray-950 border-t border-gray-800 flex items-center gap-1.5 px-1.5 overflow-x-auto shrink-0 thumbnail-strip-scroll"
          style={{ height: `${dynamicThumbH + 12}px` }}
        >
          {videos.map(video => (
            <DynamicThumbnailCard
              key={video.peerId}
              video={video}
              isActive={video.peerId === (pinnedPeerId || mainSpeakerId)}
              isPinned={pinnedPeerId === video.peerId}
              isSpeaking={isSpeaking(video.peerId)}
              volume={volumeLevels.get(video.peerId) ?? 0}
              HandRaisedBadge={HandRaisedBadge}
              width={dynamicThumbW}
              height={dynamicThumbH}
              onClick={() => handlePinToggle(video.peerId)}
              {...evts(video.peerId)}
            />
          ))}
        </div>
        <ContextMenuOverlay menu={contextMenu} pinnedPeerId={pinnedPeerId} onPinToggle={handlePinToggle} onClose={() => setContextMenu(null)} />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // 3인+: Speaker View (기존 코드 유지)
  // ══════════════════════════════════════════════════════════

  // ── 모바일 가로: 좌측 세로 스트립 ──────────────────────────
  if (isMobile && isLandscape) {
    return (
      <div ref={containerRef} className="w-full h-full bg-gray-900 flex overflow-hidden">
        {/* 좌측 참가자 스트립 */}
        <div
          className="flex flex-col gap-1.5 overflow-y-auto bg-gray-950 py-1.5 px-1 shrink-0 thumbnail-strip-scroll"
          style={{ width: `${thumbW}px` }}
        >
          {videos.map(video => (
            <ThumbnailCard
              key={video.peerId}
              video={video}
              isActive={video.peerId === (pinnedPeerId || mainSpeakerId)}
              isPinned={pinnedPeerId === video.peerId}
              isSpeaking={isSpeaking(video.peerId)}
              volume={volumeLevels.get(video.peerId) ?? 0}
              HandRaisedBadge={HandRaisedBadge}
              width={thumbW - 8}
              height={thumbH - 8}
              onClick={() => handlePinToggle(video.peerId)}
              {...evts(video.peerId)}
            />
          ))}
        </div>
        {/* 메인 뷰 */}
        <div className="flex-1 min-w-0 relative overflow-hidden">
          {mainVideo && (
            <FullscreenCard
              video={mainVideo}
              HandRaisedBadge={HandRaisedBadge}
              isSpeaking={isSpeaking(mainVideo.peerId)}
              volume={volumeLevels.get(mainVideo.peerId) ?? 0}
              isPinned={pinnedPeerId === mainVideo.peerId}
              showSpeakerLabel
              {...evts(mainVideo.peerId)}
            />
          )}
        </div>
        <ContextMenuOverlay menu={contextMenu} pinnedPeerId={pinnedPeerId} onPinToggle={handlePinToggle} onClose={() => setContextMenu(null)} />
      </div>
    );
  }

  // ── PC 기본: 메인(왼쪽) + 우측 세로 스트립 ────────────────────
  if (!isMobile) {
    return (
      <div ref={containerRef} className="w-full h-full bg-gray-900 flex overflow-hidden">
        {/* 메인 뷰 */}
        <div className="flex-1 min-w-0 relative overflow-hidden">
          {mainVideo && (
            <FullscreenCard
              video={mainVideo}
              HandRaisedBadge={HandRaisedBadge}
              isSpeaking={isSpeaking(mainVideo.peerId)}
              volume={volumeLevels.get(mainVideo.peerId) ?? 0}
              isPinned={pinnedPeerId === mainVideo.peerId}
              showSpeakerLabel
              {...evts(mainVideo.peerId)}
            />
          )}
          {pinnedPeerId && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 pointer-events-none">
              <Pin className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-xs text-yellow-300 font-medium">고정됨</span>
            </div>
          )}
        </div>
        {/* 우측 참가자 스트립 */}
        <div
          className="flex flex-col gap-2 overflow-y-auto bg-gray-950 py-2 px-1.5 shrink-0 border-l border-gray-800 thumbnail-strip-scroll"
          style={{ width: `${thumbW + 12}px` }}
        >
          {videos.map(video => (
            <ThumbnailCard
              key={video.peerId}
              video={video}
              isActive={video.peerId === (pinnedPeerId || mainSpeakerId)}
              isPinned={pinnedPeerId === video.peerId}
              isSpeaking={isSpeaking(video.peerId)}
              volume={volumeLevels.get(video.peerId) ?? 0}
              HandRaisedBadge={HandRaisedBadge}
              width={thumbW}
              height={thumbH - 12}
              onClick={() => handlePinToggle(video.peerId)}
              {...evts(video.peerId)}
            />
          ))}
        </div>
        <ContextMenuOverlay menu={contextMenu} pinnedPeerId={pinnedPeerId} onPinToggle={handlePinToggle} onClose={() => setContextMenu(null)} />
      </div>
    );
  }

  // ── 모바일 세로: 메인(위) + 하단 가로 스크롤 스트립 ──────────
  return (
    <div ref={containerRef} className="w-full h-full bg-gray-900 flex flex-col overflow-hidden">
      {/* 메인 뷰 */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {mainVideo && (
          <FullscreenCard
            video={mainVideo}
            HandRaisedBadge={HandRaisedBadge}
            isSpeaking={isSpeaking(mainVideo.peerId)}
            volume={volumeLevels.get(mainVideo.peerId) ?? 0}
            isPinned={pinnedPeerId === mainVideo.peerId}
            showSpeakerLabel
            {...evts(mainVideo.peerId)}
          />
        )}
        {pinnedPeerId && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 pointer-events-none">
            <Pin className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-xs text-yellow-300 font-medium">고정됨</span>
          </div>
        )}
      </div>
      {/* 하단 가로 스트립 */}
      <div
        className="bg-gray-950 border-t border-gray-800 flex items-center gap-1.5 px-1.5 overflow-x-auto shrink-0 thumbnail-strip-scroll"
        style={{ height: `${thumbH}px` }}
      >
        {videos.map(video => (
          <ThumbnailCard
            key={video.peerId}
            video={video}
            isActive={video.peerId === (pinnedPeerId || mainSpeakerId)}
            isPinned={pinnedPeerId === video.peerId}
            isSpeaking={isSpeaking(video.peerId)}
            volume={volumeLevels.get(video.peerId) ?? 0}
            HandRaisedBadge={HandRaisedBadge}
            width={thumbW}
            height={thumbH - 12}
            onClick={() => handlePinToggle(video.peerId)}
            {...evts(video.peerId)}
          />
        ))}
      </div>
      <ContextMenuOverlay menu={contextMenu} pinnedPeerId={pinnedPeerId} onPinToggle={handlePinToggle} onClose={() => setContextMenu(null)} />
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
// FullscreenCard — 메인뷰
// ══════════════════════════════════════════════════════════════
function FullscreenCard({
  video, HandRaisedBadge, isSpeaking, volume, isPinned,
  showSpeakerLabel = false, isDynamic = false,
  onContextMenu, onTouchStart, onTouchEnd,
}) {
  return (
    <div
      className="w-full h-full relative overflow-hidden bg-gray-900"
      onContextMenu={onContextMenu}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <VideoElementContain
        ref={video.ref}
        stream={video.stream}
        isLocal={video.isLocal}
        isVideoOff={video.isVideoOff}
      />

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

      {isSpeaking && (
        <div className="absolute inset-0 pointer-events-none rounded-none ring-[3px] ring-inset ring-green-400 speaking-ring" />
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`rounded-full p-1.5 ${video.isMuted ? 'bg-red-500/90' : 'bg-black/50'}`}>
              {video.isMuted
                ? <MicOff className="w-4 h-4 text-white" />
                : <Mic    className="w-4 h-4 text-white" />
              }
            </div>
            <span className="text-white font-semibold text-sm drop-shadow truncate max-w-[200px] md:max-w-[400px]">
              {video.username}
            </span>
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
// GalleryCard — Gallery View 균등 그리드 카드
// ══════════════════════════════════════════════════════════════
function GalleryCard({
  video, HandRaisedBadge, isSpeaking, isPinned, volume,
  onContextMenu, onTouchStart, onTouchEnd,
}) {
  return (
    <div
      className={`
        relative w-full h-full rounded-xl overflow-hidden cursor-pointer bg-gray-900
        transition-all duration-200
        ${isSpeaking
          ? 'ring-[3px] ring-green-400 shadow-lg shadow-green-400/20'
          : isPinned
          ? 'ring-2 ring-yellow-400'
          : 'ring-1 ring-gray-700 hover:ring-gray-500'
        }
      `}
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
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800">
          <div className="w-14 h-14 rounded-full bg-gray-600 flex items-center justify-center mb-2">
            <span className="text-white text-2xl font-bold">
              {video.username?.charAt(0).toUpperCase()}
            </span>
          </div>
          <VideoOff className="w-5 h-5 text-gray-500" />
        </div>
      )}

      {isSpeaking && (
        <div className="absolute inset-0 pointer-events-none ring-[3px] ring-inset ring-green-400 rounded-xl speaking-ring" />
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className={`rounded-full p-1 ${video.isMuted ? 'bg-red-500/90' : 'bg-black/40'}`}>
              {video.isMuted
                ? <MicOff className="w-3 h-3 text-white" />
                : <Mic    className="w-3 h-3 text-white" />
              }
            </div>
            <span className="text-white font-medium text-xs drop-shadow truncate max-w-[120px]">
              {video.username}
            </span>
            {isSpeaking && <VolumeWave volume={volume} small />}
          </div>
          <div className="flex items-center gap-1">
            {isPinned && <Pin className="w-3 h-3 text-yellow-400" />}
            {video.isHandRaised && HandRaisedBadge && (
              <div className="scale-75 origin-right"><HandRaisedBadge /></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
// ThumbnailCard — Speaker View 스트립 카드
// ══════════════════════════════════════════════════════════════
function ThumbnailCard({
  video, isActive, isPinned, isSpeaking, volume, HandRaisedBadge,
  width, height, onClick, onContextMenu, onTouchStart, onTouchEnd,
}) {
  return (
    <div
      className={`
        relative rounded-lg overflow-hidden cursor-pointer flex-shrink-0
        transition-all duration-200
        ${isActive
          ? 'ring-2 ring-blue-400 shadow-lg shadow-blue-400/20'
          : isSpeaking
          ? 'ring-2 ring-green-400'
          : isPinned
          ? 'ring-2 ring-yellow-400'
          : 'ring-1 ring-gray-700 hover:ring-gray-500'
        }
      `}
      style={{ width: `${width}px`, height: `${height}px` }}
      onClick={onClick}
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
      {isSpeaking && (
        <div className="absolute inset-0 pointer-events-none ring-[2px] ring-inset ring-green-400 rounded-lg speaking-ring" />
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5 flex items-center gap-1">
        <div className={`rounded-full p-0.5 flex-shrink-0 ${video.isMuted ? 'bg-red-500/80' : ''}`}>
          {video.isMuted && <MicOff className="w-2.5 h-2.5 text-white" />}
        </div>
        <span className="text-white text-[10px] truncate flex-1">{video.username}</span>
        {isPinned && <Pin className="w-2.5 h-2.5 text-yellow-400 flex-shrink-0" />}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// DynamicThumbnailCard — Dynamic Gallery View 스트립 카드
// Speaker View의 ThumbnailCard와 유사하지만 조금 더 크고
// 활성 발언자 강조가 더 두드러짐
// ══════════════════════════════════════════════════════════════
function DynamicThumbnailCard({
  video, isActive, isPinned, isSpeaking, volume, HandRaisedBadge,
  width, height, onClick, onContextMenu, onTouchStart, onTouchEnd,
}) {
  return (
    <div
      className={`
        relative rounded-xl overflow-hidden cursor-pointer flex-shrink-0
        transition-all duration-300
        ${isActive
          ? 'ring-[3px] ring-purple-400 shadow-xl shadow-purple-400/30 scale-[1.02]'
          : isSpeaking
          ? 'ring-2 ring-green-400 shadow-lg shadow-green-400/20'
          : isPinned
          ? 'ring-2 ring-yellow-400'
          : 'ring-1 ring-gray-700 hover:ring-gray-500 hover:scale-[1.01]'
        }
      `}
      style={{ width: `${width}px`, height: `${height}px` }}
      onClick={onClick}
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
          <span className="text-white text-xl font-bold">
            {video.username?.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      {isSpeaking && (
        <div className="absolute inset-0 pointer-events-none ring-[2px] ring-inset ring-green-400 rounded-xl speaking-ring" />
      )}
      {/* 활성 발언자 오버레이 */}
      {isActive && (
        <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
        <div className="flex items-center gap-1">
          <div className={`rounded-full p-0.5 flex-shrink-0 ${video.isMuted ? 'bg-red-500/80' : 'bg-black/30'}`}>
            {video.isMuted
              ? <MicOff className="w-3 h-3 text-white" />
              : <Mic    className="w-3 h-3 text-white" />
            }
          </div>
          <span className="text-white text-xs font-medium truncate flex-1">{video.username}</span>
          {isSpeaking && <VolumeWave volume={volume} small />}
          {isPinned && <Pin className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
          {video.isHandRaised && HandRaisedBadge && (
            <div className="scale-75 origin-right flex-shrink-0"><HandRaisedBadge /></div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PictureInPicture — 2인 Speaker 모드 로컬 뷰
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
// VolumeWave
// ══════════════════════════════════════════════════════════════
function VolumeWave({ volume, small = false }) {
  const bars = 4;
  return (
    <span className={`flex items-end gap-[2px] ${small ? 'h-3' : 'h-4'}`}>
      {Array.from({ length: bars }).map((_, i) => {
        const heightPct = Math.min(100, (volume * 100) * ((i % 2 === 0 ? 1 : 0.7) + Math.random() * 0.3));
        return (
          <span
            key={i}
            className="bg-green-400 rounded-full speaking-bar"
            style={{
              width: small ? '2px' : '3px',
              height: `${Math.max(20, heightPct)}%`,
              animationDelay: `${i * 80}ms`,
            }}
          />
        );
      })}
    </span>
  );
}


// ══════════════════════════════════════════════════════════════
// ContextMenuOverlay
// ══════════════════════════════════════════════════════════════
function ContextMenuOverlay({ menu, pinnedPeerId, onPinToggle, onClose }) {
  if (!menu) return null;
  const isPinned = pinnedPeerId === menu.peerId;
  const menuW = 168, menuH = 60;
  const x = Math.min(menu.x, window.innerWidth  - menuW - 8);
  const y = Math.min(menu.y, window.innerHeight - menuH - 8);

  return (
    <div
      className="fixed z-50"
      style={{ left: x, top: y }}
      onPointerDown={e => e.stopPropagation()}
    >
      <div
        className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl overflow-hidden"
        style={{ width: `${menuW}px` }}
      >
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
