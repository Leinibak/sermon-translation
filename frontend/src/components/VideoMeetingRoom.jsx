// frontend/src/components/VideoMeetingRoom.jsx (완전 수정 버전)
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
    removeRemoteStream,  
    approveParticipant,
    rejectParticipant,
    leaveRoom,
    endMeeting,
  } = useVideoMeetingAPI(roomId);

  // =========================================================================
  // WebSocket State
  // =========================================================================
  const [ws, setWs] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsReady, setWsReady] = useState(false); // ⭐ 추가: 완전히 준비된 상태
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const wsRef = useRef(null); // ⭐ 추가: 최신 ws 참조

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
  const messageIdsRef = useRef(new Set()); // ⭐ 추가: 메시지 중복 방지

  // 반응
  const [reactions, setReactions] = useState([]);
  
  // 손들기
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState([]);

  const localVideoRef = useRef(null);
  const initializationRef = useRef(false); // ⭐ 추가: 초기화 중복 방지

  // =========================================================================
  // WebRTC Signal 전송 함수
  // =========================================================================
  const sendWebRTCSignal = useCallback((toPeerId, type, payload = {}) => {
    const currentWs = wsRef.current;
    
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket 연결 없음 (readyState:', currentWs?.readyState, ')');
      return false;
    }

    const message = {
      type,
      to_user_id: toPeerId,
      from_user_id: user?.username,
      ...payload
    };

    try {
      console.log(`📤 WebSocket 시그널 전송: ${type} → ${toPeerId}`);
      currentWs.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('❌ 시그널 전송 실패:', error);
      return false;
    }
  }, [user]);

  // =========================================================================
  // WebRTC Hook
  // =========================================================================
  const {
    localStreamRef,
    remoteStreams,
    connectionStatus,
    createPeerConnection,  // ⭐ 추가
    getLocalMedia,
    handleWebSocketSignal,
    cleanup: cleanupWebRTC,
  } = useWebRTC(roomId, user, room?.is_host, sendWebRTCSignal);

  // =========================================================================
  // 채팅 메시지 처리 (중복 방지 개선)
  // =========================================================================
  const addChatMessage = useCallback((message) => {
    const messageId = message.message_id || message.id;
    
    if (!messageId) {
      console.warn('⚠️ 메시지 ID 없음:', message);
      return;
    }

    // 중복 체크
    if (messageIdsRef.current.has(messageId)) {
      console.log('⚠️ 중복 메시지 무시:', messageId);
      return;
    }

    // 추가
    messageIdsRef.current.add(messageId);
    
    setChatMessages(prev => {
      // 이미 있는지 한번 더 확인
      if (prev.some(msg => (msg.message_id || msg.id) === messageId)) {
        return prev;
      }
      
      return [...prev, {
        id: messageId,
        message_id: messageId,
        sender_username: message.sender || message.sender_username,
        sender_id: message.sender_id,
        content: message.content,
        created_at: message.created_at || new Date().toISOString(),
        is_mine: message.is_mine || message.sender_username === user?.username
      }];
    });
    
    // 스크롤 하단 이동
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [user]);

  // =========================================================================
  // ⭐⭐⭐ WebSocket 연결 개선
  // =========================================================================
   const connectWebSocket = useCallback(() => {
    if (!roomId || !user || roomId === 'undefined') {
      console.error('❌ roomId 또는 user 없음');
      return;
    }

    // ⭐ 기존 연결 정리 개선
    if (wsRef.current) {
      const currentState = wsRef.current.readyState;
      console.log(`⚠️ 기존 WebSocket 상태: ${currentState}`);
      
      if (currentState === WebSocket.OPEN || currentState === WebSocket.CONNECTING) {
        console.log('⚠️ 이미 연결 중 - 기존 연결 유지');
        return;
      }
      
      try {
        wsRef.current.close(1000, 'Reconnecting');
      } catch (e) {
        console.error('연결 종료 오류:', e);
      }
      wsRef.current = null;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('🔌 WebSocket 연결 시작');
    console.log(`   Room: ${roomId}`);
    console.log(`   User: ${user.username}`);
    console.log(`${'='.repeat(60)}\n`);

    const isHttps = window.location.protocol === 'https:';
    const wsProtocol = isHttps ? 'wss' : 'ws';
    
    const token = localStorage.getItem('access_token');
    
    if (!token) {
      console.error('❌ 인증 토큰 없음');
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }
    
    const wsUrl = `${wsProtocol}://${window.location.host}/ws/video-meeting/${roomId}/?token=${token}`;

    try {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      // ⭐ 연결 타임아웃 설정 (모바일 중요)
      const connectionTimeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          console.error('❌ WebSocket 연결 타임아웃');
          socket.close();
          
          // 재연결 시도
          if (reconnectAttemptsRef.current < 3) {
            reconnectAttemptsRef.current += 1;
            console.log(`🔄 재연결 시도 ${reconnectAttemptsRef.current}/3`);
            setTimeout(() => connectWebSocket(), 2000);
          }
        }
      }, 10000); // ⭐ 10초 타임아웃

      socket.onopen = () => {
        console.log('✅ WebSocket 연결 성공');
        clearTimeout(connectionTimeout);
        setWsConnected(true);
        reconnectAttemptsRef.current = 0;

        // ⭐ Join 메시지 전송 개선 (더 긴 대기)
        setTimeout(() => {
          if (socket.readyState === WebSocket.OPEN) {
            try {
              socket.send(JSON.stringify({
                type: 'join',
                username: user.username
              }));
              console.log('📤 Join 메시지 전송 완료');
              
              // ⭐ 추가 대기 후 완전 준비
              setTimeout(() => {
                setWsReady(true);
                console.log('✅ WebSocket 완전 준비됨');
              }, 1500); // ⭐ 1.5초로 증가
            } catch (e) {
              console.error('❌ Join 메시지 전송 실패:', e);
            }
          }
        }, 1000); // ⭐ 1초 대기
      };
          
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 WebSocket 메시지:', data.type);

          // ⭐⭐⭐ WebRTC 시그널 처리
          if (['offer', 'answer', 'ice_candidate'].includes(data.type)) {
            handleWebSocketSignal(data);
            return;
          }

          // ⭐⭐⭐ user_joined 처리 (중요!)
          if (data.type === 'user_joined') {
            console.log(`👋 ${data.username}님이 입장했습니다`);
            
            // 참가자 목록 갱신
            fetchRoomDetails();
            
            // ⭐ 방장: 신규 참가자와 연결 생성
            if (room?.is_host) {
              console.log(`👑 방장이 신규 참가자 감지: ${data.username}`);
              console.log(`🎬 Offer 생성 준비...`);
              
              setTimeout(() => {
                console.log(`🔧 Peer Connection 생성 (Initiator): ${data.username}`);
                if (typeof createPeerConnection === 'function') {
                  createPeerConnection(data.username, true);
                } else {
                  console.error('❌ createPeerConnection 함수 없음');
                }
              }, 1500);
            }
            // ⭐ 참가자: 방장과 연결 생성 (비-Initiator)
            else if (data.username !== user?.username) {
              console.log(`👤 참가자 모드: ${data.username} 입장 감지`);
              
              // 방장이 아니고, 입장한 사람도 자신이 아닌 경우
              // (다른 참가자가 먼저 입장했을 수 있음)
              setTimeout(() => {
                console.log(`🔧 다른 참가자와 Peer Connection 준비`);
                // 방장이 Offer를 보낼 때까지 대기
              }, 1000);
            }
            return;
          }

          // user_left 처리
          if (data.type === 'user_left') {
            console.log(`👋 ${data.username}님이 퇴장했습니다`);
            removeRemoteStream(data.username);
            return;
          }

          // participants_list 처리
          if (data.type === 'participants_list') {
            console.log('📋 참가자 목록:', data.participants);
            return;
          }

          // 채팅 메시지
          if (data.type === 'chat_message') {
            addChatMessage(data);
            return;
          }

          // 반응
          if (data.type === 'reaction') {
            const reactionId = Date.now() + Math.random();
            setReactions(prev => [...prev, {
              id: reactionId,
              emoji: data.reaction,
              username: data.username
            }]);
            setTimeout(() => {
              setReactions(prev => prev.filter(r => r.id !== reactionId));
            }, 3000);
            return;
          }

          // 손들기
          if (data.type === 'hand_raise') {
            if (data.action === 'raise') {
              setRaisedHands(prev => {
                if (prev.some(h => h.username === data.username)) return prev;
                return [...prev, {
                  username: data.username,
                  user_id: data.user_id,
                  raised_at: new Date().toISOString()
                }];
              });
            } else if (data.action === 'lower') {
              setRaisedHands(prev => prev.filter(h => h.username !== data.username));
            }
            return;
          }

          // ⭐⭐⭐ 승인 알림 처리 (완전 수정)
          if (data.type === 'approval_notification') {
            console.log('\n' + '='.repeat(60));
            console.log('🎉🎉🎉 참가 승인 알림 수신!');
            console.log('   Message:', data.message);
            console.log('   Room ID:', data.room_id);
            console.log('   Host:', data.host_username);
            console.log('   My Username:', user.username);
            console.log('='.repeat(60) + '\n');
            
            // ⭐ 1단계: 즉시 승인 처리 함수 호출
            handleApprovalReceived(data, socket);
            
            return;
          }

          // ⭐⭐⭐ 새로 추가: 방장이 새 참가자 감지
          if (data.type === 'new_participant_approved') {
            console.log(`👑 방장: 새 참가자 승인됨 - ${data.participant_username}`);
            
            // 참가자 목록 갱신
            fetchRoomDetails();
            
            // ⭐ 중요: 약간의 대기 후 Peer Connection 생성
            setTimeout(() => {
              if (typeof createPeerConnection === 'function') {
                console.log(`🔧 Peer Connection 생성 (방장 → ${data.participant_username})`);
                createPeerConnection(data.participant_username, true);
              }
            }, 2000); // ⭐ 2초 대기 (참가자가 준비될 시간)
            
            return;
          }

          // 거부 알림
          if (data.type === 'rejection_notification') {
            console.log('❌ 참가 거부됨');
            alert('참가가 거부되었습니다.');
            navigate('/video-meetings');
            return;
          }

          // 참가 요청 알림 (방장용)
          if (data.type === 'join_request_notification') {
            console.log('📢 새 참가 요청:', data.username);
            fetchPendingRequests();
            return;
          }

          // 회의 종료
          if (data.type === 'meeting_ended') {
            console.log('🛑 회의 종료됨');
            alert(data.message);
            navigate('/video-meetings');
            return;
          }

          console.log('⚠️ 처리되지 않은 메시지 타입:', data.type);
          
        } catch (e) {
          console.error('❌ 메시지 처리 오류:', e);
        }
      };
    
      socket.onerror = (error) => {
        console.error('❌ WebSocket 오류:', error);
        clearTimeout(connectionTimeout);
      };

      socket.onclose = (event) => {
        console.log('🔌 WebSocket 연결 종료 (code:', event.code, ')');
        clearTimeout(connectionTimeout);
        setWsConnected(false);
        setWsReady(false);
        wsRef.current = null;

        // 인증 실패 시 로그인 페이지로
        if (event.code === 4001) {
          console.error('❌ 인증 실패 - 로그인 필요');
          alert('인증이 만료되었습니다. 다시 로그인해주세요.');
          navigate('/login');
          return;
        }

        // ⭐ 정상 종료가 아닌 경우만 재연결 (더 공격적)
        if (event.code !== 1000 && event.code !== 1001) {
          if (reconnectAttemptsRef.current < 5) {
            reconnectAttemptsRef.current += 1;
            const delay = Math.min(1000 * reconnectAttemptsRef.current, 5000); // ⭐ 최대 5초
            console.log(`🔄 재연결 시도 ${reconnectAttemptsRef.current}/5 (${delay}ms 후)`);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              connectWebSocket();
            }, delay);
          } else {
            console.error('❌ 최대 재연결 횟수 초과');
            alert('서버 연결이 불안정합니다. 페이지를 새로고침해주세요.');
          }
        }
      };

      setWs(socket);
    } catch (error) {
      console.error('❌ WebSocket 생성 실패:', error);
      clearTimeout(connectionTimeout);
    }
  }, [roomId, user, navigate, fetchRoomDetails, fetchPendingRequests, addChatMessage]);
  
  // ⭐⭐⭐ 승인 처리 전용 함수 (새로 추가)
  const handleApprovalReceived = async (data, socket) => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 승인 후 초기화 시작');
    console.log('='.repeat(60) + '\n');
    
    try {
      // 1단계: UI 상태 즉시 업데이트
      setRoom(prev => {
        console.log('✅ 1단계: Room 상태 업데이트 (pending → approved)');
        return {
          ...prev,
          participant_status: 'approved'
        };
      });
      
      // 2단계: 짧은 대기 (상태 업데이트 반영)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 3단계: 미디어 초기화
      console.log('🎥 2단계: 미디어 초기화 시작');
      
      if (!localStreamRef.current) {
        try {
          await initializeMedia();
          console.log('✅ 미디어 초기화 완료');
        } catch (error) {
          console.error('❌ 미디어 초기화 실패:', error);
          alert('카메라/마이크 접근에 실패했습니다.\n\n페이지를 새로고침해주세요.');
          return;
        }
      } else {
        console.log('✅ 미디어 이미 준비됨');
      }
      
      // 4단계: 짧은 대기
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 5단계: 방 정보 갱신
      console.log('📋 3단계: 방 정보 갱신');
      const updatedRoom = await fetchRoomDetails();
      console.log('✅ 방 정보 갱신 완료');
      console.log('   Status:', updatedRoom.participant_status);
      
      // 6단계: 약간 더 대기 (방 정보 반영)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 7단계: Join 메시지 전송
      if (socket.readyState === WebSocket.OPEN) {
        console.log('📤 4단계: Join 메시지 전송');
        
        socket.send(JSON.stringify({
          type: 'join',
          username: user.username
        }));
        
        console.log('✅ Join 메시지 전송 완료');
        
        // ⭐ 8단계: WebSocket Ready 상태 설정
        setTimeout(() => {
          setWsReady(true);
          console.log('✅ WebSocket 완전 준비됨');
        }, 500);
        
      } else {
        console.warn('⚠️ WebSocket 연결 상태 이상:', socket.readyState);
        console.log('🔄 WebSocket 재연결 시도');
        
        // WebSocket 재연결
        setTimeout(() => {
          connectWebSocket();
        }, 1000);
      }
      
      console.log('\n' + '='.repeat(60));
      console.log('🎉 승인 후 초기화 완료!');
      console.log('='.repeat(60) + '\n');
      
    } catch (error) {
      console.error('\n' + '='.repeat(60));
      console.error('❌ 승인 후 초기화 실패:', error);
      console.error('='.repeat(60) + '\n');
      
      alert(
        '초기화에 실패했습니다.\n\n' +
        '페이지를 새로고침(F5)해주세요.'
      );
    }
  };

  // =========================================================================
  // Media Initialization
  // =========================================================================
  const initializeMedia = useCallback(async () => {
    if (initializationRef.current) {
      console.log('⚠️ 이미 초기화 중...');
      return;
    }

    try {
      initializationRef.current = true;
      console.log('🎥 미디어 초기화 시작');
      
      const stream = await getLocalMedia();
      
      if (localVideoRef.current && stream) {
        localVideoRef.current.srcObject = stream;
        console.log('✅ 로컬 비디오 설정 완료');
      }
    } catch (error) {
      console.error('❌ 미디어 초기화 실패:', error);
      alert('카메라와 마이크 접근 권한이 필요합니다.');
    } finally {
      initializationRef.current = false;
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
      
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [roomId, navigate, fetchRoomDetails, cleanupWebRTC]);

  // 2. 승인 후 초기화 (개선 버전)
  // ⭐⭐⭐ Effect 2: 초기 연결 (방장 또는 이미 승인된 경우만)
  useEffect(() => {
    if (!room || !user) return;

    const isApproved = room.participant_status === 'approved' || room.is_host;
    
    // ⭐ 조건 단순화: 승인되었고, WebSocket도 없고, 미디어도 없으면 초기화
    if (isApproved && !wsConnected && !wsRef.current && !localStreamRef.current) {
      console.log('\n' + '='.repeat(60));
      console.log('✅ 초기 연결 조건 충족');
      console.log('   Is Approved:', isApproved);
      console.log('   Is Host:', room.is_host);
      console.log('   Status:', room.participant_status);
      console.log('='.repeat(60) + '\n');
      
      const initialize = async () => {
        try {
          // 1. 미디어 먼저
          console.log('🎥 미디어 초기화');
          await initializeMedia();
          
          // 2. 약간 대기
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // 3. WebSocket 연결
          console.log('🔌 WebSocket 연결');
          connectWebSocket();
          
          console.log('✅ 초기화 완료');
        } catch (error) {
          console.error('❌ 초기화 실패:', error);
        }
      };
      
      initialize();
    }

    // ⭐ 방장 전용: 대기 요청 폴링
    if (room.is_host && isApproved && wsReady) {
      console.log('👑 방장 모드: 대기 요청 폴링 시작');
      fetchPendingRequests();
      const interval = setInterval(fetchPendingRequests, 3000);
      return () => clearInterval(interval);
    }
  }, [
    room?.participant_status, 
    room?.is_host, 
    user, 
    wsConnected, 
    wsReady, 
    initializeMedia, 
    connectWebSocket, 
    fetchPendingRequests
  ]);

  // 3. 채팅 초기 로드 (수정)
  useEffect(() => {
    if (showChatPanel && chatMessages.length === 0 && !chatLoading && wsReady) {
      console.log('📥 채팅 기록 로드...');
      // WebSocket을 통한 실시간만 사용하므로 초기 로드 생략 가능
      // 필요시 fetchChatMessages() 호출
    }
  }, [showChatPanel, chatMessages.length, chatLoading, wsReady]);

  // =========================================================================
  // Handlers
  // =========================================================================

  const handleToggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isMicOn;
        setIsMicOn(!isMicOn);
        console.log('🎤 마이크:', !isMicOn ? 'ON' : 'OFF');
      }
    }
  };

  const handleToggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoOn;
        setIsVideoOn(!isVideoOn);
        console.log('📹 비디오:', !isVideoOn ? 'ON' : 'OFF');
      }
    }
  };

  const handleLeave = async () => {
    if (room.is_host) {
      const confirmEnd = window.confirm(
        '회의를 종료하시겠습니까?\n\n"확인"을 선택하면 모든 참가자가 자동으로 퇴장됩니다.\n"취소"를 선택하면 나만 나갑니다.'
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
        if (wsRef.current) {
          wsRef.current.close(1000, 'User leaving');
        }
        navigate('/video-meetings');
      } catch (error) {
        console.error('❌ 나가기 실패:', error);
        navigate('/video-meetings');
      }
    } else {
      try {
        await leaveRoom();
        cleanupWebRTC();
        if (wsRef.current) {
          wsRef.current.close(1000, 'User leaving');
        }
        navigate('/video-meetings');
      } catch (error) {
        console.error('❌ 나가기 실패:', error);
        navigate('/video-meetings');
      }
    }
  };

  const handleSendChatMessage = async (content) => {
    const currentWs = wsRef.current;
    
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 연결이 없습니다');
    }

    try {
      currentWs.send(JSON.stringify({
        type: 'chat',
        content: content
      }));
      
      console.log('💬 채팅 전송:', content.substring(0, 30));
    } catch (error) {
      console.error('❌ 채팅 전송 실패:', error);
      throw error;
    }
  };

  const handleSendReaction = async (emoji) => {
    const currentWs = wsRef.current;
    
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket 연결 없음');
      return;
    }

    try {
      currentWs.send(JSON.stringify({
        type: 'reaction',
        reaction_type: emoji
      }));
    } catch (error) {
      console.error('❌ 반응 전송 실패:', error);
    }
  };

  const handleRaiseHand = async () => {
    const currentWs = wsRef.current;
    
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket 연결 없음');
      return;
    }

    try {
      currentWs.send(JSON.stringify({
        type: 'raise_hand'
      }));
      setIsHandRaised(true);
    } catch (error) {
      console.error('❌ 손들기 실패:', error);
    }
  };

  const handleLowerHand = async () => {
    const currentWs = wsRef.current;
    
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket 연결 없음');
      return;
    }

    try {
      currentWs.send(JSON.stringify({
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
        <p className="text-gray-400 mb-6">방장이 승인하면 자동으로 회의에 참가됩니다.</p>
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

      {/* 연결 상태 표시 (개발 모드) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-gray-800 text-xs text-gray-400 px-4 py-2 flex gap-4">
          <span>WS: {wsConnected ? '🟢' : '🔴'} {wsConnected ? 'Connected' : 'Disconnected'}</span>
          <span>Ready: {wsReady ? '🟢' : '🟡'} {wsReady ? 'Ready' : 'Initializing'}</span>
          <span>Media: {localStreamRef.current ? '🟢' : '🔴'}</span>
          <span>Remote: {remoteStreams.length}</span>
        </div>
      )}

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