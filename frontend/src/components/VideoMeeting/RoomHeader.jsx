// frontend/src/components/VideoMeeting/RoomHeader.jsx
import React from 'react';
import { Bell } from 'lucide-react';

export function RoomHeader({ 
  title, 
  participantCount, 
  connectionStatus,
  isHost,
  pendingCount,
  onTogglePendingPanel 
}) {
  return (
    <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-xl font-bold">{title}</h1>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-400">
              {participantCount}명 참가 중
            </span>
            
            {/* 연결 상태 표시 */}
            {Object.entries(connectionStatus).map(([peerId, status]) => (
              <span key={peerId} className="text-xs">
                <span className={`inline-block w-2 h-2 rounded-full mr-1 ${
                  status === 'connected' ? 'bg-green-500' :
                  status === 'connecting' ? 'bg-yellow-500' :
                  'bg-red-500'
                }`}></span>
                {peerId}: {status}
              </span>
            ))}
          </div>
        </div>
        
        {isHost && (
          <button 
            onClick={onTogglePendingPanel}
            className="relative p-2 bg-gray-700 text-white rounded-full hover:bg-gray-600 transition"
          >
            <Bell className="w-5 h-5" />
            {pendingCount > 0 && (
              <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}