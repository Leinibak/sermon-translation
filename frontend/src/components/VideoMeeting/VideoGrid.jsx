// frontend/src/components/VideoMeeting/VideoGrid.jsx (개선 버전)
import React from 'react';
import { VideoOff, Mic, MicOff } from 'lucide-react';
import { VideoElement } from './VideoElement';

export function VideoGrid({ videos, HandRaisedBadge }) {
  // 그리드 레이아웃 계산
  const getGridLayout = (count) => {
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    if (count <= 9) return { cols: 3, rows: 3 };
    return { cols: 4, rows: Math.ceil(count / 4) };
  };

  const layout = getGridLayout(videos.length);

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
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 개별 비디오 카드 컴포넌트
 */
function VideoCard({ video, HandRaisedBadge }) {
  return (
    <div 
      className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video flex items-center justify-center"
      style={{ minHeight: '200px' }}
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
          <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center mb-3">
            <span className="text-3xl text-white font-bold">
              {video.username?.charAt(0).toUpperCase()}
            </span>
          </div>
          <VideoOff className="w-8 h-8 text-gray-500" />
        </div>
      )}
      
      {/* 손들기 배지 */}
      {video.isHandRaised && HandRaisedBadge && (
        <div className="absolute top-2 right-2">
          <HandRaisedBadge />
        </div>
      )}
      
      {/* 하단 정보 바 */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* 마이크 상태 */}
            <div className={`p-1.5 rounded-full ${
              video.isMuted ? 'bg-red-500' : 'bg-gray-700'
            }`}>
              {video.isMuted ? (
                <MicOff className="w-4 h-4 text-white" />
              ) : (
                <Mic className="w-4 h-4 text-white" />
              )}
            </div>
            
            {/* 사용자 이름 */}
            <span className="text-white text-sm font-medium truncate max-w-[150px]">
              {video.username}
            </span>
          </div>
          
          {/* 연결 품질 표시 (선택사항) */}
          {video.connectionQuality && (
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