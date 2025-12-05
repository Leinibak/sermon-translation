// frontend/src/components/VideoMeeting/HostLeaveModal.jsx
import React from 'react';
import { AlertTriangle, LogOut, XCircle } from 'lucide-react';

export function HostLeaveModal({ isOpen, onClose, onLeaveOnly, onEndMeeting }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        {/* 헤더 */}
        <div className="flex items-center mb-4">
          <AlertTriangle className="w-6 h-6 text-amber-500 mr-3" />
          <h2 className="text-xl font-bold text-gray-900">
            회의실 나가기
          </h2>
        </div>
        
        {/* 설명 */}
        <p className="text-gray-600 mb-6">
          방장으로서 회의실을 나가시겠습니까?<br />
          회의를 종료하면 모든 참가자가 자동으로 퇴장됩니다.
        </p>
        
        {/* 옵션 버튼들 */}
        <div className="space-y-3">
          {/* 회의 종료 (모든 참가자 퇴장) */}
          <button
            onClick={onEndMeeting}
            className="w-full px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center justify-center font-medium"
          >
            <XCircle className="w-5 h-5 mr-2" />
            회의 종료 (모든 참가자 퇴장)
          </button>
          
          {/* 나만 나가기 (회의 유지) */}
          <button
            onClick={onLeaveOnly}
            className="w-full px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition flex items-center justify-center font-medium"
          >
            <LogOut className="w-5 h-5 mr-2" />
            나만 나가기 (회의 유지)
          </button>
          
          {/* 취소 */}
          <button
            onClick={onClose}
            className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
          >
            취소
          </button>
        </div>
        
        {/* 경고 메시지 */}
        <div className="mt-4 bg-amber-50 border-l-4 border-amber-500 p-3 rounded">
          <p className="text-sm text-amber-800">
            <strong>참고:</strong> "나만 나가기"를 선택하면 회의실은 계속 유지되지만, 
            방장 권한이 없어져 다시 입장하려면 새로운 참가 요청이 필요합니다.
          </p>
        </div>
      </div>
    </div>
  );
}