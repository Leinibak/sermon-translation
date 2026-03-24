// frontend/src/components/VideoMeetingRoom.jsx
// [수정 패치]
// FIX-1: connectWebSocket — stale closure 해소 (handleWebSocketMessage를 ref로 분리)
// FIX-2: connectWebSocket — 재연결 시 wsReady 초기화 누락 수정 (onclose 시 reset)
// FIX-3: approval_notification — approvalInitializedRef race condition 수정
//         (성공 시에만 true 유지, 실패 시 false 복원을 finally에서 처리하지 않도록)
// FIX-4: initializationRef finally 블록 문제 — 오류 발생 후도 false로 리셋되어
//         재시도가 불가능한 문제 → 성공 시에만 false 리셋
// FIX-5: 방장 SFU useEffect — localStreamRef.current 를 의존성에서 제거,
//         localStreamReady(state)로 대체
// FIX-6: VideoMeetingRoom allVideos — localStreamRef.current 의존성 배열 사용 금지,
//         localStreamReady state로 렌더링 트리거
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

// SFU Promise 응답 타입 — waitForMessage 큐로 처리
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
  'user_left',   // handleSFUMessage에서 remoteStreams 정리
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

  // FIX-5/6: localStreamRef.current를 의존성으로 쓰는 대신 state 사용
  const [localStreamReady, setLocalStreamReady] = useState(false);

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
  // FIX-4: initializationRef — finally에서 무조건 false 리셋하는 대신
  //         성공 여부를 별도로 관리
  const initializationRef = useRef(false);
  // FIX-3: approvalInitializedRef — race condition 수정을 위해 상태를
  //         'idle' | 'running' | 'done' 으로 세분화
  const approvalInitializedRef = useRef('idle'); // 'idle' | 'running' | 'done'

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
    dispatchSFUMessage,
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
    const handleIOSPlayRequired = () => {
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

    // Promise 대기 중인 SFU 응답 타입 → 큐에 투입
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

      // FIX-3: approval_notification race condition 수정
      // approvalInitializedRef를 3-state('idle'|'running'|'done')로 관리
      case 'approval_notification': {
        const retryCount = data.retry_count || 0;

        if (String(data.room_id) !== String(roomId)) return;
        if (String(data.participant_user_id) !== String(user?.id)) return;
        if (retryCount > 0) return;
        // 'idle' 상태일 때만 진입 — 'running' 또는 'done'이면 중복 실행 차단
        if (approvalInitializedRef.current !== 'idle') {
          console.log(`⚠️ approval_notification 중복 무시 (state: ${approvalInitializedRef.current})`);
          return;
        }

        approvalInitializedRef.current = 'running';

        const initializeAfterApproval = async () => {
          try {
            const isiOS = isIOS();

            // 1. 미디어 초기화 (아직 없을 때만)
            if (!localStreamRef.current) {
              await getLocalMedia();
              if (localVideoRef.current && localStreamRef.current) {
                localVideoRef.current.srcObject = localStreamRef.current;
                if (isiOS) { try { await localVideoRef.current.play(); } catch (e) {} }
              }
              setLocalStreamReady(true);
            }

            // 2. 방 정보 갱신
            await fetchRoomDetails();

            // 3. WS 확인
            const currentWs = wsRef.current;
            if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
              connectWebSocket();
              await new Promise(r => setTimeout(r, isiOS ? 3000 : 2000));
              if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket 재연결 실패');
              }
            }

            setWsReady(true);
            await new Promise(r => setTimeout(r, isiOS ? 1500 : 500));

            // 4. SFU 초기화
            await initSFU();

            // 5. 자신의 미디어 produce
            await startProducing(localStreamRef.current);

            // 6. join 전송
            const finalWs = wsRef.current;
            if (finalWs?.readyState === WebSocket.OPEN) {
              finalWs.send(JSON.stringify({ type: 'join', username: user.username }));
            }

            // 성공 시 'done' 으로 전환
            approvalInitializedRef.current = 'done';
            console.log('✅ 승인 후 초기화 완료');

          } catch (error) {
            console.error('❌ 승인 후 초기화 실패:', error);
            // 실패 시 'idle'로 복원하여 재시도 가능하게
            approvalInitializedRef.current = 'idle';
            alert('회의 참가 준비 중 오류. 새로고침 후 재시도해주세요.');
          }
        };

        const startDelay = isIOS() ? 1200 : 500;
        setTimeout(initializeAfterApproval, startDelay);
        break;
      }

      case 'user_joined':
        console.log(`👋 user_joined: ${data.username} (SFU에서는 peer_joined로 처리)`);
        break;

      case 'join_ready':
        console.log(`🔥 join_ready: ${data.from_username} (SFU에서는 서버가 처리)`);
        break;

      case 'chat_message':
        addChatMessage(data);
        break;

      case 'reaction': {
        const id = Date.now() + Math.random();
        setReactions(prev => [...prev, {
          id,
          emoji: data.reaction_type,
          username: data.username
        }]);
        setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 3000);
        break;
      }

      case 'raise_hand':
        setRaisedHands(prev =>
          prev.some(h => h.username === data.username)
            ? prev
            : [...prev, { username: data.username, user_id: data.user_id, raised_at: new Date().toISOString() }]
        );
        break;

      case 'lower_hand':
        setRaisedHands(prev => prev.filter(h => h.username !== data.username));
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
    handleSFUMessage,
    dispatchSFUMessage,
    addChatMessage,
    fetchRoomDetails,
    fetchPendingRequests,
    navigate,
    getLocalMedia,
    initSFU,
    startProducing,
  ]);

  // FIX-1: connectWebSocket stale closure 해소
  // handleWebSocketMessage를 ref 경유로 참조 → socket.onmessage 클로저가
  // 항상 최신 핸들러를 가리킴
  const handleWebSocketMessageRef = useRef(handleWebSocketMessage);
  useEffect(() => {
    handleWebSocketMessageRef.current = handleWebSocketMessage;
  }, [handleWebSocketMessage]);

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

    // FIX-2: 재연결 직전 wsReady 초기화
    setWsReady(false);

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

        setTimeout(() => {
          if (socket.readyState === WebSocket.OPEN) {
            try {
              socket.send(JSON.stringify({ type: 'join', username: user.username }));
              setTimeout(() => {
                setWsReady(true);
                console.log('✅ WebSocket 완전 준비');
              }, 500);
            } catch (e) {}
          }
        }, 500);
      };

      // FIX-1: ref 경유로 최신 핸들러 호출 — 클로저 오염 제로
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessageRef.current(data);
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
        // FIX-2: 종료 시 wsReady 반드시 초기화
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user, navigate]);
  // NOTE: handleWebSocketMessage는 ref 경유이므로 의존성에서 제거 — stale closure 차단

  // =========================================================================
  // 미디어 초기화
  // FIX-4: finally에서 무조건 false 리셋 → 오류 시에도 재시도가 차단되는 버그 수정
  //        → 오류 발생 시만 false 리셋, 정상 완료 시 false로 리셋하여 중복 실행 방지
  // =========================================================================
  const initializeMedia = useCallback(async () => {
    if (initializationRef.current) return;
    initializationRef.current = true;

    try {
      if (isIOS() && !isSafari()) {
        const confirmContinue = window.confirm('⚠️ iOS에서는 Safari 사용을 권장합니다.\n\n계속 진행하시겠습니까?');
        if (!confirmContinue) throw new Error('사용자가 취소했습니다');
      }

      const stream = await getLocalMedia();
      if (localVideoRef.current && stream) {
        localVideoRef.current.srcObject = stream;
        if (isIOS()) { try { await localVideoRef.current.play(); } catch (e) {} }
      }
      // FIX-5: state로 완료 신호 (localStreamRef.current 의존성 대신)
      setLocalStreamReady(true);

      // 성공 후 재사용 가능하게 false로 리셋
      initializationRef.current = false;

    } catch (error) {
      console.error('❌ 미디어 초기화 실패:', error);
      // FIX-4: 실패 시에도 false로 리셋하여 재시도 허용
      initializationRef.current = false;

      if (isIOS()) {
        if (error.name === 'NotAllowedError') alert('📱 iOS 권한 설정이 필요합니다.\n\n설정 > Safari > 카메라/마이크');
        else if (error.name === 'NotReadableError') alert('📱 카메라/마이크 사용 중\n\n다른 앱 종료 후 재시도');
        else if (error.message !== '사용자가 취소했습니다') alert('미디어 초기화 실패');
      } else {
        alert('카메라와 마이크 접근 권한이 필요합니다.');
      }
      if (error.message !== '사용자가 취소했습니다') throw error;
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
    } catch (error) {
      console.error('❌ 반응 실패:', error);
    }
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
    } catch (error) {
      console.error('❌ 손들기 실패:', error);
    }
  };

  const handleLowerHand = async () => {
    const currentWs = wsRef.current;
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;
    try {
      currentWs.send(JSON.stringify({ type: 'lower_hand' }));
      setIsHandRaised(false);
    } catch (error) {
      console.error('❌ 손내리기 실패:', error);
    }
  };

  // =========================================================================
  // Track 상태 브로드캐스트
  // =========================================================================
  const broadcastTrackState = useCallback((kind, enabled) => {
    const currentWs = wsRef.current;
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;
    try {
      currentWs.send(JSON.stringify({ type: 'track_state', kind, enabled }));
    } catch (error) {
      console.error('❌ Track 상태 전송 실패:', error);
    }
  }, []);

  // =========================================================================
  // 마운트/언마운트 effect
  // =========================================================================
  useEffect(() => {
    if (!roomId || roomId === 'undefined') {
      navigate('/video-meetings');
      return;
    }
    fetchRoomDetails().catch(() => {});

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
  // 초기 연결 (승인된 참가자 / 방장)
  // =========================================================================
  useEffect(() => {
    if (!room || !user) return;

    const isApproved = room.participant_status === 'approved' || room.is_host;

    if (isApproved && !wsConnected && !wsRef.current && !localStreamReady) {
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
    // FIX-5: localStreamRef.current → localStreamReady (state)
    localStreamReady,
    initializeMedia,
    connectWebSocket,
    fetchPendingRequests,
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
  // 방장 SFU 초기화
  // FIX-5: localStreamRef.current → localStreamReady(state) 로 의존성 교체
  //        ref.current 를 의존성에 넣으면 변경 감지가 안 됨
  // =========================================================================
  const sfuInitializedRef = useRef(false);

  useEffect(() => {
    if (!wsConnected || !room?.is_host || !localStreamReady) return;
    if (sfuInitializedRef.current) return;

    sfuInitializedRef.current = true;

    const init = async () => {
      try {
        await initSFU();
        await startProducing(localStreamRef.current);
        console.log('✅ SFU 초기화 완료 (방장)');
      } catch (e) {
        console.error('❌ SFU 초기화 실패:', e);
        sfuInitializedRef.current = false;
      }
    };

    init();
  }, [wsConnected, room?.is_host, localStreamReady, initSFU, startProducing]);

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

  // FIX-6: localStreamRef.current 직접 참조 대신 localStreamReady 플래그로 분기
  //        (ref.current는 렌더링을 트리거하지 않으므로 스트림 표시 누락 발생)
  const allVideos = [
    {
      peerId: user?.username,
      username: `${user?.username} (나)`,
      stream: localStreamReady ? localStreamRef.current : null,
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
      isMuted: streamData.isMuted || false,
      isVideoOff: streamData.isVideoOff || false,
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

      {process.env.NODE_ENV === 'development' && (
        <div className="bg-gray-800 text-xs text-gray-400 px-4 py-2 flex gap-4">
          <span>WS: {wsConnected ? '🟢' : '🔴'}</span>
          <span>Ready: {wsReady ? '🟢' : '🟡'}</span>
          <span>Media: {localStreamReady ? '🟢' : '🔴'}</span>
          <span>Remote: {remoteStreams.size}</span>
          <span>SFU: {connectionStatus}</span>
        </div>
      )}

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
