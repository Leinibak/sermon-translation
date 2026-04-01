// frontend/src/components/VideoMeetingRoom.jsx
//
// ★ LAYOUT TOGGLE BUILD ★
//
// [변경 내역]
// - Speaker View / Gallery View 전환 버튼 추가 (RoomHeader 하단 or ControlBar)
// - ReactionsOverlay에 index prop 전달 → 이모티콘 겹침 방지
// - VideoGrid에 layout prop 전달
// - 모바일/PC 모두 레이아웃 버튼 표시

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader, AlertCircle, LayoutGrid, Monitor } from 'lucide-react';
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

// ══════════════════════════════════════════════════════════════
// 레이아웃 전환 버튼 컴포넌트
// ══════════════════════════════════════════════════════════════
function LayoutToggleButton({ layout, onToggle, isMobile }) {
  const isSpeaker = layout === 'speaker';
  return (
    <button
      onClick={onToggle}
      className={`
        flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
        transition-all duration-200 touch-manipulation
        ${isSpeaker
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
        }
      `}
      title={isSpeaker ? '갤러리 보기로 전환' : '발표자 보기로 전환'}
      type="button"
    >
      {isSpeaker ? (
        <>
          <LayoutGrid className="w-3.5 h-3.5" />
          {!isMobile && <span>갤러리 보기</span>}
        </>
      ) : (
        <>
          <Monitor className="w-3.5 h-3.5" />
          {!isMobile && <span>발표자 보기</span>}
        </>
      )}
    </button>
  );
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

  // ── 레이아웃 상태 ──────────────────────────────────────────
  const [layout, setLayout] = useState('speaker'); // 'speaker' | 'gallery'
  const [isMobileView, setIsMobileView] = useState(false);

  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleToggleLayout = useCallback(() => {
    setLayout(prev => prev === 'speaker' ? 'gallery' : 'speaker');
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

  // ── reactions: id, emoji, username, index ─────────────────
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
    cleanup: cleanupWebRTC,
  } = useSFU({ wsRef, roomId });

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
      // FIX-3: 복잡한 직접 초기화 로직 제거.
      // fetchRoomDetails()로 participant_status를 'approved'로 갱신하면
      // FIX-2의 SFU 초기화 useEffect가 자동으로 트리거됨.
      // FIX-4: WS가 이미 연결된 경우에도 wsReady를 확인하고 강제 세트.
      case 'approval_notification': {
        RD('03', `approval_notification 수신`, {
          room_id: data.room_id,
          participant_user_id: data.participant_user_id,
          approved: data.approved,
        });

        // room_id / user_id 검증
        if (String(data.room_id) !== String(roomId)) {
          RDW('03', `room_id 불일치 — 무시 (data="${data.room_id}" current="${roomId}")`);
          break;
        }
        if (String(data.participant_user_id) !== String(user?.id)) {
          RDW('03', `participant_user_id 불일치 — 무시`);
          break;
        }

        RD('03', `[Step 1] fetchRoomDetails 호출 — participant_status 갱신`);
        fetchRoomDetails().then(() => {
          RD('03', `[Step 1] fetchRoomDetails OK`);

          // FIX-4: WS는 연결돼 있지만 wsReady가 false인 경우 강제 세트
          if (wsRef.current?.readyState === WebSocket.OPEN && wsRef.current?._wsReady) {
            RD('03', `[Step 2] WS 이미 준비됨 — wsReady 강제 세트`);
            setWsReady(true);
          }
        }).catch(e => {
          RDE('03', `fetchRoomDetails 실패:`, e.message);
        });
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
        if (error.name === 'NotAllowedError')       alert('📱 iOS 권한 설정이 필요합니다.\n\n설정 > Safari > 카메라/마이크');
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
  // FIX-1: 초기 연결 — 승인된 참가자 & 방장
  // 원래: isApproved && !wsConnected && !wsRef.current && !localStreamReady
  // 수정: !localStreamReady 조건 제거 → 미디어 초기화와 WS 연결 분리
  //       미디어가 이미 있어도 WS가 없으면 연결 시도
  // ==========================================================
  useEffect(() => {
    if (!room || !user) return;

    const isApproved = room.participant_status === 'approved' || room.is_host;
    RD('04', `초기 연결 useEffect — isApproved=${isApproved} wsConnected=${wsConnected} localStreamReady=${localStreamReady} is_host=${room.is_host}`);

    // FIX-1: !localStreamReady 조건 제거
    // 미디어 준비 여부와 관계없이, 승인됐고 WS가 없으면 초기화 진행
    if (isApproved && !wsConnected && !wsRef.current) {
      const initialize = async () => {
        try {
          // 미디어가 없는 경우에만 초기화
          if (!localStreamReady) {
            RD('05', '미디어 초기화 시작 (초기 연결)');
            await initializeMedia();
            await new Promise(r => setTimeout(r, 300));
          } else {
            RD('05', '미디어 이미 준비됨 — skip 미디어 초기화');
            // 로컬 비디오 엘리먼트에 스트림 재연결 (혹시 누락된 경우)
            if (localVideoRef.current && localStreamRef.current && !localVideoRef.current.srcObject) {
              localVideoRef.current.srcObject = localStreamRef.current;
            }
          }
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
    localStreamRef,
  ]);

  // ==========================================================
  // FIX-2: SFU 초기화 useEffect — 방장 + 승인된 참가자 공통
  //
  // 원래: room?.is_host 가 false면 무조건 skip (참가자 차단)
  // 수정: is_host OR participant_status==='approved' 이면 진행
  //       → 참가자가 wsReady=true + localStreamReady=true 가 되는 순간
  //         자동으로 initSFU() → startProducing() 실행
  //
  // 이 useEffect가 트리거되는 두 가지 경로:
  //   경로 A) WS approval_notification → fetchRoomDetails() → participant_status 갱신
  //           → deps 변경 → 이 effect 재실행
  //   경로 B) HTTP 폴링으로 participant_status='approved' 감지
  //           → fetchRoomDetails() → deps 변경 → 이 effect 재실행
  // ==========================================================
  const sfuInitializedRef = useRef(false);

  useEffect(() => {
    if (!room || !user) return;

    // FIX-2: 방장 OR 승인된 참가자
    const isApproved = room.is_host || room.participant_status === 'approved';

    RD('04', `SFU useEffect check — is_host=${room?.is_host} participant_status=${room?.participant_status} isApproved=${isApproved} wsReady=${wsReady} localStreamReady=${localStreamReady} sfuInitialized=${sfuInitializedRef.current}`);

    if (!isApproved)               { RDW('04', '미승인 — skip'); return; }
    if (!wsReady)                  { RDW('04', 'wsReady=false — skip (아직 WS 준비 안됨)'); return; }
    if (!localStreamReady)         { RDW('04', 'localStreamReady=false — skip (미디어 준비 안됨)'); return; }
    if (sfuInitializedRef.current) { RDW('04', '이미 초기화됨 — skip'); return; }

    sfuInitializedRef.current = true;

    const initSFUForUser = async () => {
      try {
        if (room.is_host) {
          RD('04', '👑 방장 initSFU 시작');
        } else {
          RD('04', '👤 참가자 initSFU 시작');
        }

        await initSFU();
        RD('04', 'initSFU OK → startProducing 시작');
        await startProducing(localStreamRef.current);
        RD('04', `✅ SFU 초기화 완료 (${room.is_host ? '방장' : '참가자'})`);

      } catch (e) {
        RDE('04', '❌ SFU 초기화 실패:', e.message);
        sfuInitializedRef.current = false;
      }
    };

    initSFUForUser();
  }, [
    room?.is_host,
    room?.participant_status, // FIX-2: 참가자 status 변경 감지
    user,
    wsReady,
    localStreamReady,
    initSFU,
    startProducing,
    localStreamRef,
  ]);

  // ── 승인 대기 폴링 ─────────────────────────────────────────
  // 폴링 간격을 3000ms → 1500ms로 단축하여 승인 감지 지연 최소화
  useEffect(() => {
    if (!room || !user) return;
    if (room.is_host || room.participant_status !== 'pending') return;

    let pollCount = 0;
    const maxPolls = 120; // 1500ms × 120 = 3분

    const pollInterval = setInterval(async () => {
      pollCount++;
      try {
        const updated = await fetchRoomDetails();
        if (updated?.participant_status === 'approved') {
          RD('04', '✅ 폴링으로 승인 감지 — clearInterval');
          clearInterval(pollInterval);
          // fetchRoomDetails()가 room state를 업데이트하므로
          // FIX-2 useEffect가 자동으로 트리거됨
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
          else pollCount = 0; // 재시작
        }
      } catch (_) {}
    }, 1500); // FIX: 3000ms → 1500ms

    return () => clearInterval(pollInterval);
  }, [room?.participant_status, room?.is_host, user, fetchRoomDetails, navigate]);

  useEffect(() => { if (showChatPanel) setUnreadChatCount(0); }, [showChatPanel]);

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
    <div className="h-screen overflow-hidden bg-gray-900 flex flex-col">

      <div className="flex-shrink-0">
        <RoomHeader
          title={room.title}
          participantCount={allVideos.length}
          connectionStatus={connectionStatus}
          isHost={room.is_host}
          pendingCount={pendingRequests.length}
          onTogglePendingPanel={() => setShowPendingPanel(!showPendingPanel)}
        />
      </div>

      {/* 진단 상태 바 */}
      <div className="flex-shrink-0 bg-gray-800 text-xs text-gray-300 px-4 py-1.5 flex flex-wrap gap-x-4 gap-y-1 border-b border-gray-700">
        <span>WS: <b className={wsConnected ? 'text-green-400' : 'text-red-400'}>{wsConnected ? '연결' : '끊김'}</b></span>
        <span>Ready: <b className={wsReady ? 'text-green-400' : 'text-yellow-400'}>{wsReady ? '준비' : '대기'}</b></span>
        <span>Media: <b className={localStreamReady ? 'text-green-400' : 'text-red-400'}>{localStreamReady ? 'OK' : '없음'}</b></span>
        <span>SFU: <b className={connectionStatus === 'connected' ? 'text-green-400' : connectionStatus === 'failed' ? 'text-red-400' : 'text-yellow-400'}>{connectionStatus}</b></span>
        <span>상대방: <b className={remoteStreams.size > 0 ? 'text-green-400' : 'text-red-400'}>{remoteStreams.size}명</b></span>
        <span>VideoCards: <b className="text-white">{allVideos.length}</b></span>
        <span>SFU Init: <b className="text-gray-400">{sfuInitializedRef.current ? '완료' : '대기'}</b></span>
        <span>Role: <b className="text-blue-400">{room.is_host ? '방장' : `참가자(${room.participant_status})`}</b></span>
      </div>

      {room.is_host && showPendingPanel && (
        <div className="flex-shrink-0">
          <PendingRequestsPanel
            requests={pendingRequests}
            onApprove={approveParticipant}
            onReject={rejectParticipant}
            onClose={() => setShowPendingPanel(false)}
          />
        </div>
      )}

      {/* 비디오 그리드 */}
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

      {/* 하단 컨트롤 바 */}
      <div className="flex-shrink-0 bg-gray-800 border-t border-gray-700 px-3 md:px-6 py-2 md:py-3">
        <div className="flex justify-between items-center gap-2">
          {/* 좌측: 레이아웃 전환 버튼 */}
          <div className="flex items-center">
            {allVideos.length >= 3 && (
              <LayoutToggleButton
                layout={layout}
                onToggle={handleToggleLayout}
                isMobile={isMobileView}
              />
            )}
          </div>

          {/* 가운데: 미디어 컨트롤 */}
          <div className="flex items-center gap-2 md:gap-4">
            <ControlBar
              isMicOn={isMicOn}
              isVideoOn={isVideoOn}
              onToggleMic={handleToggleMic}
              onToggleVideo={handleToggleVideo}
              onLeave={handleLeave}
            />
          </div>

          {/* 우측: 채팅/반응/손들기 */}
          <div className="flex items-center gap-1.5 md:gap-2">
            <ChatToggleButton onClick={() => setShowChatPanel(!showChatPanel)} unreadCount={unreadChatCount} />
            <ReactionsButton onSendReaction={handleSendReaction} />
            <RaiseHandButton isHandRaised={isHandRaised} onRaise={handleRaiseHand} onLower={handleLowerHand} />
          </div>
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