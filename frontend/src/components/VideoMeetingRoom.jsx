// frontend/src/components/VideoMeetingRoom.jsx (SFU 전환 완료본)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useVideoMeetingAPI } from '../hooks/useVideoMeetingAPI';
import { useSFU } from '../hooks/useSFU';

// 컴포넌트 임포트
import { RoomHeader } from './VideoMeeting/RoomHeader';
import { PendingRequestsPanel } from './VideoMeeting/PendingRequestsPanel';
import { VideoGrid } from './VideoMeeting/VideoGrid';
import { ControlBar } from './VideoMeeting/ControlBar';
import { ChatPanel, ChatToggleButton } from './VideoMeeting/ChatPanel';
import { ReactionsButton, ReactionsOverlay } from './VideoMeeting/ReactionsPanel';
import { RaiseHandButton, HandRaisedBadge } from './VideoMeeting/RaiseHandButton';
import { IOSPlayButton } from './VideoMeeting/IOSPlayButton';

// 유틸리티 함수들
// SFU Promise 응답 타입 — waitForMessage 큐로 처리 (onmessage에서 dispatchSFUMessage 호출)
const SFU_PROMISE_TYPES = new Set([
  'sfu_rtp_capabilities',
  'sfu_joined',
  'sfu_transport_created',
  'sfu_transport_connected',
  'sfu_produced',
  'sfu_consumed',
  'sfu_consumer_resumed',
  'sfu_error',
]);

// SFU 이벤트 기반 타입 — handleSFUMessage로 처리
const SFU_EVENT_TYPES = new Set([
  'peer_joined',
  'new_producer',
  'track_state',
]);

const isIOS = () => {
  if (navigator.userAgentData) {
    return navigator.userAgentData.platform === 'iOS';
  }
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  if (userAgent.includes('Mac') && 'ontouchend' in document && navigator.maxTouchPoints > 0) return true;
  return false;
};

const isSafari = () => {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  return (
    /Safari/.test(userAgent) &&
    !/Chrome/.test(userAgent) &&
    !/CriOS/.test(userAgent) &&
    !/FxiOS/.test(userAgent) &&
    !/EdgiOS/.test(userAgent)
  );
};

