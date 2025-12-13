// frontend/src/components/VideoMeetingRoom.jsx (완전 개선 버전)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

import '../styles/videoMeeting.css';

// Custom Hooks
import { useWebSocket } from '../hooks/useWebSocket';
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
  const chatMessagesEndRef = useRef(null);

  // Custom Hooks
  const api = useVideoMeetingAPI(id);
  const { room, participants, pendingRequests, loading, error } = api;

  // ⭐⭐⭐ WebSocket 메시지 핸들러
  const handleWebSocketMessage = useCallback((data) => {
    console.log('📨 WebSocket 메시지:', data.type);

    switch (data.type) {
      case 'approval_notification':
        console.log('🎉 승인 완료! 페이지 새로고침...');
        alert('참가가 승인되었습니다!');
        
        if (fetchRoomDetailsRef.current) {
          fetchRoomDetailsRef.current();
        }
        
        setMediaReady(false);
        break;

      case 'rejection_notification':
        alert('참가 요청이 거부되었습니다.');
        navigate('/video-meetings');
        break;

      case 'join_request_notification':
        console.log('📢 새로운 참가 요청:', data.username);
        
        // ⭐ 즉시 대기 목록 새로고침
        api.fetchPendingRequests();
        
        if (!showPendingPanel) {
          setShowPendingPanel(true);
        }
        
        // ⭐ 브라우저 알림
        if (Notification.permission === 'granted') {
          new Notification('새로운 참가 요청', {
            body: `${data.username}님이 참가를 요청했습니다.`,
            icon: '/logo192.png'
          });
        }
        break;

      case 'chat_message':
        console.log('💬 채팅 메시지 수신:', data.sender, data.content);
        
        setChatMessages(prev => [...prev, {
          id: data.message_id,
          sender_id: data.sender_id,
          sender_username: data.sender,
          content: data.content,
          created_at: data.created_at,
          is_mine: data.sender_id === user?.id
        }]);

        if (!isChatOpen && data.sender_id !== user?.id) {
          setUnreadCount(prev => prev + 1);
        }
        break;

      case 'user_joined':
        console.log('👋 사용자 입장:', data.username);
        api.fetchRoomDetails();
        break;

      case 'user_left':
        console.log('👋 사용자 퇴장:', data.username);
        api.fetchRoomDetails();
        break;

      case 'pong':
        console.log('💓 Heartbeat OK');
        break;

      default:
        console.log('⚠️ 처리되지 않은 메시지 타입:', data.type);
    }
  }, [user, navigate, api, showPendingPanel, isChatOpen]);

  // ⭐⭐⭐ WebSocket 연결
  const { sendMessage: sendWebSocketMessage, sendWebRTCSignal } = useWebSocket(
    id, 
    user, 
    handleWebSocketMessage
  );

  // ⭐⭐⭐ WebRTC (WebSocket 시그널링 사용)
  const webrtc = useWebRTC(id, user, isHost, sendWebRTCSignal);
  const { 
    localStreamRef, 
    remoteStreams, 
    connectionStatus,
    getLocalMedia,
    handleWebSocketSignal,
    cleanup: cleanupWebRTC 
  } = webrtc;

  // ⭐ WebRTC 시그널 핸들러 등록
  useEffect(() => {
    // WebSocket에서 받은 WebRTC 시그널을 useWebRTC로 전달
    const originalHandler = handleWebSocketMessage;
    
    const enhancedHandler = (data) => {
      // WebRTC 시그널이면 handleWebSocketSignal로 전달
      if (['offer', 'answer', 'ice_candidate', 'join'].includes(data.type)) {
        handleWebSocketSignal(data);
      } else {
        originalHandler(data);
      }
    };
    
    // 핸들러 교체는 useWebSocket에서 이미 처리됨
    // 여기서는 WebRTC 시그널만 추가로 처리
  }, [handleWebSocketSignal]);

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
      console.log('✅ 승인 완료 - WebSocket으로 즉시 알림 전송됨');
      
      api.fetchPendingRequests();
    } catch (error) {
      alert('참가 승인에 실패했습니다.');
    }
  };

  const handleReject = async (participantId) => {
    try {
      await api.rejectParticipant(participantId);
      console.log('✅ 거부 완료');
      
      api.fetchPendingRequests();
    } catch (error) {
      alert('참가 거부에 실패했습니다.');
    }
  };

  const handleSendChatMessage = useCallback((content) => {
    sendWebSocketMessage({
      type: 'chat',
      content: content
    });
  }, [sendWebSocketMessage]);

  const toggleChat = () => {
    setIsChatOpen(prev => !prev);
    
    if (!isChatOpen) {
      setUnreadCount(0);
    }
  };

  // 채팅 자동 스크롤
  useEffect(() => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  // =========================================================================
  // Effects
  // =========================================================================

  // ⭐ 알림 권한 요청
  useEffect(() => {
    if (isHost && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [isHost]);

  useEffect(() => {
    const fetchAndSetRoom = async () => {
      try {
        const roomData = await api.fetchRoomDetails();
        
        const isCurrentUserHost = roomData.host_username === user.username;
        setIsHost(isCurrentUserHost);
        
        // ⭐ 방장이면 대기 목록 로드
        if (isCurrentUserHost) {
          api.fetchPendingRequests();
        }
        
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
        
        // ⭐ Join 메시지 전송 (참가자만)
        if (!isHost) {
          setTimeout(() => {
            sendWebSocketMessage({
              type: 'join',
              username: user.username
            });
          }, 1000);
        }
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
      
      {/* 채팅 패널 */}
      <ChatPanel
        isOpen={isChatOpen}
        messages={chatMessages}
        loading={false}
        currentUser={user}
        messagesEndRef={chatMessagesEndRef}
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
          title={isMicOn ? '마이크 끄기' : '마이크 켜기'}
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
          title={isVideoOn ? '비디오 끄기' : '비디오 켜기'}
        >
          {isVideoOn ? <span>📹</span> : <span>📴</span>}
        </button>
        
        {/* 채팅 토글 */}
        <ChatToggleButton
          onClick={toggleChat}
          unreadCount={unreadCount}
        />
        
        {/* 나가기 */}
        <button
          onClick={handleLeaveClick}
          className="p-3 bg-red-800 text-white rounded-full hover:bg-red-900 transition"
          title="회의 나가기"
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