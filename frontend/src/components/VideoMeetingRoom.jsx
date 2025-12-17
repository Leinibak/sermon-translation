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

  const peerConnections = useRef({}); // 각 참가자별 RTCPeerConnection 객체를 저장
  
  // =========================================================================
  // UI States
  // =========================================================================
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [showPendingPanel, setShowPendingPanel] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0); // ⭐ 추가

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
      to_username: toPeerId,
      from_username: user?.username,
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
    
    // ⭐ 채팅창이 닫혀있고, 내가 보낸 메시지가 아니면 읽지 않은 카운트 증가
    if (!showChatPanel && message.sender_username !== user?.username) {
      setUnreadChatCount(prev => prev + 1);
    }
    
    // 스크롤 하단 이동
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [user, showChatPanel]);

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

      // ============================================================================
      // socket.onmessage 전체 수정 버전
      // ============================================================================ 
      // ⭐⭐⭐ socket.onmessage 개선 버전
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 WebSocket:', data.type);

          // ============================================================
          // WebRTC 시그널 (최우선 처리)
          // ============================================================
          if (['offer', 'answer', 'ice_candidate'].includes(data.type)) {
            handleWebSocketSignal(data);
            return;
          }
          
          // ============================================================
          // 승인 알림
          // ============================================================
          if (data.type === 'approval_notification') {
            console.log('🎉 참가 승인!');
            
            // 방 ID 검증
            if (data.room_id !== roomId) {
              console.error('❌ 방 ID 불일치');
              return;
            }
            
            // 사용자 ID 검증
            if (String(data.participant_user_id) !== String(user?.id)) {
              console.log('⚠️ 다른 사용자의 승인');
              return;
            }
            
            // ⭐ 승인 후 초기화 (순차 실행)
            setTimeout(async () => {
              try {
                // 1. 미디어 초기화
                if (!localStreamRef.current) {
                  await getLocalMedia();
                  if (localVideoRef.current && localStreamRef.current) {
                    localVideoRef.current.srcObject = localStreamRef.current;
                  }
                }
                
                await new Promise(r => setTimeout(r, 800));
                
                // 2. 방 정보 갱신
                await fetchRoomDetails();
                
                await new Promise(r => setTimeout(r, 500));
                
                // 3. join_ready 전송
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify({
                    type: 'join_ready',
                    from_username: user.username,
                    to_username: data.host_username,
                    room_id: roomId
                  }));
                  console.log('✅ join_ready 전송');
                  
                  setTimeout(() => setWsReady(true), 500);
                }
              } catch (error) {
                console.error('❌ 초기화 실패:', error);
                alert('초기화 실패. 페이지를 새로고침해주세요.');
              }
            }, 1000);
            
            return;
          }

          // ============================================================
          // user_joined (참가자 입장 알림)
          // ============================================================
          if (data.type === 'user_joined') {
            console.log(`👋 user_joined: ${data.username}`);

            // ⭐ 방장만 처리
            if (room?.is_host && data.username !== user.username) {
              console.log('👑 방장: 새 참가자 감지');
              
              // ⭐⭐⭐ 중요: join_ready를 기다리지 말고 바로 시작
              // 참가자가 준비되었다고 가정하고 연결 시도
              setTimeout(() => {
                if (localStreamRef.current) {
                  console.log('🎬 PeerConnection 생성 시작');
                  createPeerConnection(data.username, true);
                } else {
                  console.warn('⚠️ 로컬 미디어 없음 - 잠시 후 재시도');
                  setTimeout(() => {
                    if (localStreamRef.current) {
                      createPeerConnection(data.username, true);
                    }
                  }, 1000);
                }
              }, 800); // ⭐ 약간의 대기 시간
            }

            return;
          }

          // ============================================================
          // join_ready (방장만 처리)
          // ============================================================
          if (data.type === 'join_ready') {
            console.log(`📥 join_ready from ${data.from_username}`);

            if (!room?.is_host) {
              console.log('⚠️ 방장이 아님');
              return;
            }

            const peerUsername = data.from_username;

            // 이미 연결 중이면 무시
            if (peerConnections.current[peerUsername]) {
              const state = peerConnections.current[peerUsername].connectionState;
              
              if (state === 'connected' || state === 'connecting') {
                console.warn(`⚠️ 이미 연결 중: ${state}`);
                return;
              }
              
              // Failed 상태면 정리
              console.log('🗑️ 기존 연결 정리');
              try {
                peerConnections.current[peerUsername].close();
              } catch (e) {}
              delete peerConnections.current[peerUsername];
            }

            // 미디어 확인
            if (!localStreamRef.current) {
              console.error('❌ 로컬 미디어 없음');
              return;
            }

            // ⭐ Peer Connection 생성
            setTimeout(() => {
              console.log('🎬 join_ready → PeerConnection 생성');
              createPeerConnection(peerUsername, true);
            }, 500);

            return;
          }

          // ============================================================
          // user_left
          // ============================================================
          if (data.type === 'user_left') {
            console.log(`👋 ${data.username} 퇴장`);
            removeRemoteStream(data.username);
            return;
          }

          // ============================================================
          // 채팅
          // ============================================================
          if (data.type === 'chat_message') {
            addChatMessage(data);
            return;
          }

          // ============================================================
          // 반응
          // ============================================================
          if (data.type === 'reaction') {
            const id = Date.now() + Math.random();
            setReactions(prev => [...prev, {
              id,
              emoji: data.reaction,
              username: data.username
            }]);
            setTimeout(() => {
              setReactions(prev => prev.filter(r => r.id !== id));
            }, 3000);
            return;
          }

          // ============================================================
          // 손들기
          // ============================================================
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
            } else {
              setRaisedHands(prev => prev.filter(h => h.username !== data.username));
            }
            return;
          }

          // ============================================================
          // 거부
          // ============================================================
          if (data.type === 'rejection_notification') {
            alert('참가가 거부되었습니다.');
            navigate('/video-meetings');
            return;
          }

          // ============================================================
          // 참가 요청 (방장용)
          // ============================================================
          if (data.type === 'join_request_notification') {
            console.log('📢 새 참가 요청');
            fetchPendingRequests();
            return;
          }

          // ============================================================
          // 회의 종료
          // ============================================================
          if (data.type === 'meeting_ended') {
            alert(data.message);
            navigate('/video-meetings');
            return;
          }

          // 처리되지 않은 메시지
          console.log('⚠️ Unknown type:', data.type);
          
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
  }, [roomId, user, navigate, fetchRoomDetails, fetchPendingRequests, addChatMessage, room?.is_host, localStreamRef, createPeerConnection, getLocalMedia, handleWebSocketSignal, removeRemoteStream]);

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
      // ⭐⭐⭐ 방장에게 WebRTC 준비 완료 알림 (가장 중요)
      if (!room?.is_host) {
        console.log('📢 참가자: join_ready 시그널 전송 → 방장');

        sendWebRTCSignal(
          data.host_username, // 방장 username
          'join_ready',
          {}
        );
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
  // 1. 초기 로딩 (변경 없음)
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

  // 2. 승인 후 초기화 + 방장 폴링 (변경 없음)
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

  // 3. 채팅 초기 로드 (변경 없음)
  useEffect(() => {
    if (showChatPanel && chatMessages.length === 0 && !chatLoading && wsReady) {
      console.log('📥 채팅 기록 로드...');
      // WebSocket을 통한 실시간만 사용하므로 초기 로드 생략 가능
      // 필요시 fetchChatMessages() 호출
    }
  }, [showChatPanel, chatMessages.length, chatLoading, wsReady]);

  // ⭐⭐⭐ 4. 새로 추가: 승인 대기 상태 폴링 (WebSocket 실패 대비)
  useEffect(() => {
    if (!room || !user) return;
    
    // ⭐ pending 상태이고, 방장이 아닐 때만 폴링
    const isPending = room.participant_status === 'pending';
    const isNotHost = !room.is_host;
    
    if (isPending && isNotHost) {
      console.log('⏰ 승인 대기 상태 - 폴링 시작 (3초 간격)');
      
      let pollCount = 0;
      const maxPolls = 60; // 최대 3분 (60 * 3초)
      
      const pollInterval = setInterval(async () => {
        pollCount++;
        
        try {
          console.log(`🔄 상태 확인 중... (${pollCount}/${maxPolls})`);
          const updatedRoom = await fetchRoomDetails();
          
          // ⭐ 승인되었으면 폴링 중단
          if (updatedRoom.participant_status === 'approved') {
            console.log('\n' + '='.repeat(60));
            console.log('✅ 폴링: 승인 감지!');
            console.log('='.repeat(60) + '\n');
            
            clearInterval(pollInterval);
            
            // ⭐ 초기화 시작 (Effect 2번이 자동으로 처리하므로 별도 작업 불필요)
            // room 상태가 업데이트되면 Effect 2번이 트리거됨
          }
          
          // ⭐ 거부되었으면 폴링 중단
          if (updatedRoom.participant_status === 'rejected') {
            console.log('❌ 폴링: 참가 거부됨');
            clearInterval(pollInterval);
            alert('참가가 거부되었습니다.');
            navigate('/video-meetings');
          }
          
          // ⭐ 최대 시간 초과
          if (pollCount >= maxPolls) {
            console.log('⏰ 폴링 타임아웃 (3분 경과)');
            clearInterval(pollInterval);
            
            const retry = window.confirm(
              '승인 대기 시간이 초과되었습니다.\n\n' +
              '계속 대기하시겠습니까?'
            );
            
            if (!retry) {
              navigate('/video-meetings');
            }
          }
        } catch (error) {
          console.error('❌ 폴링 오류:', error);
        }
      }, 3000); // 3초마다 확인
      
      return () => {
        console.log('⏰ 폴링 중단');
        clearInterval(pollInterval);
      };
    }
  }, [
    room?.participant_status, 
    room?.is_host, 
    user, 
    fetchRoomDetails, 
    navigate
  ]);

  // ⭐ 채팅창이 열리면 읽지 않은 메시지 카운트 초기화
  useEffect(() => {
    if (showChatPanel) {
      setUnreadChatCount(0);
    }
  }, [showChatPanel]);


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

      {/* 컨트롤 바 (수정됨) */}
      <div className="bg-gray-800 border-t border-gray-700 px-3 md:px-6 py-2 md:py-3 flex justify-center items-center gap-2 md:gap-4">
        <ControlBar
          isMicOn={isMicOn}
          isVideoOn={isVideoOn}
          onToggleMic={handleToggleMic}
          onToggleVideo={handleToggleVideo}
          onLeave={handleLeave}
        />

        <div className="h-6 md:h-8 w-px bg-gray-600 mx-1 md:mx-2" />

        {/* ⭐ unreadCount 전달 */}
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