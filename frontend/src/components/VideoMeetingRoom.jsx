// frontend/src/components/VideoMeetingRoom.jsx
//
// ★ DIAGNOSTIC BUILD ★
// [R-Dxx] 태그로 진단 로그 추가.
// 브라우저 콘솔에서 "R-D" 로 필터.
//
// 진단 포인트:
//  R-D01  allVideos 계산 시 구성 내역
//  R-D02  WebSocket onopen / onmessage / onclose / onerror
//  R-D03  approval_notification 처리 단계
//  R-D04  방장 SFU 초기화 useEffect 진입 조건
//  R-D05  initializeMedia 결과
//  R-D06  wsReady 대기 루프

import React, { useState, useEffect, useRef, useCallback } from 'react';
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

// ── 진단 로거 ─────────────────────────────────────────────────
const RD = (tag, ...args) => {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`%c[R-D${tag}] ${ts}`, 'color:#8bc34a;font-weight:bold', ...args);
};
const RDE = (tag, ...args) => {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`%c[R-D${tag}] ${ts}`, 'color:#f44336;font-weight:bold', ...args);
};
const RDW = (tag, ...args) => {
  const ts = new Date().toISOString().slice(11, 23);
  console.warn(`%c[R-D${tag}] ${ts}`, 'color:#ff9800;font-weight:bold', ...args);
};

// ── SFU 메시지 타입 분류 ──────────────────────────────────────
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

const SFU_EVENT_TYPES = new Set([
  'peer_joined',
  'new_producer',
  'track_state',
  'user_left',
]);

