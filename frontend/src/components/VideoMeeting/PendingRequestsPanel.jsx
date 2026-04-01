// frontend/src/components/VideoMeeting/PendingRequestsPanel.jsx
//
// [변경 내역]
// - 패널 높이/패딩 최소화
// - 승인/거부 후 결과 메시지를 toast 형태로 표시 후 2초 뒤 자동 소멸
// - 대기 0명일 때는 패널 닫기

import React, { useState, useCallback, useRef } from 'react';
import { Users, UserCheck, UserX, X, Check } from 'lucide-react';

export function PendingRequestsPanel({
  requests,
  onApprove,
  onReject,
  onClose,
}) {
  // 처리 중 버튼 비활성화
  const [processing, setProcessing] = useState(new Set());
  // 결과 toast: { id, username, action: 'approved'|'rejected' }
  const [toasts, setToasts] = useState([]);
  const toastTimersRef = useRef({});

  const showToast = useCallback((id, username, action) => {
    const toastId = `${id}-${Date.now()}`;
    setToasts(prev => [...prev, { toastId, username, action }]);
    toastTimersRef.current[toastId] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.toastId !== toastId));
      delete toastTimersRef.current[toastId];
    }, 2000);
  }, []);

  const handleApprove = useCallback(async (requestId, username) => {
    setProcessing(prev => new Set(prev).add(requestId));
    try {
      await onApprove(requestId);
      showToast(requestId, username, 'approved');
    } finally {
      setProcessing(prev => { const s = new Set(prev); s.delete(requestId); return s; });
    }
  }, [onApprove, showToast]);

  const handleReject = useCallback(async (requestId, username) => {
    setProcessing(prev => new Set(prev).add(requestId));
    try {
      await onReject(requestId);
      showToast(requestId, username, 'rejected');
    } finally {
      setProcessing(prev => { const s = new Set(prev); s.delete(requestId); return s; });
    }
  }, [onReject, showToast]);

  return (
    <div className="bg-amber-950/40 border-b border-amber-800/40 px-3 py-1.5 relative">
      {/* ── 헤더 라인 ── */}
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="text-amber-300 text-xs font-semibold">
          참가 대기 중 ({requests.length})
        </span>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 p-0.5 rounded transition"
          type="button"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── 대기 목록 ── */}
      {requests.length === 0 ? (
        <p className="text-gray-500 text-xs py-0.5">대기 중인 참가자가 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {requests.map((request) => {
            const isProc = processing.has(request.id);
            return (
              <div
                key={request.id}
                className="flex items-center gap-2 bg-gray-800/60 rounded-md px-2 py-1"
              >
                {/* 아바타 */}
                <div className="w-6 h-6 bg-blue-700 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-[10px]">
                    {request.username?.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* 이름 + 시각 */}
                <div className="flex-1 min-w-0">
                  <span className="text-white text-xs font-medium truncate block">
                    {request.username}
                  </span>
                  <span className="text-gray-500 text-[10px]">
                    {new Date(request.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* 승인 / 거부 버튼 */}
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => handleApprove(request.id, request.username)}
                    disabled={isProc}
                    className="flex items-center gap-0.5 px-2 py-0.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded text-xs transition"
                    type="button"
                  >
                    <UserCheck className="w-3 h-3" />
                    <span>승인</span>
                  </button>
                  <button
                    onClick={() => handleReject(request.id, request.username)}
                    disabled={isProc}
                    className="flex items-center gap-0.5 px-2 py-0.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded text-xs transition"
                    type="button"
                  >
                    <UserX className="w-3 h-3" />
                    <span>거부</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 결과 Toast (자동 소멸) ── */}
      <div className="absolute top-1 right-8 flex flex-col gap-1 pointer-events-none z-50">
        {toasts.map(({ toastId, username, action }) => (
          <div
            key={toastId}
            className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium shadow-lg
              animate-slide-in-right
              ${action === 'approved'
                ? 'bg-green-700 text-white'
                : 'bg-red-700 text-white'
              }
            `}
          >
            <Check className="w-3 h-3" />
            <span>{username} {action === 'approved' ? '승인됨' : '거부됨'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}