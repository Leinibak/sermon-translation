// frontend/src/components/VideoMeetingRoom.jsx (WebSocket 통합 버전)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

import '../styles/videoMeeting.css';

// Custom Hooks
import { useWebSocket } from '../hooks/useWebSocket';  // ⭐ 새로 추가
import { useWebRTC } from '../hooks/useWebRTC';
import { useVideoMeetingAPI } from '../hooks/useVideoMeetingAPI';

// UI Components
import { RoomHeader } from './VideoMeeting/RoomHeader';
import { PendingRequestsPanel } from './VideoMeeting/PendingRequestsPanel';
import { VideoGrid } from './VideoMeeting/VideoGrid';
import { HostLeaveModal } from './VideoMeeting/HostLeaveModal';
import { ChatPanel, ChatToggleButton } from './VideoMeeting/ChatPanel';

function VideoMeetingRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // State
  const [isHost, setIsHost] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [showPendingPanel, setShowPendingPanel] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Refs
  const localVideoRef = useRef(null);
  const fetchRoomDetailsRef = useRef(null);

  // Custom Hooks
  const api = useVideoMeetingAPI(id);
  const webrtc = useWebRTC(id, user, isHost);

  const { room, participants, pendingRequests, loading, error } = api;
  const { 
    localStreamRef, 
    remoteStreams, 
    connectionStatus,
    getLocalMedia,
    cleanup: cleanupWebRTC 
  } = webrtc;

  // ⭐⭐⭐ WebSocket 메시지 핸들러
  const handleWebSocketMessage = useCallback((data) => {
    console.log('📨 WebSocket 메시지:', data.type);

    switch (data.type) {
      case 'approval_notification':
        // 승인 알림 수신
        console.log('🎉 승인 완료! 페이지 새로고침...');
        alert('참가가 승인되었습니다!');
        
        // 회의실 정보 다시 불러오기
        if (fetchRoomDetailsRef.current) {
          fetchRoomDetailsRef.current();
        }
        
        // 미디어 초기화 트리거
        setMediaReady(false);
        break;

      case 'rejection_notification':
        // 거부 알림 수신
        alert('참가 요청이 거부되었습니다.');
        navigate('/video-meetings');
        break;

      case 'join_request_notification':
        // 참가 요청 알림 (방장용)
        console.log('📢 새로운 참가 요청:', data.username);
        api.fetchPendingRequests();
        
        if (!showPendingPanel) {
          setShowPendingPanel(true);
        }
        break;

      case 'chat_message':
        // ⭐ 채팅 메시지 수신
        console.log('💬 채팅 메시지 수신:', data.sender, data.content);
        
        setChatMessages(prev => [...prev, {
          id: data.message_id,
          sender_id: data.sender_id,
          sender_username: data.sender,
          content: data.content,
          created_at: data.created_at,
          is_mine: data.sender_id === user?.id
        }]);

        // 읽지 않은 메시지 카운트
        if (!isChatOpen && data.sender_id !== user?.id) {
          setUnreadCount(prev => prev + 1);
        }
        break;

      case 'user_joined':
        console.log('👋 사용자 입장:', data.username);
        break;

      case 'user_left':
        console.log('👋 사용자 퇴장:', data.username);
        break;

      default:
        console.log('⚠️ 처리되지 않은 메시지 타입:', data.type);
    }
  }, [user, navigate, api, showPendingPanel, isChatOpen]);

  // ⭐⭐⭐ WebSocket 연결
  const { sendMessage: sendWebSocketMessage } = useWebSocket(
    id, 
    user, 
    handleWebSocketMessage
  );

  // =========================================================================
  // Handlers
  // =========================================================================

  const handleLeaveClick = () => {
    if (isHost && remoteStreams.length > 0) {
      setShowLeaveModal(true);
    } else {
      handleLeaveOnly();
    }
  };

  const handleLeaveOnly = async () => {
    console.log('👋 회의실 나가기...');
    
    cleanupWebRTC();
    
    try {
      await api.leaveRoom();
    } catch (error) {
      console.error('❌ 나가기 실패:', error);
    } finally {
      navigate('/video-meetings');
    }
  };

  const handleEndMeeting = async () => {
    console.log('🛑 회의 종료...');
    
    cleanupWebRTC();
    
    try {
      await api.endMeeting();
      alert('회의가 종료되었습니다. 모든 참가자가 퇴장됩니다.');
    } catch (error) {
      console.error('❌ 회의 종료 실패:', error);
      alert('회의 종료에 실패했습니다.');
    } finally {
      navigate('/video-meetings');
    }
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isMicOn;
        setIsMicOn(!isMicOn);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoOn;
        setIsVideoOn(!isVideoOn);
      }
    }
  };

  const handleApprove = async (participantId) => {
    try {
      await api.approveParticipant(participantId);
      console.log('✅ 승인 완료 - WebSocket으로 알림 전송됨');
    } catch (error) {
      alert('참가 승인에 실패했습니다.');
    }
  };

  const handleReject = async (participantId) => {
    try {
      await api.rejectParticipant(participantId);
      console.log('✅ 거부 완료');
    } catch (error) {
      alert('참가 거부에 실패했습니다.');
    }
  };

  // ⭐ 채팅 메시지 전송
  const handleSendChatMessage = useCallback((content) => {
    sendWebSocketMessage({
      type: 'chat',
      content: content
    });
  }, [sendWebSocketMessage]);

  // 채팅 토글
  const toggleChat = () => {
    setIsChatOpen(prev => !prev);
    
    if (!isChatOpen) {
      setUnreadCount(0);
    }
  };

  // =========================================================================
  // Effects
  // =========================================================================

  useEffect(() => {
    const fetchAndSetRoom = async () => {
      try {
        const roomData = await api.fetchRoomDetails();
        
        const isCurrentUserHost = roomData.host_username === user.username;
        setIsHost(isCurrentUserHost);
        
        if (!isCurrentUserHost) {
          const status = roomData.participant_status;
          
          if (status === 'rejected') {
            alert('참가 요청이 거부되었습니다.');
            navigate('/video-meetings');
            return;
          }
          
          if (room && room.participant_status !== 'approved' && status === 'approved') {
            console.log('🎉 승인 완료! 미디어 초기화 트리거');
            setMediaReady(false);
          }
        }
      } catch (error) {
        if (error.response?.status === 404) {
          alert('회의실을 찾을 수 없습니다.');
          navigate('/video-meetings');
        }
      }
    };
    
    fetchAndSetRoom();
    fetchRoomDetailsRef.current = fetchAndSetRoom;
    
    return () => {
      console.log('🔄 컴포넌트 언마운트');
      cleanupWebRTC();
    };
  }, []);

  useEffect(() => {
    if (!room || mediaReady || !user) return;
    
    const isApproved = room.participant_status === 'approved' || isHost;
    if (!isApproved) {
      console.log('⏳ 승인 대기 중...');
      return;
    }

    console.log('🚀 WebRTC 초기화');
    
    const initializeMedia = async () => {
      try {
        const stream = await getLocalMedia();
        
        if (!stream) {
          alert('마이크와 카메라 권한이 필요합니다.');
          return;
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        setMediaReady(true);
      } catch (error) {
        console.error('❌ 미디어 초기화 실패:', error);
        alert('카메라/마이크 접근에 실패했습니다.');
      }
    };
    
    initializeMedia();
  }, [room, user, isHost, mediaReady]);

  // =========================================================================
  // Render
  // =========================================================================
  
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-900">
        <Loader className="animate-spin w-10 h-10 text-white" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-900 text-white">
        <p>{error || '회의실을 로드할 수 없습니다.'}</p>
      </div>
    );
  }

  // ⭐ 승인 대기 화면
  if (!isHost && room.participant_status === 'pending') {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-gray-900 text-white">
        <Loader className="animate-spin w-12 h-12 mb-6" />
        <h2 className="text-2xl font-bold mb-2">참가 승인 대기 중...</h2>
        <p className="text-gray-400 mb-2">방장의 승인을 기다리고 있습니다.</p>
        <p className="text-sm text-gray-500">승인되면 자동으로 회의실에 입장합니다.</p>
        <button
          onClick={() => navigate('/video-meetings')}
          className="mt-6 px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition"
        >
          뒤로 가기
        </button>
      </div>
    );
  }

  const allVideos = [
    {
      peerId: user?.username,
      username: `${user?.username} (나)`,
      stream: localStreamRef.current,
      isLocal: true,
      isMuted: !isMicOn,
      isVideoOff: !isVideoOn,
      ref: localVideoRef,
    },
    ...remoteStreams,
  ].filter(v => v.stream || v.isLocal);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col relative">
      
      {/* 헤더 */}
      <RoomHeader
        title={room.title}
        participantCount={allVideos.length}
        connectionStatus={connectionStatus}
        isHost={isHost}
        pendingCount={pendingRequests.length}
        onTogglePendingPanel={() => setShowPendingPanel(!showPendingPanel)}
      />

      {/* 대기 요청 패널 */}
      {isHost && showPendingPanel && (
        <PendingRequestsPanel
          requests={pendingRequests}
          onApprove={handleApprove}
          onReject={handleReject}
          onClose={() => setShowPendingPanel(false)}
        />
      )}

      {/* 비디오 그리드 */}
      <VideoGrid videos={allVideos} />
      
      {/* ⭐ 채팅 패널 */}
      <ChatPanel
        isOpen={isChatOpen}
        messages={chatMessages}
        loading={false}
        currentUser={user}
        onSendMessage={handleSendChatMessage}
        onClose={toggleChat}
      />
      
      {/* 컨트롤 바 */}
      <div className="bg-gray-800 border-t border-gray-700 px-6 py-3 flex justify-center items-center gap-4">
        
        {/* 마이크 */}
        <button
          onClick={toggleMic}
          className={`p-3 rounded-full transition ${
            isMicOn 
              ? 'bg-white text-gray-900 hover:bg-gray-200' 
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {isMicOn ? <span>🎤</span> : <span>🔇</span>}
        </button>
        
        {/* 비디오 */}
        <button
          onClick={toggleVideo}
          className={`p-3 rounded-full transition ${
            isVideoOn 
              ? 'bg-white text-gray-900 hover:bg-gray-200' 
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {isVideoOn ? <span>📹</span> : <span>📴</span>}
        </button>
        
        {/* ⭐ 채팅 토글 */}
        <ChatToggleButton
          onClick={toggleChat}
          unreadCount={unreadCount}
        />
        
        {/* 나가기 */}
        <button
          onClick={handleLeaveClick}
          className="p-3 bg-red-800 text-white rounded-full hover:bg-red-900 transition"
        >
          📞
        </button>
      </div>

      {/* 방장 퇴장 모달 */}
      <HostLeaveModal
        isOpen={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        onLeaveOnly={handleLeaveOnly}
        onEndMeeting={handleEndMeeting}
      />
    </div>
  );
}

export default VideoMeetingRoom;