// frontend/src/components/VideoMeetingRoom.jsx (최종 통합 버전)
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

import '../styles/videoMeeting.css';
// Custom Hooks
import { useWebRTC } from '../hooks/useWebRTC';
import { useVideoMeetingAPI } from '../hooks/useVideoMeetingAPI';
import { useScreenShare } from '../hooks/useScreenShare';
import { useChat } from '../hooks/useChat';
import { useReactions } from '../hooks/useReactions';
import { useRaiseHand } from '../hooks/useRaiseHand';

// UI Components
import { RoomHeader } from './VideoMeeting/RoomHeader';
import { PendingRequestsPanel } from './VideoMeeting/PendingRequestsPanel';
import { VideoGrid } from './VideoMeeting/VideoGrid';
import { ControlBar } from './VideoMeeting/ControlBar';
import { HostLeaveModal } from './VideoMeeting/HostLeaveModal';

// 새로 추가된 컴포넌트들
import { ScreenShareButton } from './VideoMeeting/ScreenShareButton';
import { ChatPanel, ChatToggleButton } from './VideoMeeting/ChatPanel';
import { ReactionsButton, ReactionsOverlay } from './VideoMeeting/ReactionsPanel';
import { RaiseHandButton, RaisedHandsPanel, HandRaisedBadge } from './VideoMeeting/RaiseHandButton';

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
  const [showRaisedHandsPanel, setShowRaisedHandsPanel] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);

  // Refs
  const localVideoRef = useRef(null);
  const signalPollingIntervalRef = useRef(null);
  const pendingPollingIntervalRef = useRef(null);
  const fetchRoomDetailsRef = useRef(null);

  // Custom Hooks
  const api = useVideoMeetingAPI(id);
  const webrtc = useWebRTC(id, user, isHost);
  
  // ⭐⭐⭐ 새로 추가된 기능 Hooks
  const screenShare = useScreenShare(id, webrtc.localStreamRef, webrtc.peerConnections);
  const chat = useChat(id, user);
  const reactions = useReactions(id);
  const raiseHand = useRaiseHand(id, user);

  const { room, participants, pendingRequests, loading, error } = api;
  const { 
    localStreamRef, 
    remoteStreams, 
    connectionStatus,
    getLocalMedia,
    sendSignal,
    handleSignal,
    cleanup 
  } = webrtc;

  // =========================================================================
  // WebSocket 메시지 핸들러
  // =========================================================================

  useEffect(() => {
    // WebSocket 연결 (실제로는 pollSignals를 통해 처리)
    // 실시간 알림을 위해서는 WebSocket Consumer를 직접 연결해야 함
    // 여기서는 폴링을 통해 간접적으로 처리
    
    return () => {
      console.log('🔄 WebSocket 정리');
    };
  }, [id]);

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
    
    cleanup();
    screenShare.cleanup();
    
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
    
    cleanup();
    screenShare.cleanup();
    
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
        console.log(`🎤 마이크 ${!isMicOn ? 'ON' : 'OFF'}`);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoOn;
        setIsVideoOn(!isVideoOn);
        console.log(`📹 비디오 ${!isVideoOn ? 'ON' : 'OFF'}`);
      }
    }
  };

  const handleApprove = async (participantId) => {
    try {
      await api.approveParticipant(participantId);
      console.log('✅ 승인 완료');
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

  // =========================================================================
  // Signal Polling
  // =========================================================================

  const pollSignals = async () => {
    const signals = await api.pollSignals();
    
    if (signals === null) {
      clearInterval(signalPollingIntervalRef.current);
      return;
    }
    
    if (signals && signals.length > 0) {
      for (const signal of signals) {
        await handleSignal(signal, fetchRoomDetailsRef.current);
        
        // ⭐ 새로 추가: 시그널 타입별 처리
        if (signal.message_type === 'screen_share_start') {
          screenShare.handleScreenShareNotification('start', signal.sender_username);
        } else if (signal.message_type === 'screen_share_stop') {
          screenShare.handleScreenShareNotification('stop', signal.sender_username);
        }
      }
    }
  };

  const pollPendingRequests = async () => {
    if (!isHost) return;
    
    const pending = await api.fetchPendingRequests();
    
    if (pending.length > 0) {
      if (!showPendingPanel) {
        console.log(`📢 ${pending.length}개 대기 요청 - 패널 자동 표시`);
        setShowPendingPanel(true);
      }
    } else if (pending.length === 0 && showPendingPanel) {
      console.log('✅ 모든 요청 처리 완료 - 패널 닫기');
      setShowPendingPanel(false);
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
      cleanup();
      screenShare.cleanup();
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
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        signalPollingIntervalRef.current = setInterval(pollSignals, 1000);
        
        if (isHost) {
          pollPendingRequests();
          pendingPollingIntervalRef.current = setInterval(pollPendingRequests, 1000);
        } else {
          if (room.host_username && room.participant_status === 'approved') {
            const sendJoinReady = async () => {
              try {
                await sendSignal(room.host_username, 'join_ready', {
                  username: user.username,
                  timestamp: Date.now()
                });
              } catch (e) {
                console.error('❌ Join Ready 전송 실패:', e);
              }
            };
            
            setTimeout(sendJoinReady, 1000);
            setTimeout(sendJoinReady, 3000);
            setTimeout(sendJoinReady, 5000);
          }
        }
      } catch (error) {
        console.error('❌ 미디어 초기화 실패:', error);
        alert('카메라/마이크 접근에 실패했습니다.');
      }
    };
    
    initializeMedia();
    
    return () => {
      if (signalPollingIntervalRef.current) {
        clearInterval(signalPollingIntervalRef.current);
      }
      if (pendingPollingIntervalRef.current) {
        clearInterval(pendingPollingIntervalRef.current);
      }
    };
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

  if (!isHost && room.participant_status === 'pending') {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-gray-900 text-white">
        <Loader className="animate-spin w-12 h-12 mb-6" />
        <h2 className="text-2xl font-bold mb-2">참가 승인 대기 중...</h2>
        <p className="text-gray-400">방장의 승인을 기다리고 있습니다.</p>
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
      isHandRaised: raiseHand.isHandRaised, // ⭐ 추가
    },
    ...remoteStreams.map(rs => ({
      ...rs,
      isHandRaised: raiseHand.raisedHands.some(h => h.username === rs.username) // ⭐ 추가
    })),
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
        screenSharingUser={screenShare.screenSharingUser || room.screen_sharing_username} // ⭐ 추가
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
      <VideoGrid 
        videos={allVideos}
        HandRaisedBadge={HandRaisedBadge} // ⭐ 추가
      />
      
      {/* ⭐⭐⭐ 반응 오버레이 */}
      <ReactionsOverlay reactions={reactions.activeReactions} />
      
      {/* ⭐⭐⭐ 채팅 패널 */}
      <ChatPanel
        isOpen={chat.isChatOpen}
        messages={chat.messages}
        loading={chat.loading}
        currentUser={user}
        messagesEndRef={chat.messagesEndRef}
        onSendMessage={chat.sendMessage}
        onClose={chat.toggleChat}
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
        
        {/* ⭐⭐⭐ 화면 공유 */}
        <ScreenShareButton
          isScreenSharing={screenShare.isScreenSharing}
          onStart={screenShare.startScreenShare}
          onStop={screenShare.stopScreenShare}
          disabled={!!screenShare.screenSharingUser && !screenShare.isScreenSharing}
        />
        
        {/* ⭐⭐⭐ 채팅 */}
        <ChatToggleButton
          onClick={chat.toggleChat}
          unreadCount={chat.unreadCount}
        />
        
        {/* ⭐⭐⭐ 반응 */}
        <ReactionsButton
          onSendReaction={reactions.sendReaction}
        />
        
        {/* ⭐⭐⭐ 손들기 */}
        <div className="relative">
          <RaiseHandButton
            isHandRaised={raiseHand.isHandRaised}
            onRaise={raiseHand.raiseHand}
            onLower={raiseHand.lowerHand}
          />
          
          {/* 방장용: 손든 사용자 목록 */}
          {isHost && raiseHand.raisedHands.length > 0 && (
            <button
              onClick={() => setShowRaisedHandsPanel(!showRaisedHandsPanel)}
              className="absolute -top-2 -right-2 bg-yellow-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center"
            >
              {raiseHand.raisedHands.length}
            </button>
          )}
          
          <RaisedHandsPanel
            raisedHands={raiseHand.raisedHands}
            isOpen={showRaisedHandsPanel}
            onClose={() => setShowRaisedHandsPanel(false)}
          />
        </div>
        
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