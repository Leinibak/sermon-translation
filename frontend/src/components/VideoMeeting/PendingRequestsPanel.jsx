// frontend/src/components/VideoMeeting/PendingRequestsPanel.jsx
import React from 'react';
import { Users, UserCheck, UserX, X } from 'lucide-react';

export function PendingRequestsPanel({ 
  requests, 
  onApprove, 
  onReject, 
  onClose 
}) {
  return (
    <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-gray-900 font-semibold flex items-center">
          <Users className="w-5 h-5 mr-2" />
          참가 대기 중 ({requests.length})
        </h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      
      {requests.length === 0 ? (
        <p className="text-gray-600 text-sm">대기 중인 참가자가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((request) => (
            <div
              key={request.id}
              className="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm"
            >
              <div className="flex items-center">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                  <span className="text-blue-600 font-semibold text-sm">
                    {request.username?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-gray-900 font-medium">{request.username}</p>
                  <p className="text-gray-500 text-xs">
                    {new Date(request.created_at).toLocaleString('ko-KR')}
                  </p>
                </div>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => onApprove(request.id)}
                  className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition flex items-center text-sm"
                >
                  <UserCheck className="w-4 h-4 mr-1" />
                  승인
                </button>
                <button
                  onClick={() => onReject(request.id)}
                  className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition flex items-center text-sm"
                >
                  <UserX className="w-4 h-4 mr-1" />
                  거부
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}