function VideoMeetingRoom() {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // iOS 재생 버튼 상태
  const [showIOSPlayButton, setShowIOSPlayButton] = useState(false);
  const iosPlayTriggeredRef = useRef(false);

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
  } = useVideoMeetingAPI(roomId);

  // WebSocket 상태
  const [wsConnected, setWsConnected] = useState(false);
  const [wsReady, setWsReady] = useState(false);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const wsRef = useRef(null);

  // UI 상태
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [showPendingPanel, setShowPendingPanel] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // 채팅 상태
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const messageIdsRef = useRef(new Set());

  // 반응 및 손들기 상태
  const [reactions, setReactions] = useState([]);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState([]);

  // 미디어 참조
  const localVideoRef = useRef(null);
  const initializationRef = useRef(false);
  const approvalInitializedRef = useRef(false);

  // =========================================================================
  // SFU 훅
  // =========================================================================
  const {
    localStreamRef,
    remoteStreams,
    connectionStatus,
    getLocalMedia,
    initSFU,
    startProducing,
    muteAudio,
    unmuteAudio,
    muteVideo,
    unmuteVideo,
    handleSFUMessage,
    dispatchSFUMessage,   // ← [추가] Promise 큐 투입 함수
    cleanup: cleanupWebRTC,
  } = useSFU({ wsRef, roomId });

  const addChatMessage = useCallback((message) => {
    const messageId = message.message_id || message.id;
    if (!messageId) return;
    if (messageIdsRef.current.has(messageId)) return;
    messageIdsRef.current.add(messageId);

    setChatMessages(prev => {
      if (prev.some(msg => (msg.message_id || msg.id) === messageId)) return prev;
      return [...prev, {
        id: messageId,
        message_id: messageId,
        sender_username: message.sender_username,
        sender_user_id: message.sender_user_id,
        content: message.content,
        created_at: message.created_at || new Date().toISOString(),
        is_mine: message.is_mine || message.sender_username === user?.username
      }];
    });

    if (!showChatPanel && message.sender_username !== user?.username) {
      setUnreadChatCount(prev => prev + 1);
    }

    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [user, showChatPanel]);

  // iOS 재생 버튼 이벤트
  useEffect(() => {
    const handleIOSPlayRequired = (event) => {
      if (!iosPlayTriggeredRef.current) {
        setShowIOSPlayButton(true);
      }
    };

    window.addEventListener('ios-play-required', handleIOSPlayRequired);

    const iosDetected = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (iosDetected && remoteStreams.size > 0) {
      setTimeout(() => {
        const videoElements = document.querySelectorAll('video:not([muted])');
        const hasUnplayedVideo = Array.from(videoElements).some(v => v.paused && v.readyState >= 2);
        if (hasUnplayedVideo && !iosPlayTriggeredRef.current) {
          setShowIOSPlayButton(true);
        }
      }, 1000);
    }

    return () => {
      window.removeEventListener('ios-play-required', handleIOSPlayRequired);
    };
  }, [remoteStreams]);

  // iOS 재생 트리거
  const handleIOSPlay = useCallback(async () => {
    const videoElements = document.querySelectorAll('video');
    let successCount = 0;
    let failCount = 0;

    for (const video of videoElements) {
      if (video.srcObject && !video.muted) {
        try {
          await video.play();
          successCount++;
        } catch (error) {
          failCount++;
        }
      }
    }

    if (successCount > 0) {
      iosPlayTriggeredRef.current = true;
      setShowIOSPlayButton(false);
    } else if (failCount > 0) {
      alert('비디오 재생에 실패했습니다.\n페이지를 새로고침하고 다시 시도해주세요.');
    }
  }, []);

  // =========================================================================
  // WebSocket 메시지 핸들러
  // =========================================================================
  const handleWebSocketMessage = useCallback((data) => {
    const type = data.type;

    console.log('📨 WebSocket 수신:', type);

    // [수정] Promise 대기 중인 SFU 응답 타입 → 큐에 투입
    if (SFU_PROMISE_TYPES.has(type)) {
      dispatchSFUMessage(data);
      return;
    }

    // 이벤트 기반 SFU 메시지 → handleSFUMessage로 위임
    if (SFU_EVENT_TYPES.has(type)) {
      handleSFUMessage(data);
      return;
    }

    switch (type) {
      case 'participants_list':
        console.log('📋 참여자:', data.participants);
        break;

      case 'approval_notification': {
        const retryCount = data.retry_count || 0;

        if (String(data.room_id) !== String(roomId)) return;
        if (String(data.participant_user_id) !== String(user?.id)) return;
        if (retryCount > 0) return;
        if (approvalInitializedRef.current) return;

        approvalInitializedRef.current = true;

        const initializeAfterApproval = async () => {
          try {
            const isiOS = isIOS();

            // 1. 미디어 초기화
            if (!localStreamRef.current) {
              try {
                await getLocalMedia();

                if (localVideoRef.current && localStreamRef.current) {
                  localVideoRef.current.srcObject = localStreamRef.current;
                  if (isiOS) {
                    try { await localVideoRef.current.play(); } catch (e) {}
                  }
                }

                console.log('✅ 미디어 초기화 완료');
                await initSFU();
                await startProducing(localStreamRef.current);
              } catch (mediaError) {
                console.error('❌ 미디어 초기화 실패:', mediaError);
                approvalInitializedRef.current = false;
                throw mediaError;
              }
            }

            const mediaStabilizeTime = isiOS ? 2500 : 1000;
            await new Promise(r => setTimeout(r, mediaStabilizeTime));

            // 2. 방 정보 갱신
            await fetchRoomDetails();

            await new Promise(r => setTimeout(r, 500));

            // 3. WebSocket 확인
            const currentWs = wsRef.current;
            if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
              connectWebSocket();
              await new Promise(r => setTimeout(r, isiOS ? 3000 : 2000));
              const reconnectedWs = wsRef.current;
              if (!reconnectedWs || reconnectedWs.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket 재연결 실패');
              }
            }

            setWsReady(true);

            const wsStabilizeTime = isiOS ? 1500 : 800;
            await new Promise(r => setTimeout(r, wsStabilizeTime));

            // 4. join_ready 전송
            if (!data.host_username) throw new Error('host_username이 없습니다');

            const finalWs = wsRef.current;
            if (finalWs && finalWs.readyState === WebSocket.OPEN) {
              const joinReadyMessage = {
                type: 'join_ready',
                from_username: user.username,
                to_username: data.host_username,
                room_id: String(roomId),
                is_ios: isiOS
              };

              for (let i = 0; i < 5; i++) {
                finalWs.send(JSON.stringify(joinReadyMessage));
                if (i < 4) await new Promise(r => setTimeout(r, isiOS ? 800 : 500));
              }
            } else {
              throw new Error('WebSocket 연결 상태 불안정');
            }

            // 5. join 전송
            finalWs.send(JSON.stringify({ type: 'join', username: user.username }));

          } catch (error) {
            console.error('❌ 승인 후 초기화 실패:', error);
            approvalInitializedRef.current = false;
            if (error.message !== 'WebSocket 연결 상태 불안정') {
              alert('회의 참가 준비 중 오류가 발생했습니다.\n\n페이지를 새로고침하고 다시 시도해주세요.');
            }
          }
        };

        const startDelay = isIOS() ? 1200 : 500;
        setTimeout(initializeAfterApproval, startDelay);
        break;
      }

      // SFU에서는 user_joined/join_ready 대신 peer_joined/new_producer로 처리됨
      // 하지만 하위 호환성을 위해 남겨둠
      case 'user_joined':
        console.log(`👋 user_joined: ${data.username} (SFU에서는 peer_joined로 처리)`);
        break;

      case 'join_ready':
        console.log(`🔥 join_ready: ${data.from_username} (SFU에서는 서버가 처리)`);
        break;

      case 'user_left':
        console.log(`👋 user_left: ${data.username}`);
        break;

      case 'chat_message':
        addChatMessage(data);
        break;

      case 'reaction': {
        const id = Date.now() + Math.random();
        setReactions(prev => [...prev, {
          id,
          emoji: data.reaction,
          username: data.username
        }]);
        setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 3000);
        break;
      }

      case 'hand_raise':
        if (data.action === 'raise') {
          setRaisedHands(prev =>
            prev.some(h => h.username === data.username)
              ? prev
              : [...prev, { username: data.username, user_id: data.user_id, raised_at: new Date().toISOString() }]
          );
        } else {
          setRaisedHands(prev => prev.filter(h => h.username !== data.username));
        }
        break;

      case 'rejection_notification':
        alert('참가가 거부되었습니다.');
        navigate('/video-meetings');
        break;

      case 'join_request_notification':
        fetchPendingRequests();
        break;

      case 'meeting_ended':
        alert(data.message);
        navigate('/video-meetings');
        break;

      default:
        console.log('⚠️ Unknown type:', type);
        break;
    }
  }, [
    user,
    roomId,
    room?.is_host,
    localStreamRef,
    handleSFUMessage,
    dispatchSFUMessage,   // ← [추가]
    addChatMessage,
    fetchRoomDetails,
    fetchPendingRequests,
    navigate,
    getLocalMedia,
    initSFU,
    startProducing,
  ]);

  // =========================================================================
  // WebSocket 연결
  // =========================================================================
  const connectWebSocket = useCallback(() => {
    if (!roomId || !user || roomId === 'undefined') return;

    if (wsRef.current) {
      const currentState = wsRef.current.readyState;
      if (currentState === WebSocket.OPEN || currentState === WebSocket.CONNECTING) return;
      try { wsRef.current.close(1000, 'Reconnecting'); } catch (e) {}
      wsRef.current = null;
    }

    const isHttps = window.location.protocol === 'https:';
    const wsProtocol = isHttps ? 'wss' : 'ws';
    const token = localStorage.getItem('access_token');

    if (!token) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }

    const wsUrl = `${wsProtocol}://${window.location.host}/ws/video-meeting/${roomId}/?token=${token}`;

    try {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      const connectionTimeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          socket.close();
          if (reconnectAttemptsRef.current < 3) {
            reconnectAttemptsRef.current += 1;
            setTimeout(() => connectWebSocket(), 2000);
          }
        }
      }, 10000);

      socket.onopen = () => {
        console.log('✅ WebSocket 연결 성공');
        clearTimeout(connectionTimeout);
        setWsConnected(true);
        reconnectAttemptsRef.current = 0;

        setTimeout(async () => {
          if (socket.readyState === WebSocket.OPEN) {
            try {
              socket.send(JSON.stringify({ type: 'join', username: user.username }));

              setTimeout(async () => {
                setWsReady(true);
                console.log('✅ WebSocket 완전 준비');
                // WebSocket 연결 완료 후 SFU 초기화 (방장만)
                if (room?.is_host && localStreamRef.current) {
                  try {
                    await initSFU();
                    await startProducing(localStreamRef.current);
                    console.log('✅ SFU 초기화 완료 (방장)');
                  } catch (e) {
                    console.error('❌ SFU 초기화 실패:', e);
                  }
                }
              }, 500);
            } catch (e) {}
          }
        }, 500);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (e) {
          console.error('❌ 메시지 처리 오류:', e);
        }
      };

      socket.onerror = (error) => {
        console.error('❌ WebSocket 오류:', error);
        clearTimeout(connectionTimeout);
      };

      socket.onclose = (event) => {
        console.log('🔌 WebSocket 종료 (code:', event.code, ')');
        clearTimeout(connectionTimeout);
        setWsConnected(false);
        setWsReady(false);
        wsRef.current = null;

        if (event.code === 4001) {
          alert('인증이 만료되었습니다.');
          navigate('/login');
          return;
        }

        if (event.code !== 1000 && event.code !== 1001) {
          if (reconnectAttemptsRef.current < 5) {
            reconnectAttemptsRef.current += 1;
            const delay = Math.min(1000 * reconnectAttemptsRef.current, 5000);
            reconnectTimeoutRef.current = setTimeout(() => connectWebSocket(), delay);
          } else {
            alert('서버 연결 실패. 페이지를 새로고침해주세요.');
          }
        }
      };
    } catch (error) {
      console.error('❌ WebSocket 생성 실패:', error);
    }
  }, [roomId, user, navigate, handleWebSocketMessage]);

  // =========================================================================
  // 미디어 초기화
  // =========================================================================
  const initializeMedia = useCallback(async () => {
    if (initializationRef.current) return;

    try {
      initializationRef.current = true;

      if (isIOS() && !isSafari()) {
        const confirmContinue = window.confirm('⚠️ iOS에서는 Safari 사용을 권장합니다.\n\n계속 진행하시겠습니까?');
        if (!confirmContinue) throw new Error('사용자가 취소했습니다');
      }

      const stream = await getLocalMedia();

      if (localVideoRef.current && stream) {
        localVideoRef.current.srcObject = stream;
        if (isIOS()) {
          try { await localVideoRef.current.play(); } catch (e) {}
        }
      }

    } catch (error) {
      console.error('❌ 미디어 초기화 실패:', error);
      if (isIOS()) {
        if (error.name === 'NotAllowedError') alert('📱 iOS 권한 설정이 필요합니다.\n\n설정 > Safari > 카메라/마이크');
        else if (error.name === 'NotReadableError') alert('📱 카메라/마이크 사용 중\n\n다른 앱 종료 후 재시도');
        else if (error.message !== '사용자가 취소했습니다') alert('미디어 초기화 실패');
      } else {
        alert('카메라와 마이크 접근 권한이 필요합니다.');
      }
      if (error.message !== '사용자가 취소했습니다') throw error;
    } finally {
      initializationRef.current = false;
    }
  }, [getLocalMedia]);

  // =========================================================================
  // 마이크/비디오 토글
  // =========================================================================
  const handleToggleMic = useCallback(() => {
    const newState = !isMicOn;
    setIsMicOn(newState);
    if (newState) { unmuteAudio(); } else { muteAudio(); }
  }, [isMicOn, muteAudio, unmuteAudio]);

  const handleToggleVideo = useCallback(() => {
    const newState = !isVideoOn;
    setIsVideoOn(newState);
    if (newState) { unmuteVideo(); } else { muteVideo(); }
  }, [isVideoOn, muteVideo, unmuteVideo]);

  // =========================================================================
  // 회의 나가기
  // =========================================================================
  const handleLeave = async () => {
    if (room.is_host) {
      const confirmEnd = window.confirm('회의를 종료하시겠습니까?\n\n"확인": 모든 참가자 퇴장\n"취소": 나만 나가기');
      try {
        if (confirmEnd) { await endMeeting(); } else { await leaveRoom(); }
        cleanupWebRTC();
        if (wsRef.current) wsRef.current.close(1000, 'User leaving');
        navigate('/video-meetings');
      } catch (error) {
        navigate('/video-meetings');
      }
    } else {
      try {
        await leaveRoom();
        cleanupWebRTC();
        if (wsRef.current) wsRef.current.close(1000, 'User leaving');
        navigate('/video-meetings');
      } catch (error) {
        navigate('/video-meetings');
      }
    }
  };

  // =========================================================================
  // 채팅 전송
  // =========================================================================
  const handleSendChatMessage = async (content) => {
    const currentWs = wsRef.current;
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 연결 없음');
    }
    try {
      currentWs.send(JSON.stringify({ type: 'chat', content }));
    } catch (error) {
      throw error;
    }
  };

  // =========================================================================
  // 반응 전송
  // =========================================================================
  const handleSendReaction = async (emoji) => {
    const currentWs = wsRef.current;
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;
    try {
      currentWs.send(JSON.stringify({ type: 'reaction', reaction_type: emoji }));
    } catch (error) {}
  };

  // =========================================================================
  // 손들기/내리기
  // =========================================================================
  const handleRaiseHand = async () => {
    const currentWs = wsRef.current;
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;
    try {
      currentWs.send(JSON.stringify({ type: 'raise_hand' }));
      setIsHandRaised(true);
    } catch (error) {}
  };

  const handleLowerHand = async () => {
    const currentWs = wsRef.current;
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;
    try {
      currentWs.send(JSON.stringify({ type: 'lower_hand' }));
      setIsHandRaised(false);
    } catch (error) {}
  };

  // =========================================================================
  // 마운트/언마운트
  // =========================================================================
  useEffect(() => {
    if (!roomId || roomId === 'undefined') {
      navigate('/video-meetings');
      return;
    }
    fetchRoomDetails();

    return () => {
      cleanupWebRTC();
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [roomId, navigate, fetchRoomDetails, cleanupWebRTC]);

  // =========================================================================
  // 초기 연결 및 방장 폴링
  // =========================================================================
  useEffect(() => {
    if (!room || !user) return;

    const isApproved = room.participant_status === 'approved' || room.is_host;

    if (isApproved && !wsConnected && !wsRef.current && !localStreamRef.current) {
      const initialize = async () => {
        try {
          await initializeMedia();
          await new Promise(resolve => setTimeout(resolve, 300));
          connectWebSocket();
        } catch (error) {
          console.error('❌ 초기화 실패:', error);
        }
      };
      initialize();
    }

    if (room.is_host && isApproved && wsConnected) {
      fetchPendingRequests();
      const interval = setInterval(fetchPendingRequests, 3000);
      return () => clearInterval(interval);
    }
  }, [
    room?.participant_status,
    room?.is_host,
    user,
    wsConnected,
    localStreamRef,
    initializeMedia,
    connectWebSocket,
    fetchPendingRequests
  ]);

  // =========================================================================
  // 승인 대기 폴링
  // =========================================================================
  useEffect(() => {
    if (!room || !user) return;
    if (!room.is_host && room.participant_status === 'pending') {
      let pollCount = 0;
      const maxPolls = 60;

      const pollInterval = setInterval(async () => {
        pollCount++;
        try {
          const updatedRoom = await fetchRoomDetails();
          if (updatedRoom.participant_status === 'approved') clearInterval(pollInterval);
          if (updatedRoom.participant_status === 'rejected') {
            clearInterval(pollInterval);
            alert('참가가 거부되었습니다.');
            navigate('/video-meetings');
          }
          if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            const retry = window.confirm('승인 대기 시간 초과.\n\n계속 대기하시겠습니까?');
            if (!retry) navigate('/video-meetings');
          }
        } catch (error) {}
      }, 3000);

      return () => clearInterval(pollInterval);
    }
  }, [room?.participant_status, room?.is_host, user, fetchRoomDetails, navigate]);

  // 채팅 패널 열릴 때 읽지 않은 메시지 초기화
  useEffect(() => {
    if (showChatPanel) setUnreadChatCount(0);
  }, [showChatPanel]);

  // =========================================================================
  // 렌더링
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
        <button onClick={() => navigate('/video-meetings')} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  if (!room.is_host && room.participant_status === 'pending') {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-gray-900 text-white p-4">
        <Loader className="animate-spin w-16 h-16 text-blue-500 mb-6" />
        <h2 className="text-2xl font-bold mb-2">참가 승인 대기 중...</h2>
        <p className="text-gray-400 mb-6">방장이 승인하면 자동으로 회의에 참가됩니다.</p>
        <button onClick={() => navigate('/video-meetings')} className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600">
          목록으로 돌아가기
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
      isHandRaised,
    },
    ...[...remoteStreams.entries()].map(([peerId, streamData]) => ({
      peerId,
      username: streamData.username || peerId,
      stream: streamData.stream,
      isLocal: false,
      isMuted: false,
      isVideoOff: false,
      isHandRaised: raisedHands.some(h => h.username === peerId),
    })),
  ].filter(v => v.stream || v.isLocal);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <RoomHeader
        title={room.title}
        participantCount={allVideos.length}
        connectionStatus={connectionStatus}
        isHost={room.is_host}
        pendingCount={pendingRequests.length}
        onTogglePendingPanel={() => setShowPendingPanel(!showPendingPanel)}
      />

      {room.is_host && showPendingPanel && (
        <PendingRequestsPanel
          requests={pendingRequests}
          onApprove={approveParticipant}
          onReject={rejectParticipant}
          onClose={() => setShowPendingPanel(false)}
        />
      )}

      <VideoGrid videos={allVideos} HandRaisedBadge={HandRaisedBadge} />

      <IOSPlayButton show={showIOSPlayButton} onPlay={handleIOSPlay} />

      <div className="bg-gray-800 border-t border-gray-700 px-3 md:px-6 py-2 md:py-3 flex justify-center items-center gap-2 md:gap-4">
        <ControlBar
          isMicOn={isMicOn}
          isVideoOn={isVideoOn}
          onToggleMic={handleToggleMic}
          onToggleVideo={handleToggleVideo}
          onLeave={handleLeave}
        />

        <div className="h-6 md:h-8 w-px bg-gray-600 mx-1 md:mx-2" />

        <ChatToggleButton
          onClick={() => setShowChatPanel(!showChatPanel)}
          unreadCount={unreadChatCount}
        />

        <ReactionsButton onSendReaction={handleSendReaction} />

        <RaiseHandButton
          isHandRaised={isHandRaised}
          onRaise={handleRaiseHand}
          onLower={handleLowerHand}
        />
      </div>

      <ChatPanel
        isOpen={showChatPanel}
        messages={chatMessages}
        loading={chatLoading}
        currentUser={user}
        messagesEndRef={messagesEndRef}
        onSendMessage={handleSendChatMessage}
        onClose={() => setShowChatPanel(false)}
      />

      <ReactionsOverlay reactions={reactions} />
    </div>
  );
}

export default VideoMeetingRoom;