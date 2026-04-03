// frontend/src/components/VideoMeetingRoom.jsx
//
// ★ LAYOUT TOGGLE BUILD — v2 ★
//
// [변경 내역]
// - Speaker / Gallery / Dynamic Gallery 3가지 뷰 선택 옵션 추가
// - RoomHeader를 최소화 (방이름+참가자수+뷰선택+벨 한 줄)
// - 진단 상태 바를 RoomHeader 내부에 통합 (별도 div 제거)
// - PendingRequestsPanel 컴팩트화 + 자동소멸 결과 알림
// - LayoutToggleButton 제거 (RoomHeader에 통합)
// - 컨트롤 바에서 레이아웃 버튼 제거
// ✅ [버그수정] 방장 나가기: window.confirm 제거 → ControlBar 팝오버 메뉴로 분리
//   - handleLeave: 나만 나가기 전용
//   - handleEndMeeting: 회의 종료(모든 퇴장) 전용
//   - ControlBar에 isHost / onEndMeeting prop 추가 전달

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useVideoMeetingAPI } from '../hooks/useVideoMeetingAPI';
import { useSFU } from '../hooks/useSFU';

import { RoomHeader }           from './VideoMeeting/RoomHeader';
import { PendingRequestsPanel } from './VideoMeeting/PendingRequestsPanel';
import { VideoGrid }            from './VideoMeeting/VideoGrid';
import { ControlBar }           from './VideoMeeting/ControlBar';
import { ChatPanel, ChatToggleButton } from './VideoMeeting/ChatPanel';
import { ReactionsButton, ReactionsOverlay } from './VideoMeeting/ReactionsPanel';
import { RaiseHandButton, HandRaisedBadge } from './VideoMeeting/RaiseHandButton';
import { IOSPlayButton }        from './VideoMeeting/IOSPlayButton';
import { useActiveSpeaker } from '../hooks/useActiveSpeaker';
import { useBackgroundProcessor } from '../hooks/useBackgroundProcessor';
import { BackgroundSelector }   from './VideoMeeting/BackgroundSelector';

// ── 진단 로거 ─────────────────────────────────────────────────
const RD  = (tag, ...args) => { const ts = new Date().toISOString().slice(11,23); console.log(`%c[R-D${tag}] ${ts}`,'color:#8bc34a;font-weight:bold',...args); };
const RDE = (tag, ...args) => { const ts = new Date().toISOString().slice(11,23); console.error(`%c[R-D${tag}] ${ts}`,'color:#f44336;font-weight:bold',...args); };
const RDW = (tag, ...args) => { const ts = new Date().toISOString().slice(11,23); console.warn(`%c[R-D${tag}] ${ts}`,'color:#ff9800;font-weight:bold',...args); };

const SFU_PROMISE_TYPES = new Set([
  'sfu_rtp_capabilities','sfu_joined','sfu_transport_created',
  'sfu_transport_connected','sfu_produced','sfu_consumed',
  'sfu_consumer_resumed','sfu_error',
]);
const SFU_EVENT_TYPES = new Set([
  'peer_joined','new_producer','track_state','user_left',
]);

const isIOS = () => {
  if (navigator.userAgentData) return navigator.userAgentData.platform === 'iOS';
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (ua.includes('Mac') && 'ontouchend' in document && navigator.maxTouchPoints > 0) return true;
  return false;
};
const isSafari = () => {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua) && !/FxiOS/.test(ua) && !/EdgiOS/.test(ua);
};

// ── 공통 정리 헬퍼 ────────────────────────────────────────────
async function doCleanupAndNavigate({
  cleanupBackground,
  cleanupWebRTC,
  localStreamRef,
  wsRef,
  navigate,
}) {
  try { await cleanupBackground(); } catch (_) {}
  cleanupWebRTC();
  if (localStreamRef.current) {
    localStreamRef.current.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
  }
  if (wsRef.current) {
    wsRef.current.close(1000, 'User left');
    wsRef.current = null;
  }
  navigate('/video-meetings');
}

