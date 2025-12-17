// frontend/src/components/VideoMeeting/VideoGrid.jsx (모바일 최적화 버전)
import React, { useState, useEffect } from 'react';
import { VideoOff, Mic, MicOff } from 'lucide-react';
import { VideoElement } from './VideoElement';

export function VideoGrid({ videos, HandRaisedBadge }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 그리드 레이아웃 계산 (데스크톱)
  const getGridLayout = (count) => {
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    if (count <= 9) return { cols: 3, rows: 3 };
    return { cols: 4, rows: Math.ceil(count / 4) };
  };

  const layout = getGridLayout(videos.length);

  // 모바일 레이아웃
  if (isMobile) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-900 p-2">
        <div className="space-y-3 max-w-lg mx-auto">
          {videos.map((video, index) => (
            <VideoCard 
              key={video.peerId || index}
              video={video}
              HandRaisedBadge={HandRaisedBadge}
              isMobile={true}
            />
          ))}
        </div>
      </div>
    );
  }

  // 데스크톱 레이아웃
  return (
    <div className="flex-1 p-4 overflow-y-auto bg-gray-900">
      <div 
        className="max-w-7xl mx-auto grid gap-4 h-full" 
        style={{
          gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
          gridAutoRows: 'minmax(0, 1fr)'
        }}
      >
        {videos.map((video, index) => (
          <VideoCard 
            key={video.peerId || index}
            video={video}
            HandRaisedBadge={HandRaisedBadge}
            isMobile={false}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 개별 비디오 카드 컴포넌트
 */
function VideoCard({ video, HandRaisedBadge, isMobile }) {
  return (
    <div 
      className={`relative bg-gray-800 rounded-lg overflow-hidden flex items-center justify-center ${
        isMobile ? 'w-full h-64' : 'aspect-video'
      }`}
      style={{ minHeight: isMobile ? '256px' : '200px' }}
    >
      {/* 비디오 엘리먼트 */}
      <VideoElement 
        ref={video.ref} 
        stream={video.stream} 
        isLocal={video.isLocal}
        isVideoOff={video.isVideoOff}
      />

      {/* 비디오 끔 오버레이 */}
      {video.isVideoOff && (
        <div className="absolute inset-0 bg-gray-900 bg-opacity-90 flex flex-col items-center justify-center">
          <div className={`bg-gray-700 rounded-full flex items-center justify-center mb-3 ${
            isMobile ? 'w-16 h-16' : 'w-20 h-20'
          }`}>
            <span className={`text-white font-bold ${
              isMobile ? 'text-2xl' : 'text-3xl'
            }`}>
              {video.username?.charAt(0).toUpperCase()}
            </span>
          </div>
          <VideoOff className={`text-gray-500 ${isMobile ? 'w-6 h-6' : 'w-8 h-8'}`} />
        </div>
      )}
      
      {/* 손들기 배지 */}
      {video.isHandRaised && HandRaisedBadge && (
        <div className="absolute top-2 right-2">
          <HandRaisedBadge />
        </div>
      )}
      
      {/* 하단 정보 바 */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 md:p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* 마이크 상태 */}
            <div className={`rounded-full ${
              video.isMuted ? 'bg-red-500' : 'bg-gray-700'
            } ${isMobile ? 'p-1' : 'p-1.5'}`}>
              {video.isMuted ? (
                <MicOff className={`text-white ${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`} />
              ) : (
                <Mic className={`text-white ${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`} />
              )}
            </div>
            
            {/* 사용자 이름 */}
            <span className={`text-white font-medium truncate ${
              isMobile ? 'text-xs max-w-[120px]' : 'text-sm max-w-[150px]'
            }`}>
              {video.username}
            </span>
          </div>
          
          {/* 연결 품질 표시 (선택사항) */}
          {video.connectionQuality && !isMobile && (
            <ConnectionQualityIndicator quality={video.connectionQuality} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 연결 품질 표시 컴포넌트 (선택사항)
 */
function ConnectionQualityIndicator({ quality }) {
  const getColor = () => {
    if (quality === 'excellent') return 'bg-green-500';
    if (quality === 'good') return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getBars = () => {
    if (quality === 'excellent') return 3;
    if (quality === 'good') return 2;
    return 1;
  };

  return (
    <div className="flex items-end gap-0.5">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className={`w-1 rounded-t ${
            i < getBars() ? getColor() : 'bg-gray-600'
          }`}
          style={{ height: `${(i + 1) * 4}px` }}
        />
      ))}
    </div>
  );
}