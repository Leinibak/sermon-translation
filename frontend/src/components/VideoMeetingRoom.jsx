// frontend/src/components/VideoMeetingRoom.jsx (완전 개선 버전)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useVideoMeetingAPI } from '../hooks/useVideoMeetingAPI';
import { useWebRTC } from '../hooks/useWebRTC';

// 컴포넌트 임포트
import { RoomHeader } from './VideoMeeting/RoomHeader';
import { PendingRequestsPanel } from './VideoMeeting/PendingRequestsPanel';
import { VideoGrid } from './VideoMeeting/VideoGrid';
import { ControlBar } from './VideoMeeting/ControlBar';
import { ChatPanel, ChatToggleButton } from './VideoMeeting/ChatPanel';
import { ReactionsButton, ReactionsOverlay } from './VideoMeeting/ReactionsPanel';
import { RaiseHandButton, HandRaisedBadge } from './VideoMeeting/RaiseHandButton';

function VideoMeetingRoom() {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // =========================================================================
  // API Hook
  // =========================================================================
  const {
    room,
    participants,
    pendingRequests,
    loading: roomLoading,
    error: roomError,
    fetchRoomDetails,
    fetchPendingRequests,
    approveParticipant,
    rejectParticipant,
    leaveRoom,
    endMeeting,
    fetchChatMessages,
  } = useVideoMeetingAPI(roomId);

  // =========================================================================
  // WebSocket State
  // =========================================================================
  const [ws, setWs] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const connectionReadyRef = useRef(false);

  // =========================================================================
  // UI States
  // =========================================================================
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [showPendingPanel, setShowPendingPanel] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  
  // 채팅
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // 반응
  const [reactions, setReactions] = useState([]);
  
  // 손들기
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState([]);

  const localVideoRef = useRef(null);

  // =========================================================================
  // WebRTC Signal 전송 함수
  // =========================================================================
  const sendWebRTCSignal = useCallback((toPeerId, type, payload = {}) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket 연결 없음');
      return;
    }

    const message = {
      type,
      to_user_id: toPeerId,
      from_user_id: user?.username,
      ...payload
    };

    console.log(`📤 WebSocket 시그널 전송: ${type} → ${toPeerId}`);
    ws.send(JSON.stringify(message));
  }, [ws, user]);

  // =========================================================================
  // WebRTC Hook
  // =========================================================================
  const {
    localStreamRef,
    remoteStreams,
    connectionStatus,
    getLocalMedia,
    handleWebSocketSignal,
    cleanup: cleanupWebRTC,
  } = useWebRTC(roomId, user, room?.is_host, sendWebRTCSignal);

  // =========================================================================
  // WebSocket Connection
  // =========================================================================
  const connectWebSocket = useCallback(() => {
    if (!roomId || !user || roomId === 'undefined') {
      console.error('❌ roomId 또는 user 없음');
      return;
    }

    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
      console.log('⚠️ 이미 연결 중');
      return;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('🔌 WebSocket 연결 시작');
    console.log(`   Room: ${roomId}`);
    console.log(`   User: ${user.username}`);
    console.log(`${'='.repeat(60)}\n`);

    const isHttps = window.location.protocol === 'https:';
    const wsProtocol = isHttps ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${window.location.host}/ws/video-meeting/${roomId}/`;

    try {
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log('✅ WebSocket 연결 성공');
        setWsConnected(true);
        reconnectAttemptsRef.current = 0;
        connectionReadyRef.current = true;

        // ⭐ Join 메시지 전송 (500ms 대기)
        setTimeout(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              type: 'join',
              username: user.username
            }));
            console.log('📤 Join 메시지 전송 완료');
          }
        }, 500);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 WebSocket 메시지:', data.type);

          // ⭐ WebRTC 시그널 처리
          if (['offer', 'answer', 'ice_candidate', 'user_joined'].includes(data.type)) {
            handleWebSocketSignal(data);
          }
          // 채팅 메시지
          else if (data.type === 'chat_message') {
            console.log('💬 채팅 수신:', data.content);
            setChatMessages(prev => {
              // 중복 방지
              if (prev.some(msg => msg.message_id === data.message_id)) {
                return prev;
              }
              return [...prev, data];
            });
            
            // 스크롤 하단 이동
            setTimeout(() => {
              if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
              }
            }, 100);
          }
          // 반응
          else if (data.type === 'reaction') {
            const reactionId = Date.now() + Math.random();
            setReactions(prev => [...prev, {
              id: reactionId,
              emoji: data.reaction,
              username: data.username
            }]);
            setTimeout(() => {
              setReactions(prev => prev.filter(r => r.id !== reactionId));
            }, 3000);
          }
          // 손들기
          else if (data.type === 'hand_raise') {
            if (data.action === 'raise') {
              setRaisedHands(prev => {
                if (!prev.find(h => h.username === data.username)) {
                  return [...prev, {
                    username: data.username,
                    raised_at: data.timestamp
                  }];
                }
                return prev;
              });
            } else {
              setRaisedHands(prev => prev.filter(h => h.username !== data.username));
            }
          }
          // ⭐ 승인 알림
          else if (data.type === 'approval_notification') {
            console.log('🎉 참가 승인됨!');
            // 회의실 정보 새로고침
            setTimeout(() => {
              fetchRoomDetails();
            }, 500);
          }
          // 거부 알림
          else if (data.type === 'rejection_notification') {
            alert('참가가 거부되었습니다.');
            navigate('/video-meetings');
          }
          // 참가 요청 알림 (방장)
          else if (data.type === 'join_request_notification') {
            console.log('📢 새 참가 요청:', data.username);
            fetchPendingRequests();
          }
          // 회의 종료 알림
          else if (data.type === 'meeting_ended') {
            alert(data.message);
            navigate('/video-meetings');
          }
        } catch (e) {
          console.error('❌ 메시지 처리 오류:', e);
        }
      };

      socket.onerror = (error) => {
        console.error('❌ WebSocket 오류:', error);
      };

      socket.onclose = () => {
        console.log('🔌 WebSocket 연결 종료');
        setWsConnected(false);
        connectionReadyRef.current = false;

        // 재연결 시도
        if (reconnectAttemptsRef.current < 5) {
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
          console.log(`🔄 재연결 시도 ${reconnectAttemptsRef.current}/5 (${delay}ms 후)`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, delay);
        }
      };

      setWs(socket);
    } catch (error) {
      console.error('❌ WebSocket 생성 실패:', error);
    }
  }, [roomId, user, handleWebSocketSignal, navigate, fetchRoomDetails, fetchPendingRequests]);

  // =========================================================================
  // Media Initialization
  // =========================================================================
  const initializeMedia = useCallback(async () => {
    try {
      console.log('🎥 미디어 초기화 시작');
      const stream = await getLocalMedia();
      
      if (localVideoRef.current && stream) {
        localVideoRef.current.srcObject = stream;
        console.log('✅ 로컬 비디오 설정 완료');
      }
    } catch (error) {
      console.error('❌ 미디어 초기화 실패:', error);
      alert('카메라와 마이크 접근 권한이 필요합니다.');
    }
  }, [getLocalMedia]);

  // =========================================================================
  // Effects
  // =========================================================================

  // 1. 초기 로딩
  useEffect(() => {
    if (!roomId || roomId === 'undefined') {
      console.error('❌ 유효하지 않은 roomId');
      navigate('/video-meetings');
      return;
    }

    console.log('🚀 VideoMeetingRoom 마운트:', roomId);
    fetchRoomDetails();

    return () => {
      console.log('🔄 VideoMeetingRoom 언마운트');
      cleanupWebRTC();
      if (ws) ws.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [roomId, navigate, fetchRoomDetails, cleanupWebRTC]);

  // 2. 승인 후 초기화
  useEffect(() => {
    if (!room || !user) return;

    const isApproved = room.participant_status === 'approved' || room.is_host;
    
    if (isApproved && !wsConnected) {
      console.log('✅ 승인됨 - 초기화 시작');
      
      // 순차적 초기화
      const initialize = async () => {
        // 1. 미디어 먼저
        await initializeMedia();
        
        // 2. WebSocket 연결 (500ms 대기)
        setTimeout(() => {
          connectWebSocket();
        }, 500);
      };
      
      initialize();
    }

    // 방장: 대기 요청 폴링
    if (room.is_host) {
      const interval = setInterval(fetchPendingRequests, 3000);
      return () => clearInterval(interval);
    }
  }, [room, user, wsConnected, connectWebSocket, initializeMedia, fetchPendingRequests]);

  // 3. 채팅 메시지 로드
  useEffect(() => {
    if (showChatPanel && chatMessages.length === 0 && !chatLoading) {
      setChatLoading(true);
      fetchChatMessages().then(messages => {
        setChatMessages(messages);
        setChatLoading(false);
      }).catch(err => {
        console.error('채팅 로드 실패:', err);
        setChatLoading(false);
      });
    }
  }, [showChatPanel, chatMessages.length, chatLoading, fetchChatMessages]);

  // =========================================================================
  // Handlers
  // =========================================================================

  const handleToggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isMicOn;
        setIsMicOn(!isMicOn);
      }
    }
  };

  const handleToggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoOn;
        setIsVideoOn(!isVideoOn);
      }
    }
  };

  const handleLeave = async () => {
    if (room.is_host) {
      const confirmEnd = window.confirm(
        '회의를 종료하시겠습니까?\n\n"예"를 선택하면 모든 참가자가 자동으로 퇴장됩니다.\n"아니오"를 선택하면 나만 나갑니다.'
      );

      try {
        if (confirmEnd) {
          console.log('🛑 회의 종료 요청');
          await endMeeting();
        } else {
          console.log('👋 방장 나가기');
          await leaveRoom();
        }
        
        cleanupWebRTC();
        if (ws) ws.close();
        navigate('/video-meetings');
      } catch (error) {
        console.error('❌ 나가기 실패:', error);
        navigate('/video-meetings');
      }
    } else {
      try {
        await leaveRoom();
        cleanupWebRTC();
        if (ws) ws.close();
        navigate('/video-meetings');
      } catch (error) {
        console.error('❌ 나가기 실패:', error);
        navigate('/video-meetings');
      }
    }
  };

  const handleSendChatMessage = async (content) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket 연결 없음');
      throw new Error('WebSocket 연결 없음');
    }

    try {
      // ⭐ WebSocket으로 직접 전송
      ws.send(JSON.stringify({
        type: 'chat',
        content: content
      }));
      
      console.log('💬 채팅 전송:', content);
    } catch (error) {
      console.error('❌ 채팅 전송 실패:', error);
      throw error;
    }
  };

  const handleSendReaction = async (emoji) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket 연결 없음');
      return;
    }

    try {
      ws.send(JSON.stringify({
        type: 'reaction',
        reaction_type: emoji
      }));
    } catch (error) {
      console.error('❌ 반응 전송 실패:', error);
    }
  };

  const handleRaiseHand = async () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket 연결 없음');
      return;
    }

    try {
      ws.send(JSON.stringify({
        type: 'raise_hand'
      }));
      setIsHandRaised(true);
    } catch (error) {
      console.error('❌ 손들기 실패:', error);
    }
  };

  const handleLowerHand = async () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket 연결 없음');
      return;
    }

    try {
      ws.send(JSON.stringify({
        type: 'lower_hand'
      }));
      setIsHandRaised(false);
    } catch (error) {
      console.error('❌ 손내리기 실패:', error);
    }
  };

  // =========================================================================
  // Render
  // =========================================================================

  if (roomLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-900">
        <Loader className="animate-spin w-10 h-10 text-white" />
      </div>
    );
  }

  if (roomError || !room) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-gray-900 text-white p-4">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">오류 발생</h2>
        <p className="text-gray-400 mb-6">{roomError || '회의실을 로드할 수 없습니다.'}</p>
        <button
          onClick={() => navigate('/video-meetings')}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  // 승인 대기 화면
  if (!room.is_host && room.participant_status === 'pending') {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-gray-900 text-white p-4">
        <Loader className="animate-spin w-16 h-16 text-blue-500 mb-6" />
        <h2 className="text-2xl font-bold mb-2">참가 승인 대기 중...</h2>
        <p className="text-gray-400 mb-6">방장이 승인하면 회의에 참가할 수 있습니다.</p>
        <button
          onClick={() => navigate('/video-meetings')}
          className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
        >
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  // 비디오 목록 생성
  const allVideos = [
    {
      peerId: user?.username,
      username: `${user?.username} (나)`,
      stream: localStreamRef.current,
      isLocal: true,
      isMuted: !isMicOn,
      isVideoOff: !isVideoOn,
      ref: localVideoRef,
      isHandRaised,
    },
    ...remoteStreams.map(stream => ({
      ...stream,
      isHandRaised: raisedHands.some(h => h.username === stream.username)
    })),
  ].filter(v => v.stream || v.isLocal);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      
      {/* 헤더 */}
      <RoomHeader
        title={room.title}
        participantCount={allVideos.length}
        connectionStatus={connectionStatus}
        isHost={room.is_host}
        pendingCount={pendingRequests.length}
        onTogglePendingPanel={() => setShowPendingPanel(!showPendingPanel)}
      />

      {/* 대기 요청 패널 */}
      {room.is_host && showPendingPanel && (
        <PendingRequestsPanel
          requests={pendingRequests}
          onApprove={approveParticipant}
          onReject={rejectParticipant}
          onClose={() => setShowPendingPanel(false)}
        />
      )}

      {/* 비디오 그리드 */}
      <VideoGrid 
        videos={allVideos}
        HandRaisedBadge={HandRaisedBadge}
      />

      {/* 컨트롤 바 */}
      <div className="bg-gray-800 border-t border-gray-700 px-6 py-3 flex justify-center items-center gap-4">
        <ControlBar
          isMicOn={isMicOn}
          isVideoOn={isVideoOn}
          onToggleMic={handleToggleMic}
          onToggleVideo={handleToggleVideo}
          onLeave={handleLeave}
        />

        <div className="h-8 w-px bg-gray-600 mx-2" />

        <ChatToggleButton 
          onClick={() => setShowChatPanel(!showChatPanel)}
        />

        <ReactionsButton onSendReaction={handleSendReaction} />

        <RaiseHandButton
          isHandRaised={isHandRaised}
          onRaise={handleRaiseHand}
          onLower={handleLowerHand}
        />
      </div>

      {/* 채팅 패널 */}
      <ChatPanel
        isOpen={showChatPanel}
        messages={chatMessages}
        loading={chatLoading}
        currentUser={user}
        messagesEndRef={messagesEndRef}
        onSendMessage={handleSendChatMessage}
        onClose={() => setShowChatPanel(false)}
      />

      {/* 반응 오버레이 */}
      <ReactionsOverlay reactions={reactions} />
    </div>
  );
}

export default VideoMeetingRoom;