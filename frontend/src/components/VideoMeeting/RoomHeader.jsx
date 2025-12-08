// frontend/src/components/VideoMeeting/RoomHeader.jsx (개선 버전)
import React from 'react';
import { Bell, MonitorUp } from 'lucide-react';

export function RoomHeader({ 
  title, 
  participantCount, 
  connectionStatus,
  isHost,
  pendingCount,
  onTogglePendingPanel,
  screenSharingUser // ⭐ 추가
}) {
  return (
    <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
      <div className="flex justify-between items-center">
        <div className="flex-1">
          <h1 className="text-white text-xl font-bold mb-1">{title}</h1>
          
          <div className="flex items-center gap-4 text-sm flex-wrap">
            {/* 참가자 수 */}
            <span className="text-gray-400">
              {participantCount}명 참가 중
            </span>
            
            {/* ⭐ 화면 공유 중 표시 */}
            {screenSharingUser && (
              <span className="flex items-center text-blue-400 bg-blue-900/30 px-2 py-1 rounded">
                <MonitorUp className="w-4 h-4 mr-1" />
                {screenSharingUser}님 화면 공유 중
              </span>
            )}
            
            {/* 연결 상태 표시 (개발 모드) */}
            {process.env.NODE_ENV === 'development' && Object.entries(connectionStatus).map(([peerId, status]) => (
              <span key={peerId} className="text-xs text-gray-500">
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
        
        {/* 방장 전용: 참가 대기 알림 */}
        {isHost && (
          <button 
            onClick={onTogglePendingPanel}
            className="relative p-2 bg-gray-700 text-white rounded-full hover:bg-gray-600 transition"
            title="참가 대기 목록"
          >
            <Bell className="w-5 h-5" />
            {pendingCount > 0 && (
              <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full animate-pulse">
                {pendingCount}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}