// ── 플랫폼 감지 ───────────────────────────────────────────────
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

  const [reactions,    setReactions]    = useState([]);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [raisedHands,  setRaisedHands]  = useState([]);

  const localVideoRef     = useRef(null);
  const initializationRef = useRef(false);
  const approvalInitializedRef = useRef('idle'); // 'idle' | 'running' | 'done'

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

  // ── 채팅 메시지 추가 헬퍼 ────────────────────────────────────
  const addChatMessage = useCallback((message) => {
    const messageId = message.message_id || message.id;
    if (!messageId) return;
    if (messageIdsRef.current.has(messageId)) return;
    messageIdsRef.current.add(messageId);

    setChatMessages(prev => {
      if (prev.some(msg => (msg.message_id || msg.id) === messageId)) return prev;
      return [...prev, {
        id:              messageId,
        message_id:      messageId,
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

    // SFU Promise 타입은 dispatchSFUMessage 큐로
    if (SFU_PROMISE_TYPES.has(type)) {
      RD('02', `→ dispatchSFUMessage (promise type) "${type}"`);
      dispatchSFUMessage(data);
      return;
    }

    // SFU 이벤트 타입은 handleSFUMessage로
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

      // ── [R-D03] 참가 승인 알림 ──────────────────────────────
      case 'approval_notification': {
        RD('03', `approval_notification 수신`, {
          room_id: data.room_id,
          participant_user_id: data.participant_user_id,
          retry_count: data.retry_count,
          approved: data.approved,
        });

        const retryCount = data.retry_count || 0;

        if (String(data.room_id) !== String(roomId)) {
          RDW('03', `room_id 불일치 — 무시 (data="${data.room_id}" current="${roomId}")`);
          return;
        }
        if (String(data.participant_user_id) !== String(user?.id)) {
          RDW('03', `participant_user_id 불일치 — 무시 (data="${data.participant_user_id}" me="${user?.id}")`);
          return;
        }
        if (retryCount > 0) {
          RDW('03', `retry_count=${retryCount} > 0 — 중복 알림 무시`);
          return;
        }
        if (approvalInitializedRef.current !== 'idle') {
          RDW('03', `이미 초기화됨 (state="${approvalInitializedRef.current}") — 중복 무시`);
          return;
        }

        approvalInitializedRef.current = 'running';
        RD('03', `초기화 시작 — approvalInitializedRef = "running"`);

        const initializeAfterApproval = async () => {
          try {
            const isiOS = isIOS();
            RD('03', `[Step 1] 미디어 초기화 — localStream=${!!localStreamRef.current} iOS=${isiOS}`);

            // 1. 미디어
            if (!localStreamRef.current) {
              await getLocalMedia();
              if (localVideoRef.current && localStreamRef.current) {
                localVideoRef.current.srcObject = localStreamRef.current;
                if (isiOS) { try { await localVideoRef.current.play(); } catch (_) {} }
              }
              setLocalStreamReady(true);
              RD('03', `[Step 1] 미디어 OK`);
            } else {
              RD('03', `[Step 1] 미디어 이미 있음 — skip`);
            }

            // 2. 방 정보 갱신
            RD('03', `[Step 2] fetchRoomDetails`);
            await fetchRoomDetails();
            RD('03', `[Step 2] fetchRoomDetails OK`);

            // 3. WebSocket 확인
            RD('03', `[Step 3] WebSocket 확인 — readyState=${wsRef.current?.readyState}`);
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
              RDW('03', `[Step 3] WS 미연결 — connectWebSocket 호출`);
              connectWebSocket();
              await new Promise(r => setTimeout(r, isiOS ? 3000 : 2000));
              RD('03', `[Step 3] 대기 후 WS readyState=${wsRef.current?.readyState}`);
              if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket 재연결 실패');
              }
            }

            // 4. wsReady 대기
            RD('06', `[Step 4] wsReady 대기 루프 시작 — _wsReady=${wsRef.current?._wsReady}`);
            let wsReadyWait = 0;
            while (!wsRef.current?._wsReady && wsReadyWait < 50) {
              await new Promise(r => setTimeout(r, 100));
              wsReadyWait++;
              if (wsReadyWait % 10 === 0) {
                RD('06', `  대기 중... ${wsReadyWait * 100}ms elapsed _wsReady=${wsRef.current?._wsReady}`);
              }
            }
            RD('06', `[Step 4] wsReady 대기 완료 — loops=${wsReadyWait} _wsReady=${wsRef.current?._wsReady}`);
            if (!wsRef.current?._wsReady) {
              RDW('06', `_wsReady가 50회(5초) 안에 true가 되지 않음 — 강제 진행`);
            }

            setWsReady(true);
            await new Promise(r => setTimeout(r, isiOS ? 1500 : 500));

            // 5. SFU 초기화
            RD('03', `[Step 5] initSFU 호출`);
            await initSFU();
            RD('03', `[Step 5] initSFU OK`);

            // 6. produce
            RD('03', `[Step 6] startProducing — stream=${!!localStreamRef.current}`);
            await startProducing(localStreamRef.current);
            RD('03', `[Step 6] startProducing OK`);

            // 7. join
            RD('03', `[Step 7] join 전송 — WS readyState=${wsRef.current?.readyState}`);
            const finalWs = wsRef.current;
            if (finalWs?.readyState === WebSocket.OPEN) {
              finalWs.send(JSON.stringify({ type: 'join', username: user.username }));
              RD('03', `[Step 7] join 전송 OK`);
            } else {
              RDW('03', `[Step 7] WS 미열림 — join 전송 불가`);
            }

            approvalInitializedRef.current = 'done';
            RD('03', `✅ 승인 후 초기화 완료`);

          } catch (error) {
            RDE('03', `❌ 승인 후 초기화 실패:`, error.message, error.stack);
            approvalInitializedRef.current = 'idle';
            alert('회의 참가 준비 중 오류. 새로고침 후 재시도해주세요.');
          }
        };

        const delay = isIOS() ? 1200 : 500;
        RD('03', `initializeAfterApproval 예약 — delay=${delay}ms`);
        setTimeout(initializeAfterApproval, delay);
        break;
      }

      case 'user_joined':
        RD('02', `user_joined: ${data.username} (SFU new_producer로 처리됨)`);
        break;

      case 'join_ready':
        RD('02', `join_ready: ${data.from_username} (SFU 환경 미사용)`);
        break;

      case 'chat_message':
        addChatMessage(data);
        break;

      case 'reaction': {
        const id = Date.now() + Math.random();
        setReactions(prev => [...prev, { id, emoji: data.reaction_type, username: data.username }]);
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
    getLocalMedia,
    initSFU,
    startProducing,
    localStreamRef,
  ]);

  // stale closure 방지 ref
  const handleWebSocketMessageRef = useRef(handleWebSocketMessage);
  useEffect(() => {
    handleWebSocketMessageRef.current = handleWebSocketMessage;
  }, [handleWebSocketMessage]);

  // ==========================================================
  // [R-D02] WebSocket 연결
  // ==========================================================
  const connectWebSocket = useCallback(() => {
    if (!roomId || !user || roomId === 'undefined') return;

    if (wsRef.current) {
      const s = wsRef.current.readyState;
      if (s === WebSocket.OPEN || s === WebSocket.CONNECTING) {
        RDW('02', `connectWebSocket 중복 호출 무시 — state=${['CONNECTING','OPEN','CLOSING','CLOSED'][s]}`);
        return;
      }
      try { wsRef.current.close(1000, 'Reconnecting'); } catch (_) {}
      wsRef.current = null;
    }

    setWsReady(false);

    const isHttps    = window.location.protocol === 'https:';
    const wsProtocol = isHttps ? 'wss' : 'ws';
    const token      = localStorage.getItem('access_token');

    if (!token) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }

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
  // [R-D05] 미디어 초기화
  // ==========================================================
  const initializeMedia = useCallback(async () => {
    if (initializationRef.current) {
      RDW('05', 'initializeMedia 중복 호출 무시');
      return;
    }
    initializationRef.current = true;
    RD('05', 'initializeMedia START');

    try {
      if (isIOS() && !isSafari()) {
        const ok = window.confirm('⚠️ iOS에서는 Safari 사용을 권장합니다.\n\n계속 진행하시겠습니까?');
        if (!ok) throw new Error('사용자가 취소했습니다');
      }

      const stream = await getLocalMedia();
      RD('05', `미디어 획득 OK — videoTracks=${stream.getVideoTracks().length} audioTracks=${stream.getAudioTracks().length}`);

      if (localVideoRef.current && stream) {
        localVideoRef.current.srcObject = stream;
        if (isIOS()) { try { await localVideoRef.current.play(); } catch (_) {} }
      }
      setLocalStreamReady(true);
      RD('05', 'initializeMedia DONE');
      initializationRef.current = false;

    } catch (error) {
      RDE('05', `initializeMedia FAILED: ${error.name} — ${error.message}`);
      initializationRef.current = false;

      if (isIOS()) {
        if (error.name === 'NotAllowedError')  alert('📱 iOS 권한 설정이 필요합니다.\n\n설정 > Safari > 카메라/마이크');
        else if (error.name === 'NotReadableError') alert('📱 카메라/마이크 사용 중\n\n다른 앱 종료 후 재시도');
        else if (error.message !== '사용자가 취소했습니다') alert('미디어 초기화 실패');
      } else {
        alert('카메라와 마이크 접근 권한이 필요합니다.');
      }
      if (error.message !== '사용자가 취소했습니다') throw error;
    }
  }, [getLocalMedia]);

  // ── 마이크/비디오 토글 ─────────────────────────────────────
  const handleToggleMic = useCallback(() => {
    const next = !isMicOn;
    setIsMicOn(next);
    next ? unmuteAudio() : muteAudio();
  }, [isMicOn, muteAudio, unmuteAudio]);

  const handleToggleVideo = useCallback(() => {
    const next = !isVideoOn;
    setIsVideoOn(next);
    next ? unmuteVideo() : muteVideo();
  }, [isVideoOn, muteVideo, unmuteVideo]);

  // ── 회의 나가기 ────────────────────────────────────────────
  const handleLeave = async () => {
    if (room.is_host) {
      const confirmEnd = window.confirm('회의를 종료하시겠습니까?\n\n"확인": 모든 참가자 퇴장\n"취소": 나만 나가기');
      try { if (confirmEnd) { await endMeeting(); } else { await leaveRoom(); } } catch (_) {}
    } else {
      try { await leaveRoom(); } catch (_) {}
    }
    cleanupWebRTC();
    if (wsRef.current) wsRef.current.close(1000, 'User leaving');
    navigate('/video-meetings');
  };

  // ── 채팅/반응/손들기 ────────────────────────────────────────
  const handleSendChatMessage = async (content) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('WebSocket 연결 없음');
    ws.send(JSON.stringify({ type: 'chat', content }));
  };

  const handleSendReaction = async (emoji) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify({ type: 'reaction', reaction_type: emoji })); } catch (e) { RDE('02', '반응 전송 실패:', e); }
  };

  const handleRaiseHand = async () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify({ type: 'raise_hand' })); setIsHandRaised(true); } catch (e) { RDE('02', '손들기 실패:', e); }
  };

  const handleLowerHand = async () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify({ type: 'lower_hand' })); setIsHandRaised(false); } catch (e) { RDE('02', '손내리기 실패:', e); }
  };

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
      cleanupWebRTC();
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [roomId, navigate, fetchRoomDetails, cleanupWebRTC]);

  // ==========================================================
  // 초기 연결 — 승인된 참가자 & 방장
  // ==========================================================
  useEffect(() => {
    if (!room || !user) return;

    const isApproved = room.participant_status === 'approved' || room.is_host;
    RD('04', `초기 연결 useEffect — isApproved=${isApproved} wsConnected=${wsConnected} localStreamReady=${localStreamReady} is_host=${room.is_host}`);

    if (isApproved && !wsConnected && !wsRef.current && !localStreamReady) {
      const initialize = async () => {
        try {
          RD('05', '미디어 초기화 시작 (초기 연결)');
          await initializeMedia();
          await new Promise(r => setTimeout(r, 300));
          RD('02', 'WebSocket 연결 시작 (초기 연결)');
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
  ]);

  // ==========================================================
  // [R-D04] 방장 SFU 초기화
  // ==========================================================
  const sfuInitializedRef = useRef(false);

  useEffect(() => {
    RD('04', `방장 SFU useEffect check — is_host=${room?.is_host} wsReady=${wsReady} localStreamReady=${localStreamReady} sfuInitialized=${sfuInitializedRef.current}`);

    if (!room?.is_host)    { RDW('04', '방장 아님 — skip'); return; }
    if (!wsReady)          { RDW('04', 'wsReady=false — skip (아직 WS 준비 안됨)'); return; }
    if (!localStreamReady) { RDW('04', 'localStreamReady=false — skip (미디어 준비 안됨)'); return; }
    if (sfuInitializedRef.current) { RDW('04', '이미 초기화됨 — skip'); return; }

    sfuInitializedRef.current = true;

    const initHostSFU = async () => {
      try {
        RD('04', '👑 방장 initSFU 시작');
        await initSFU();
        RD('04', '👑 방장 startProducing 시작');
        await startProducing(localStreamRef.current);
        RD('04', '✅ 방장 SFU 초기화 완료');
      } catch (e) {
        RDE('04', '❌ 방장 SFU 초기화 실패:', e.message);
        sfuInitializedRef.current = false;
      }
    };

    initHostSFU();
  }, [
    room?.is_host,
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
    const maxPolls = 60;

    const pollInterval = setInterval(async () => {
      pollCount++;
      try {
        const updated = await fetchRoomDetails();
        if (updated?.participant_status === 'approved') clearInterval(pollInterval);
        if (updated?.participant_status === 'rejected') {
          clearInterval(pollInterval);
          alert('참가가 거부되었습니다.');
          navigate('/video-meetings');
        }
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          const retry = window.confirm('승인 대기 시간 초과.\n\n계속 대기하시겠습니까?');
          if (!retry) navigate('/video-meetings');
        }
      } catch (_) {}
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [room?.participant_status, room?.is_host, user, fetchRoomDetails, navigate]);

  useEffect(() => {
    if (showChatPanel) setUnreadChatCount(0);
  }, [showChatPanel]);

  // ==========================================================
  // [R-D01] allVideos 계산
  // ==========================================================
  const allVideos = (() => {
    const local = {
      peerId:      user?.username,
      username:    `${user?.username} (나)`,
      stream:      localStreamReady ? localStreamRef.current : null,
      isLocal:     true,
      isMuted:     !isMicOn,
      isVideoOff:  !isVideoOn,
      ref:         localVideoRef,
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

    // [R-D01] 진단 로그
    RD('01', `allVideos 재계산 — total=${all.length} (local=1 remote=${remote.length})`,
      all.map(v => ({
        peerId:     v.peerId,
        username:   v.username,
        isLocal:    v.isLocal,
        hasStream:  !!v.stream,
        trackCount: v.stream?.getTracks().length ?? 0,
        tracks:     v.stream?.getTracks().map(t => `${t.kind}:${t.readyState}`) ?? [],
        isVideoOff: v.isVideoOff,
        isMuted:    v.isMuted,
      }))
    );

    if (remote.length === 0 && remoteStreams.size === 0) {
      RDW('01', `remoteStreams 비어있음 — 상대방 영상 없음. consumeProducer가 아직 성공하지 않았거나 실패함.`);
    }
    if (remote.some(v => !v.stream)) {
      RDW('01', `stream=null인 remote 항목 존재 — filter에 의해 제외됨`);
    }

    return all;
  })();

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

      {/* 진단 상태 바 (항상 표시 — 확인 후 제거) */}
      <div className="bg-gray-800 text-xs text-gray-300 px-4 py-1.5 flex flex-wrap gap-x-4 gap-y-1 border-b border-gray-700">
        <span>WS: <b className={wsConnected ? 'text-green-400' : 'text-red-400'}>{wsConnected ? '연결' : '끊김'}</b></span>
        <span>Ready: <b className={wsReady ? 'text-green-400' : 'text-yellow-400'}>{wsReady ? '준비' : '대기'}</b></span>
        <span>Media: <b className={localStreamReady ? 'text-green-400' : 'text-red-400'}>{localStreamReady ? 'OK' : '없음'}</b></span>
        <span>SFU: <b className={
          connectionStatus === 'connected' ? 'text-green-400' :
          connectionStatus === 'failed'    ? 'text-red-400'   : 'text-yellow-400'
        }>{connectionStatus}</b></span>
        <span>상대방: <b className={remoteStreams.size > 0 ? 'text-green-400' : 'text-red-400'}>{remoteStreams.size}명</b></span>
        <span>VideoCards: <b className="text-white">{allVideos.length}</b></span>
        <span>approvalState: <b className="text-gray-400">{approvalInitializedRef.current}</b></span>
      </div>

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
        <ChatToggleButton onClick={() => setShowChatPanel(!showChatPanel)} unreadCount={unreadChatCount} />
        <ReactionsButton onSendReaction={handleSendReaction} />
        <RaiseHandButton isHandRaised={isHandRaised} onRaise={handleRaiseHand} onLower={handleLowerHand} />
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