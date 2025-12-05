// frontend/src/components/VideoMeeting/VideoGrid.jsx
import React from 'react';
import { VideoOff, Mic, MicOff } from 'lucide-react';
import { VideoElement } from './VideoElement';

export function VideoGrid({ videos }) {
  return (
    <div className="flex-1 p-4 overflow-y-auto">
      <div 
        className="max-w-6xl mx-auto grid gap-4" 
        style={{
          gridTemplateColumns: videos.length === 1 
            ? '1fr' 
            : videos.length === 2
            ? 'repeat(2, 1fr)'
            : 'repeat(auto-fit, minmax(400px, 1fr))'
        }}
      >
        {videos.map((video, index) => (
          <div 
            key={video.peerId || index} 
            className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video"
            style={{ maxHeight: '400px' }}
          >
            <VideoElement 
              ref={video.ref} 
              stream={video.stream} 
              isLocal={video.isLocal}
              isVideoOff={video.isVideoOff}
            />

            {video.isVideoOff && (
              <div className="absolute inset-0 bg-gray-900 bg-opacity-70 flex items-center justify-center">
                <VideoOff className="w-12 h-12 text-gray-400" />
              </div>
            )}
            
            <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 px-3 py-1 rounded flex items-center gap-2">
              {video.isMuted ? (
                <MicOff className="w-4 h-4 text-red-400" />
              ) : (
                <Mic className="w-4 h-4 text-white" />
              )}
              <span className="text-white text-sm font-medium">
                {video.username}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}