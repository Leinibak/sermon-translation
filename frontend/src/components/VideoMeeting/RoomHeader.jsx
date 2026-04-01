// frontend/src/components/VideoMeeting/RoomHeader.jsx
//
// [변경 내역]
// - 헤더 높이 최소화: 방 이름을 참가자 수 라인에 인라인으로 표시
// - 종(Bell) 버튼을 같은 라인으로 이동
// - View 선택 버튼(Speaker / Gallery / Dynamic Gallery)을 동일 라인에 추가
// - 진단 상태 바를 헤더 내부에 통합 (한 줄 compact)

import React from 'react';
import { Bell, MonitorUp, LayoutGrid, Monitor, Sparkles } from 'lucide-react';

const VIEW_OPTIONS = [
  {
    id: 'speaker',
    label: '발표자',
    icon: Monitor,
    title: 'Speaker View — 활성 발언자를 크게',
  },
  {
    id: 'gallery',
    label: '갤러리',
    icon: LayoutGrid,
    title: 'Gallery View — 균등 그리드',
  },
  {
    id: 'dynamic',
    label: '동적',
    icon: Sparkles,
    title: 'Dynamic Gallery — 발언자 자동 확대',
  },
];

export function RoomHeader({
  title,
  participantCount,
  connectionStatus,
  isHost,
  pendingCount,
  onTogglePendingPanel,
  screenSharingUser,
  // 레이아웃 관련 (VideoMeetingRoom에서 전달)
  layout = 'speaker',
  onLayoutChange,
  // 진단 상태 (옵션)
  wsConnected,
  wsReady,
  localStreamReady,
  sfuStatus,
  remoteCount,
  videoCardsCount,
  sfuInitialized,
  isHostRole,
  participantStatus,
  showDiag = false,
}) {
  return (
    <div className="bg-gray-800 border-b border-gray-700 flex-shrink-0">
      {/* ── 메인 라인: 방이름 / 참가자수 / 상태 / 뷰선택 / 벨 ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 min-h-0">

        {/* 방 이름 (약간 큰 글씨) */}
        <span className="text-white font-semibold text-base leading-none shrink-0 max-w-[160px] truncate" title={title}>
          {title}
        </span>

        {/* 구분선 */}
        <span className="text-gray-600 text-sm">·</span>

        {/* 참가자 수 */}
        <span className="text-gray-300 text-sm whitespace-nowrap shrink-0">
          {participantCount}명 참가 중
        </span>

        {/* 화면 공유 중 표시 */}
        {screenSharingUser && (
          <span className="flex items-center text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded text-xs shrink-0">
            <MonitorUp className="w-3 h-3 mr-1" />
            {screenSharingUser}
          </span>
        )}

        {/* 스페이서 */}
        <div className="flex-1 min-w-0" />

        {/* ── 뷰 선택 버튼 (참가자 2명 이상일 때만) ── */}
        {participantCount >= 2 && onLayoutChange && (
          <div className="flex items-center gap-0.5 bg-gray-900/60 rounded-md p-0.5 shrink-0">
            {VIEW_OPTIONS.map(({ id, label, icon: Icon, title: tip }) => (
              <button
                key={id}
                onClick={() => onLayoutChange(id)}
                title={tip}
                className={`
                  flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all
                  ${layout === id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  }
                `}
                type="button"
              >
                <Icon className="w-3 h-3" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* 방장 전용: 참가 대기 알림 벨 */}
        {isHost && (
          <button
            onClick={onTogglePendingPanel}
            className="relative p-1.5 text-gray-400 hover:text-white rounded-md hover:bg-gray-700 transition shrink-0"
            title="참가 대기 목록"
            type="button"
          >
            <Bell className="w-4 h-4" />
            {pendingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center text-[10px] font-bold text-white bg-red-600 rounded-full animate-pulse">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* ── 진단 상태 바 (개발 모드 / showDiag) ── */}
      {showDiag && (
        <div className="bg-gray-900/80 text-[10px] text-gray-400 px-3 py-0.5 flex flex-wrap gap-x-3 gap-y-0 border-t border-gray-700/50">
          <span>WS: <b className={wsConnected ? 'text-green-400' : 'text-red-400'}>{wsConnected ? '연결' : '끊김'}</b></span>
          <span>Ready: <b className={wsReady ? 'text-green-400' : 'text-yellow-400'}>{wsReady ? '준비' : '대기'}</b></span>
          <span>Media: <b className={localStreamReady ? 'text-green-400' : 'text-red-400'}>{localStreamReady ? 'OK' : '없음'}</b></span>
          <span>SFU: <b className={sfuStatus === 'connected' ? 'text-green-400' : sfuStatus === 'failed' ? 'text-red-400' : 'text-yellow-400'}>{sfuStatus}</b></span>
          <span>상대방: <b className={remoteCount > 0 ? 'text-green-400' : 'text-red-400'}>{remoteCount}명</b></span>
          <span>VideoCards: <b className="text-white">{videoCardsCount}</b></span>
          <span>SFU Init: <b className="text-gray-400">{sfuInitialized ? '완료' : '대기'}</b></span>
          <span>Role: <b className="text-blue-400">{isHostRole ? '방장' : `참가자(${participantStatus})`}</b></span>
        </div>
      )}
    </div>
  );
}