// ============================================================
// VideoMeetingRoom
// ============================================================
function VideoMeetingRoom() {
  const { id: roomId } = useParams();
  const navigate       = useNavigate();
  const { user }       = useAuth();

  const [localStreamReady, setLocalStreamReady] = useState(false);
  const [showIOSPlayButton, setShowIOSPlayButton] = useState(false);
  const iosPlayTriggeredRef = useRef(false);

  // ── 레이아웃 상태: 'speaker' | 'gallery' | 'dynamic' ──────
  const [layout, setLayout] = useState('speaker');

  const handleLayoutChange = useCallback((newLayout) => {
    setLayout(newLayout);
  }, []);

  const {
    room,
    participants,           // eslint-disable-line no-unused-vars
    pendingRequests,
    loading: roomLoading,
    error:   roomError,
    fetchRoomDetails,
    fetchPendingRequests,
    approveParticipant,
    rejectParticipant,
    leaveRoom,
    endMeeting,
  } = useVideoMeetingAPI(roomId);

  const [wsConnected, setWsConnected] = useState(false);
  const [wsReady,     setWsReady]     = useState(false);
  const wsRef                = useRef(null);
  const reconnectTimeoutRef  = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  const [isMicOn,          setIsMicOn]          = useState(true);
  const [isVideoOn,        setIsVideoOn]         = useState(true);
  const [showPendingPanel, setShowPendingPanel]  = useState(false);
  const [showChatPanel,    setShowChatPanel]     = useState(false);
  const [unreadChatCount,  setUnreadChatCount]   = useState(0);
  const [chatMessages,     setChatMessages]      = useState([]);
  const [chatLoading,      setChatLoading]       = useState(false); // eslint-disable-line no-unused-vars
  const messagesEndRef  = useRef(null);
  const messageIdsRef   = useRef(new Set());

  // ── reactions ─────────────────────────────────────────────
  const [reactions,    setReactions]    = useState([]);
  const reactionIndexRef = useRef(0);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [raisedHands,  setRaisedHands]  = useState([]);

  const localVideoRef     = useRef(null);
  const initializationRef = useRef(false);

  const {
    localStreamRef, remoteStreams, connectionStatus,
    getLocalMedia, initSFU, startProducing,
    muteAudio, unmuteAudio, muteVideo, unmuteVideo,
    handleSFUMessage, dispatchSFUMessage,
    producersRef,
    cleanup: cleanupWebRTC,
  } = useSFU({ wsRef, roomId });

  const processedStreamRef = useRef(null);  // eslint-disable-line no-unused-vars

  // ── 배경 효과 훅 ──────────────────────────────────────────
  const {
    backgroundMode,
    backgroundImage,
    setBackground,
    setBackgroundImage,
    cleanup: cleanupBackground,
    outputStreamRef,
  } = useBackgroundProcessor({ localStreamRef, producersRef, localVideoRef });

  // 배경 선택 패널 표시 상태
  const [showBackgroundPanel, setShowBackgroundPanel] = useState(false);

  const {
    mainSpeakerId, pinnedPeerId, volumeLevels,
    isSpeaking, pinPeer, unpinPeer,
  } = useActiveSpeaker({
    localStreamRef, remoteStreams,
    localPeerId: user?.username, isMicOn,
  });

  // ── 채팅 메시지 추가 ─────────────────────────────────────
  const addChatMessage = useCallback((message) => {
    const messageId = message.message_id || message.id;
    if (!messageId) return;
    if (messageIdsRef.current.has(messageId)) return;
    messageIdsRef.current.add(messageId);

    setChatMessages(prev => {
      if (prev.some(msg => (msg.message_id || msg.id) === messageId)) return prev;
      return [...prev, {
        id: messageId, message_id: messageId,
        sender_username: message.sender_username,
        sender_user_id:  message.sender_user_id,
        content:         message.content,
        created_at:      message.created_at || new Date().toISOString(),
        is_mine:         message.is_mine || message.sender_username === user?.username,
      }];
    });

    if (!showChatPanel && message.sender_username !== user?.username) {
      setUnreadChatCount(prev => prev + 1);
    }
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [user, showChatPanel]);

  // ── iOS 재생 버튼 ─────────────────────────────────────────
  useEffect(() => {
    const onIOSPlayRequired = () => {
      if (!iosPlayTriggeredRef.current) setShowIOSPlayButton(true);
    };
    window.addEventListener('ios-play-required', onIOSPlayRequired);
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) && remoteStreams.size > 0) {
      setTimeout(() => {
        const hasUnplayed = Array.from(document.querySelectorAll('video:not([muted])')).some(
          v => v.paused && v.readyState >= 2
        );
        if (hasUnplayed && !iosPlayTriggeredRef.current) setShowIOSPlayButton(true);
      }, 1000);
    }
    return () => window.removeEventListener('ios-play-required', onIOSPlayRequired);
  }, [remoteStreams]);

  const handleIOSPlay = useCallback(async () => {
    let ok = 0, fail = 0;
    for (const video of document.querySelectorAll('video')) {
      if (video.srcObject && !video.muted) {
        try { await video.play(); ok++; } catch { fail++; }
      }
    }
    if (ok > 0) { iosPlayTriggeredRef.current = true; setShowIOSPlayButton(false); }
    else if (fail > 0) alert('비디오 재생에 실패했습니다.\n페이지를 새로고침하고 다시 시도해주세요.');
  }, []);

  // ==========================================================
  // [R-D02] WebSocket 메시지 핸들러
  // ==========================================================
  const handleWebSocketMessage = useCallback((data) => {
    const type = data.type;

    if (SFU_PROMISE_TYPES.has(type)) {
      RD('02', `→ dispatchSFUMessage (promise type) "${type}"`);
      dispatchSFUMessage(data);
      return;
    }

    if (SFU_EVENT_TYPES.has(type)) {
      RD('02', `→ handleSFUMessage (event type) "${type}"`);
      handleSFUMessage(data);
      return;
    }

    RD('02', `→ switch handler "${type}"`);

    switch (type) {
      case 'participants_list':
        RD('02', `participants_list — count=${data.participants?.length}`);
        break;

      case 'approval_notification': {
        if (String(data.room_id) !== String(roomId)) break;
        if (String(data.participant_user_id) !== String(user?.id)) break;

        fetchRoomDetails().then(() => {
          setWsReady(prev => {
            if (!prev && wsRef.current?._wsReady) return true;
            return prev;
          });
        });
        break;
      }

      case 'user_joined':
        RD('02', `user_joined: ${data.username}`);
        break;

      case 'join_ready':
        RD('02', `join_ready: ${data.from_username}`);
        break;

      case 'chat_message':
        addChatMessage(data);
        break;

      case 'reaction': {
        const idx = reactionIndexRef.current;
        reactionIndexRef.current = (idx + 1) % 10;
        const id = Date.now() + Math.random();
        setReactions(prev => [...prev, { id, emoji: data.reaction_type, username: data.username, index: idx }]);
        setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 3500);
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
        RDW('02', `Unknown WS message type: "${type}"`);
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
  ]);

  const handleWebSocketMessageRef = useRef(handleWebSocketMessage);
  useEffect(() => {
    handleWebSocketMessageRef.current = handleWebSocketMessage;
  }, [handleWebSocketMessage]);

  // ==========================================================
  // WebSocket 연결
  // ==========================================================
  const connectWebSocket = useCallback(() => {
    if (!roomId || !user || roomId === 'undefined') return;

    if (wsRef.current) {
      const s = wsRef.current.readyState;
      if (s === WebSocket.OPEN || s === WebSocket.CONNECTING) {
        RDW('02', `connectWebSocket 중복 호출 무시`);
        return;
      }
      try { wsRef.current.close(1000, 'Reconnecting'); } catch (_) {}
      wsRef.current = null;
    }

    setWsReady(false);

    const isHttps    = window.location.protocol === 'https:';
    const wsProtocol = isHttps ? 'wss' : 'ws';
    const token      = localStorage.getItem('access_token');

    if (!token) { alert('로그인이 필요합니다.'); navigate('/login'); return; }

    const wsUrl = `${wsProtocol}://${window.location.host}/ws/video-meeting/${roomId}/?token=${token}`;
    RD('02', `connectWebSocket — url="${wsUrl.replace(/token=.*/, 'token=***')}"`);

    try {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      const connectionTimeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          RDE('02', `WebSocket 연결 타임아웃 (10초)`);
          socket.close();
          if (reconnectAttemptsRef.current < 3) {
            reconnectAttemptsRef.current += 1;
            setTimeout(() => connectWebSocket(), 2000);
          }
        }
      }, 10000);

      socket.onopen = () => {
        RD('02', `✅ WebSocket OPEN`);
        clearTimeout(connectionTimeout);
        setWsConnected(true);
        reconnectAttemptsRef.current = 0;

        setTimeout(() => {
          if (socket.readyState === WebSocket.OPEN) {
            try {
              socket.send(JSON.stringify({ type: 'join', username: user.username }));
              RD('02', `join 전송 (WS onopen)`);
              setTimeout(() => {
                socket._wsReady = true;
                setWsReady(true);
                RD('02', `✅ _wsReady = true, wsReady state = true`);
              }, 500);
            } catch (_) {}
          }
        }, 500);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          RD('02', `↓ WS RX raw type="${data.type}"`);
          handleWebSocketMessageRef.current(data);
        } catch (e) {
          RDE('02', '메시지 파싱 오류:', e);
        }
      };

      socket.onerror = (error) => {
        RDE('02', `WebSocket ERROR:`, error);
        clearTimeout(connectionTimeout);
      };

      socket.onclose = (event) => {
        RDW('02', `WebSocket CLOSED — code=${event.code} reason="${event.reason}" wasClean=${event.wasClean}`);
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
            RDW('02', `재연결 예약 — attempt=${reconnectAttemptsRef.current} delay=${delay}ms`);
            reconnectTimeoutRef.current = setTimeout(() => connectWebSocket(), delay);
          } else {
            RDE('02', '재연결 5회 초과 — 포기');
            alert('서버 연결 실패. 페이지를 새로고침해주세요.');
          }
        }
      };
    } catch (error) {
      RDE('02', 'WebSocket 생성 실패:', error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user, navigate]);

  // ==========================================================
  // 미디어 초기화
  // ==========================================================
  const initializeMedia = useCallback(async () => {
    if (initializationRef.current) {
      RDW('05', '미디어 초기화 중복 호출 무시');
      return;
    }
    initializationRef.current = true;

    try {
      RD('05', '미디어 초기화 시작');

      let constraints = { video: true, audio: true };

      if (isIOS() || isSafari()) {
        constraints = {
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
          audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
        };
      }

      const stream = await getLocalMedia(constraints);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        try { await localVideoRef.current.play(); } catch (_) {}
      }

      setLocalStreamReady(true);
      RD('05', '✅ 미디어 초기화 완료');
    } catch (error) {
      RDE('05', '미디어 초기화 실패:', error);
      initializationRef.current = false;

      if (error.name === 'NotAllowedError') {
        alert('카메라/마이크 접근이 거부되었습니다.\n브라우저 설정에서 권한을 허용해주세요.');
      } else if (error.name === 'NotFoundError') {
        alert('카메라 또는 마이크를 찾을 수 없습니다.');
      }
    }
  }, [getLocalMedia]);

  // ==========================================================
  // 미디어 토글
  // ==========================================================
  const handleToggleMic = useCallback(async () => {
    if (isMicOn) {
      await muteAudio();
      setIsMicOn(false);
    } else {
      await unmuteAudio();
      setIsMicOn(true);
    }
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'track_state', kind: 'audio', enabled: !isMicOn }));
    }
  }, [isMicOn, muteAudio, unmuteAudio]);

  const handleToggleVideo = useCallback(async () => {
    if (isVideoOn) {
      await muteVideo();
      setIsVideoOn(false);
    } else {
      await unmuteVideo();
      setIsVideoOn(true);
    }
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'track_state', kind: 'video', enabled: !isVideoOn }));
    }
  }, [isVideoOn, muteVideo, unmuteVideo]);

  // ==========================================================
  // ✅ [버그수정] 나가기 — window.confirm 제거, 두 함수로 분리
  // ==========================================================

  // 나만 나가기 (방장 포함 — 회의는 유지됨)
  const handleLeave = useCallback(async () => {
    try { await leaveRoom(); } catch (_) {}
    await doCleanupAndNavigate({ cleanupBackground, cleanupWebRTC, localStreamRef, wsRef, navigate });
  }, [leaveRoom, cleanupBackground, cleanupWebRTC, localStreamRef, navigate]);

  // 회의 종료 (방장 전용 — 모든 참가자 퇴장)
  const handleEndMeeting = useCallback(async () => {
    try { await endMeeting(); } catch (_) {}
    await doCleanupAndNavigate({ cleanupBackground, cleanupWebRTC, localStreamRef, wsRef, navigate });
  }, [endMeeting, cleanupBackground, cleanupWebRTC, localStreamRef, navigate]);

  // ==========================================================
  // 채팅 메시지 전송
  // ==========================================================
  const handleSendChatMessage = useCallback(async (content) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('WebSocket 연결 없음');
    ws.send(JSON.stringify({ type: 'chat', content }));
  }, []);

  // ==========================================================
  // 반응 전송
  // ==========================================================
  const handleSendReaction = useCallback((emoji) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'reaction', reaction_type: emoji }));
  }, []);

  // ==========================================================
  // 손들기
  // ==========================================================
  const handleRaiseHand = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'raise_hand' }));
    setIsHandRaised(true);
  }, []);

  const handleLowerHand = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'lower_hand' }));
    setIsHandRaised(false);
  }, []);

  // ==========================================================
  // 마운트/언마운트
  // ==========================================================
  useEffect(() => {
    if (!roomId || roomId === 'undefined') {
      navigate('/video-meetings');
      return;
    }
    fetchRoomDetails().catch(() => {});

    return () => {
      cleanupBackground();
      cleanupWebRTC();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [roomId, navigate, fetchRoomDetails, cleanupWebRTC]);

  // ==========================================================
  // 초기 연결
  // ==========================================================
  useEffect(() => {
    if (!room || !user) return;

    const isApproved = room.participant_status === 'approved' || room.is_host;
    RD('04', `초기 연결 useEffect — isApproved=${isApproved} wsConnected=${wsConnected} localStreamReady=${localStreamReady} is_host=${room.is_host}`);

    if (isApproved && !wsConnected && !wsRef.current) {
      const initialize = async () => {
        try {
          if (!localStreamReady) {
            RD('05', '미디어 초기화 시작 (초기 연결)');
            await initializeMedia();
            await new Promise(r => setTimeout(r, 300));
          } else {
            RD('05', '미디어 이미 준비됨 — skip');
            if (localVideoRef.current && localStreamRef.current && !localVideoRef.current.srcObject) {
              localVideoRef.current.srcObject = localStreamRef.current;
            }
          }
          RD('02', 'WebSocket 연결 시작');
          connectWebSocket();
        } catch (error) {
          RDE('04', '초기화 실패:', error);
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
    localStreamReady,
    initializeMedia,
    connectWebSocket,
    fetchPendingRequests,
    localStreamRef,
  ]);

  // ==========================================================
  // SFU 초기화
  // ==========================================================
  const sfuInitializedRef = useRef(false);

  useEffect(() => {
    if (!room || !user) return;

    const isApproved = room.is_host || room.participant_status === 'approved';

    RD('04', `SFU useEffect check — is_host=${room?.is_host} participant_status=${room?.participant_status} isApproved=${isApproved} wsReady=${wsReady} localStreamReady=${localStreamReady} sfuInitialized=${sfuInitializedRef.current}`);

    if (!isApproved)               { RDW('04', '미승인 — skip'); return; }
    if (!wsReady)                  { RDW('04', 'wsReady=false — skip'); return; }
    if (!localStreamReady)         { RDW('04', 'localStreamReady=false — skip'); return; }
    if (sfuInitializedRef.current) { RDW('04', '이미 초기화됨 — skip'); return; }

    sfuInitializedRef.current = true;

    const initSFUForUser = async () => {
      try {
        RD('04', `${room.is_host ? '👑 방장' : '👤 참가자'} initSFU 시작`);
        await initSFU();
        RD('04', 'initSFU OK → startProducing 시작');
        await startProducing(localStreamRef.current);
        RD('04', `✅ SFU 초기화 완료`);
      } catch (e) {
        RDE('04', '❌ SFU 초기화 실패:', e.message);
        sfuInitializedRef.current = false;
      }
    };

    initSFUForUser();
  }, [
    room?.is_host,
    room?.participant_status,
    user,
    wsReady,
    localStreamReady,
    initSFU,
    startProducing,
    localStreamRef,
  ]);

  // ── 승인 대기 폴링 ─────────────────────────────────────────
  useEffect(() => {
    if (!room || !user) return;
    if (room.is_host || room.participant_status !== 'pending') return;

    let pollCount = 0;
    const maxPolls = 120;

    const pollInterval = setInterval(async () => {
      pollCount++;
      try {
        const updated = await fetchRoomDetails();
        if (updated?.participant_status === 'approved') {
          RD('04', '✅ 폴링으로 승인 감지');
          clearInterval(pollInterval);
        }
        if (updated?.participant_status === 'rejected') {
          clearInterval(pollInterval);
          alert('참가가 거부되었습니다.');
          navigate('/video-meetings');
        }
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          const retry = window.confirm('승인 대기 시간 초과.\n\n계속 대기하시겠습니까?');
          if (!retry) navigate('/video-meetings');
          else pollCount = 0;
        }
      } catch (_) {}
    }, 1500);

    return () => clearInterval(pollInterval);
  }, [room?.participant_status, room?.is_host, user, fetchRoomDetails, navigate]);

  useEffect(() => { if (showChatPanel) setUnreadChatCount(0); }, [showChatPanel]);

  // ==========================================================
  // allVideos 계산
  // ==========================================================
  const allVideos = useMemo(() => {
    // ★ 배경 효과 ON이면 outputStream, OFF면 rawStream
    const localStream = backgroundMode !== 'none' && outputStreamRef?.current
      ? outputStreamRef.current
      : (localStreamReady ? localStreamRef.current : null);

    const local = {
      peerId:     user?.username,
      username:   `${user?.username} (나)`,
      stream:     localStream,
      isLocal:    true,
      isMuted:    !isMicOn,
      isVideoOff: !isVideoOn,
      ref:        localVideoRef,
      isHandRaised,
    };
    const remote = [...remoteStreams.entries()].map(([peerId, streamData]) => ({
      peerId,
      username: streamData.username && streamData.username !== peerId
        ? streamData.username
        : (peerId.startsWith('user_') ? peerId.replace('user_', 'User ') : peerId),
      stream:      streamData.stream,
      isLocal:     false,
      isMuted:     streamData.isMuted    ?? false,
      isVideoOff:  streamData.isVideoOff ?? false,
      isHandRaised: raisedHands.some(h => h.username === streamData.username || h.username === peerId),
    }));
    const all = [local, ...remote].filter(v => v.stream || v.isLocal);

    if (process.env.NODE_ENV === 'development') {
      RD('01', `allVideos 재계산 — total=${all.length}`);
      if (remote.length === 0 && remoteStreams.size === 0) {
        RDW('01', `remoteStreams 비어있음`);
      }
    }
    return all;
  }, [user?.username, localStreamReady, backgroundMode, isMicOn, isVideoOn, isHandRaised, remoteStreams, raisedHands]);

  // ==========================================================
  // 렌더링
  // ==========================================================
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

  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col" style={{ zIndex: 9000 }}>

      {/* ── 헤더 + 대기패널 래퍼 ── */}
      <div className="flex-shrink-0 relative">
        <RoomHeader
          title={room.title}
          participantCount={allVideos.length}
          connectionStatus={connectionStatus}
          isHost={room.is_host}
          pendingCount={pendingRequests.length}
          onTogglePendingPanel={() => setShowPendingPanel(!showPendingPanel)}
          layout={layout}
          onLayoutChange={handleLayoutChange}
          showDiag={isDev}
          wsConnected={wsConnected}
          wsReady={wsReady}
          localStreamReady={localStreamReady}
          sfuStatus={connectionStatus}
          remoteCount={remoteStreams.size}
          videoCardsCount={allVideos.length}
          sfuInitialized={sfuInitializedRef.current}
          isHostRole={room.is_host}
          participantStatus={room.participant_status}
        />

        {room.is_host && showPendingPanel && (
          <div
            className="absolute left-0 right-0 shadow-2xl"
            style={{ top: '100%', zIndex: 9100 }}
          >
            <PendingRequestsPanel
              requests={pendingRequests}
              onApprove={approveParticipant}
              onReject={rejectParticipant}
              onClose={() => setShowPendingPanel(false)}
            />
          </div>
        )}
      </div>

      {/* ── 비디오 그리드 ── */}
      <div className="flex-1 min-h-0">
        <VideoGrid
          videos={allVideos}
          layout={layout}
          HandRaisedBadge={HandRaisedBadge}
          mainSpeakerId={mainSpeakerId}
          pinnedPeerId={pinnedPeerId}
          volumeLevels={volumeLevels}
          isSpeaking={isSpeaking}
          onPin={pinPeer}
          onUnpin={unpinPeer}
        />
      </div>

      <IOSPlayButton show={showIOSPlayButton} onPlay={handleIOSPlay} />

      {/* ── 하단 컨트롤 바 ── */}
      <div className="flex-shrink-0 bg-gray-800 border-t border-gray-700 px-3 md:px-6 py-2">
        <div className="flex justify-center items-center gap-2 md:gap-4">
          <div className="relative">
            {/* ✅ isHost / onEndMeeting prop 전달 → 방장 팝오버 메뉴 활성화 */}
            <ControlBar
              isMicOn={isMicOn}
              isVideoOn={isVideoOn}
              onToggleMic={handleToggleMic}
              onToggleVideo={handleToggleVideo}
              onLeave={handleLeave}
              onEndMeeting={handleEndMeeting}
              isHost={room.is_host}
              backgroundMode={backgroundMode}
              onToggleBackground={() => setShowBackgroundPanel(prev => !prev)}
            />

            {/* 배경 선택 패널 */}
            <BackgroundSelector
              isOpen={showBackgroundPanel}
              backgroundMode={backgroundMode}
              backgroundImage={backgroundImage}
              onSetBackground={async (mode) => {
                await setBackground(mode);
                if (mode === 'none') setShowBackgroundPanel(false);
              }}
              onSetBackgroundImage={async (dataUrl) => {
                await setBackgroundImage(dataUrl);
                setShowBackgroundPanel(false);
              }}
              onClose={() => setShowBackgroundPanel(false)}
            />
          </div>

          <div className="h-6 w-px bg-gray-600" />

          <ChatToggleButton onClick={() => setShowChatPanel(!showChatPanel)} unreadCount={unreadChatCount} />
          <ReactionsButton onSendReaction={handleSendReaction} />
          <RaiseHandButton isHandRaised={isHandRaised} onRaise={handleRaiseHand} onLower={handleLowerHand} />
        </div>
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