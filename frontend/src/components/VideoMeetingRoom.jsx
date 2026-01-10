// frontend/src/components/VideoMeetingRoom.jsx (수정본)
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
import { IOSPlayButton } from './VideoMeeting/IOSPlayButton';

// 유틸리티 함수들
const isIOS = () => {
  if (navigator.userAgentData) {
    return navigator.userAgentData.platform === 'iOS';
  }
  
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  
  if (/iPad|iPhone|iPod/.test(userAgent)) {
    return true;
  }
  
  if (
    userAgent.includes('Mac') && 
    'ontouchend' in document &&
    navigator.maxTouchPoints > 0
  ) {
    return true;
  }
  
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

const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

function VideoMeetingRoom() {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // 📱 iOS 재생 버튼 상태
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
  // WebRTC 훅
  // =========================================================================
  const sendWebRTCSignal = useCallback((toUsername, type, payload = {}) => {
    const currentWs = wsRef.current;
    
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket 연결 없음');
      return false;
    }

    const message = {
      type,
      to_username: toUsername,
      from_username: user?.username,
      ...payload
    };

    try {
      console.log(`📤 WebSocket 시그널 전송: ${type}`);
      console.log(`   From: ${user?.username} → To: ${toUsername || 'ALL'}`);
      
      currentWs.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('❌ 시그널 전송 실패:', error);
      return false;
    }
  }, [user]);

  const {
    localStreamRef,
    peerConnections,
    remoteStreams,
    connectionStatus,
    getLocalMedia,
    createPeerConnection,
    handleWebSocketSignal,
    handleTrackStateChange,
    removeRemoteStream,
    cleanup: cleanupWebRTC,
  } = useWebRTC(roomId, user, room?.is_host, sendWebRTCSignal);
  
  const addChatMessage = useCallback((message) => {
    const messageId = message.message_id || message.id;
    
    if (!messageId) {
      console.warn('⚠️ 메시지 ID 없음');
      return;
    }

    if (messageIdsRef.current.has(messageId)) {
      return;
    }

    messageIdsRef.current.add(messageId);
    
    setChatMessages(prev => {
      if (prev.some(msg => (msg.message_id || msg.id) === messageId)) {
        return prev;
      }
      
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

  useEffect(() => {
  // 📱 iOS 커스텀 이벤트 리스너 (VideoElement에서 발송)
    const handleIOSPlayRequired = (event) => {
      console.log('📱 iOS 재생 필요 이벤트 수신:', event.detail);
      
      if (!iosPlayTriggeredRef.current) {
        console.log('📱 IOSPlayButton 표시');
        setShowIOSPlayButton(true);
      }
    };

    // ⭐ 이벤트 리스너 등록
    window.addEventListener('ios-play-required', handleIOSPlayRequired);

    // ⭐ 추가: remoteStreams 변경 감지
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (isIOS && remoteStreams.length > 0) {
      // 모든 원격 비디오 요소의 재생 상태 확인
      setTimeout(() => {
        const videoElements = document.querySelectorAll('video:not([muted])');
        const hasUnplayedVideo = Array.from(videoElements).some(v => {
          return v.paused && v.readyState >= 2; // 데이터는 있지만 재생 안됨
        });
        
        if (hasUnplayedVideo && !iosPlayTriggeredRef.current) {
          console.log('📱 iOS: 재생되지 않은 원격 비디오 감지 → 버튼 표시');
          setShowIOSPlayButton(true);
        }
      }, 1000); // 1초 후 체크
    }

    // ⭐ cleanup 함수
    return () => {
      window.removeEventListener('ios-play-required', handleIOSPlayRequired);
    };
  }, [remoteStreams]);

  // 📱 iOS 재생 트리거
  const handleIOSPlay = useCallback(async () => {
    console.log('🎬 iOS: 수동 재생 트리거');
    
    // 모든 video 요소 찾기
    const videoElements = document.querySelectorAll('video');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const video of videoElements) {
      if (video.srcObject && !video.muted) { // 원격 비디오만
        try {
          console.log('🎬 재생 시도:', {
            paused: video.paused,
            readyState: video.readyState,
            srcObject: !!video.srcObject
          });
          
          await video.play();
          successCount++;
          console.log('✅ iOS: 원격 비디오 재생 성공');
        } catch (error) {
          failCount++;
          console.warn('⚠️ iOS 재생 실패:', error);
        }
      }
    }
    
    console.log(`📊 재생 결과: 성공 ${successCount}, 실패 ${failCount}`);
    
    if (successCount > 0) {
      iosPlayTriggeredRef.current = true;
      setShowIOSPlayButton(false);
    } else if (failCount > 0) {
      alert('비디오 재생에 실패했습니다.\n페이지를 새로고침하고 다시 시도해주세요.');
    }
  }, []);


  // =========================================================================
  // Track 상태 브로드캐스트
  // =========================================================================
  const broadcastTrackState = useCallback((kind, enabled) => {
    const currentWs = wsRef.current;
    
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ WebSocket 연결 없음 - track 상태 전송 불가');
      return;
    }

    try {
      const message = {
        type: 'track_state',
        kind,
        enabled
      };
      
      console.log('📤 Track 상태 브로드캐스트:', message);
      currentWs.send(JSON.stringify(message));
    } catch (error) {
      console.error('❌ Track 상태 전송 실패:', error);
    }
  }, []);

  // =========================================================================
  // ⭐⭐⭐ WebSocket 메시지 핸들러 (핵심 통합)
  // =========================================================================
  const handleWebSocketMessage = useCallback((data) => {
    const type = data.type;
    
    console.log('📨 WebSocket 수신:', type);
    
    // ⭐⭐⭐ iOS 디버깅 로그
    if (isIOS() && ['offer', 'answer', 'ice_candidate', 'join_ready', 'user_joined'].includes(type)) {
      console.log(`📱 [iOS] WebSocket 수신: ${type}`, {
        from: data.from_username || data.username,
        localStream: !!localStreamRef.current,
        wsReady: wsReady,
        peerConnections: Object.keys(peerConnections.current),
        remoteStreams: remoteStreams.length
      });
    } else {
      console.log('📨 WebSocket 수신:', type);
    }
    
    // WebRTC 시그널링 우선 처리
    if (['offer', 'answer', 'ice_candidate'].includes(type)) {
      handleWebSocketSignal(data);
      return;
    }

    // Track 상태 변경
    if (type === 'track_state') {
      handleTrackStateChange(data);
      return;
    }
    
    switch (type) {
      case 'participants_list':
        console.log("📋 참여자:", data.participants);
        break;
      
      // ⭐⭐⭐ 승인 알림 핸들러
      case 'approval_notification': {
        const retryCount = data.retry_count || 0;
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🎉 승인 알림 수신 (재시도: ${retryCount}/2)`);
        console.log(`   Room ID: ${data.room_id}`);
        console.log(`   Target User ID: ${data.participant_user_id}`);
        console.log(`   Current User ID: ${user?.id}`);
        console.log(`   Host Username: ${data.host_username}`);
        console.log(`${'='.repeat(60)}\n`);

        // 중복 처리 방지
        if (String(data.room_id) !== String(roomId)) {
          console.log('⚠️ 다른 방의 알림 - 무시');
          return;
        }

        if (String(data.participant_user_id) !== String(user?.id)) {
          console.log('⚠️ 다른 사용자의 알림 - 무시');
          return;
        }

        if (retryCount > 0) {
          console.log('⚠️ 재전송 알림 - 무시');
          return;
        }

        if (approvalInitializedRef.current) {
          console.log('⚠️ 이미 초기화 진행 중 - 무시');
          return;
        }

        approvalInitializedRef.current = true;

        const initializeAfterApproval = async () => {
          try {
            const isiOS = isIOS();
            
            console.log(`🚀 승인 후 초기화 시작`);
            console.log(`   Platform: ${isiOS ? 'iOS' : 'Other'}`);

            // 1. 미디어 초기화
            if (!localStreamRef.current) {
              console.log('1️⃣ 미디어 초기화 시작');
              
              try {
                await getLocalMedia();
                
                if (localVideoRef.current && localStreamRef.current) {
                  localVideoRef.current.srcObject = localStreamRef.current;
                  
                  if (isiOS) {
                    try {
                      await localVideoRef.current.play();
                      console.log('✅ iOS 로컬 비디오 재생 성공');
                    } catch (playError) {
                      console.warn('⚠️ iOS 자동 재생 실패:', playError);
                    }
                  }
                }
                
                console.log('✅ 미디어 초기화 완료');
              } catch (mediaError) {
                console.error('❌ 미디어 초기화 실패:', mediaError);
                approvalInitializedRef.current = false;
                throw mediaError;
              }
            }

            // ⭐⭐⭐ iOS: 미디어 완전 안정화 대기 (더 긴 시간)
            const mediaStabilizeTime = isiOS ? 2500 : 1000;
            console.log(`⏳ ${mediaStabilizeTime}ms 대기 (미디어 안정화)`);
            await new Promise(r => setTimeout(r, mediaStabilizeTime));

            // 2. 방 정보 갱신
            console.log('2️⃣ 방 정보 갱신 시작');
            await fetchRoomDetails();
            console.log('✅ 방 정보 갱신 완료');

            await new Promise(r => setTimeout(r, 500));

            // 3. WebSocket 연결 확인 및 Ready
            const currentWs = wsRef.current;
            
            if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
              console.error('❌ WebSocket 연결 없음 - 재연결 시도');
              connectWebSocket();
              
              // ⭐ iOS: 재연결 대기 시간 증가
              await new Promise(r => setTimeout(r, isiOS ? 3000 : 2000));
              
              const reconnectedWs = wsRef.current;
              if (!reconnectedWs || reconnectedWs.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket 재연결 실패');
              }
            }

            console.log('3️⃣ WebSocket 준비 완료');
            setWsReady(true);

            // ⭐⭐⭐ 4. WebSocket 완전 안정화 대기 (iOS는 더 길게)
            const wsStabilizeTime = isiOS ? 1500 : 800;
            console.log(`⏳ ${wsStabilizeTime}ms 대기 (WebSocket 안정화)`);
            await new Promise(r => setTimeout(r, wsStabilizeTime));

            // 5. join_ready 전송
            console.log(`4️⃣ join_ready 전송 준비`);
            
            if (!data.host_username) {
              console.error('❌ host_username 없음:', data);
              throw new Error('host_username이 없습니다');
            }
            
            console.log(`   From: ${user.username} → To: ${data.host_username}`);
            
            const finalWs = wsRef.current;
            
            if (finalWs && finalWs.readyState === WebSocket.OPEN) {
              const joinReadyMessage = {
                type: 'join_ready',
                from_username: user.username,
                to_username: data.host_username,
                room_id: String(roomId),
                // ⭐ iOS 플래그 추가
                is_ios: isiOS
              };
              
              console.log('📤 join_ready 전송 (5회 재전송):', joinReadyMessage);
              
              // ⭐⭐⭐ 5회 재전송으로 증가 (iOS 안정성)
              for (let i = 0; i < 5; i++) {
                finalWs.send(JSON.stringify(joinReadyMessage));
                console.log(`✅ join_ready 전송 완료 (${i+1}/5)`);
                
                if (i < 4) {
                  // ⭐ iOS는 간격을 더 길게
                  await new Promise(r => setTimeout(r, isiOS ? 800 : 500));
                }
              }
            } else {
              throw new Error('WebSocket 연결 상태 불안정');
            }
                  
            // 6. join 전송
            console.log('5️⃣ join 메시지 전송');
            finalWs.send(JSON.stringify({
              type: 'join',
              username: user.username
            }));
            
            console.log('✅ join 전송 완료');
          
            console.log(`\n${'='.repeat(60)}`);
            console.log('✅ 승인 후 초기화 완료');
            console.log(`${'='.repeat(60)}\n`);

          } catch (error) {
            console.error('❌ 승인 후 초기화 실패:', error);
            approvalInitializedRef.current = false;
            
            if (error.message !== 'WebSocket 연결 상태 불안정') {
              alert('회의 참가 준비 중 오류가 발생했습니다.\n\n페이지를 새로고침하고 다시 시도해주세요.');
            }
          }
        };

        // ⭐ iOS는 시작 지연 시간 증가
        const startDelay = isIOS() ? 1200 : 500;
        console.log(`⏳ ${startDelay}ms 후 초기화 시작`);
        
        setTimeout(initializeAfterApproval, startDelay);
        break;
      }

      // ⭐⭐⭐ user_joined 핸들러
      case 'user_joined': {
        const joinedUsername = data.username;
        console.log(`\n${'='.repeat(60)}`);
        console.log(`👋 user_joined 수신`);
        console.log(`   입장자: ${joinedUsername}`);
        console.log(`   현재 사용자: ${user.username}`);
        console.log(`   방장 여부: ${room?.is_host}`);
        console.log(`${'='.repeat(60)}\n`);
        
        // 자신의 입장은 무시
        if (joinedUsername === user.username) {
          console.log('⚠️ 본인 입장 - 무시');
          return;
        }
        
        // 미디어 준비 대기 후 연결
        const tryConnect = async (attempt = 0) => {
          if (!localStreamRef.current) {
            if (attempt < 10) {
              console.log(`⏳ 미디어 대기... (${attempt + 1}/10)`);
              setTimeout(() => tryConnect(attempt + 1), 1000);
            } else {
              console.error('❌ 미디어 준비 타임아웃');
            }
            return;
          }
          
          console.log(`✅ 미디어 준비됨 - 연결 시작`);
          console.log(`   나: ${user.username} (${room?.is_host ? '방장' : '참가자'})`);
          console.log(`   상대: ${joinedUsername}`);
          
          // Initiator 결정: 방장이 항상 Initiator
          const shouldInitiate = room?.is_host === true;
          
          console.log(`   Initiator: ${shouldInitiate ? '내가 먼저 (Offer)' : '상대가 먼저 (Answer 대기)'}`);
          
   
          try {
            // ⭐⭐⭐ 기존 연결 체크
            if (peerConnections.current[joinedUsername]) {
              const existingState = peerConnections.current[joinedUsername].connectionState;
              
              if (existingState === 'connected') {
                console.log('✅ 이미 연결됨 - 재사용');
                return;
              }
              
              if (existingState === 'connecting') {
                console.log('⏳ 연결 중 - 대기');
                return;
              }
              
              console.log('🗑️ 기존 연결 제거 후 재생성');
              try {
                peerConnections.current[joinedUsername].close();
              } catch (e) {}
              delete peerConnections.current[joinedUsername];
            }
            
            await createPeerConnection(joinedUsername, shouldInitiate);
            console.log(`✅ PC 생성 완료: ${joinedUsername}`);
          } catch (error) {
            console.error('❌ 연결 시작 실패:', error);
          }
        };
        
        // ⭐ iOS는 조금 더 대기
        const connectionDelay = isIOS() ? 1000 : 500;
        console.log(`⏳ ${connectionDelay}ms 후 연결 시도`);
        
        setTimeout(() => tryConnect(0), connectionDelay);
        break;
      }

      // ⭐⭐⭐ join_ready 핸들러 (방장 전용)
      case 'join_ready': {
        const peerUsername = data.from_username;
        const isIOSPeer = data.is_ios || false; // iOS 참가자 여부
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔥 join_ready 수신`);
        console.log(`   From: ${peerUsername} (참가자)`);
        console.log(`   iOS: ${isIOSPeer ? '✅' : '❌'}`);
        console.log(`   방장 여부: ${room?.is_host}`);
        console.log(`${'='.repeat(60)}\n`);
        
        // 방장이 아니면 무시
        if (!room?.is_host) {
          console.log('⚠️ 방장 아님 - 무시');
          return;
        }
        
        // ⭐⭐⭐ 기존 연결 체크 및 정리
        if (peerConnections.current[peerUsername]) {
          const state = peerConnections.current[peerUsername].connectionState;
          
          if (state === 'connected') {
            console.log('✅ 이미 연결됨 - 재연결 불필요');
            return;
          }
          
          if (state === 'connecting') {
            console.log('⏳ 연결 중 - 대기');
            return;
          }
          
          console.log('🗑️ 기존 연결 제거 후 재생성');
          try {
            peerConnections.current[peerUsername].close();
          } catch (e) {}
          delete peerConnections.current[peerUsername];
        }
        
        // ⭐⭐⭐ 연결 시작 (방장이 항상 Initiator)
        const startConnection = async (attempts = 0) => {
          // 1. 방장 자신의 미디어 체크
          if (!localStreamRef.current) {
            if (attempts < 10) {
              console.log(`⏳ 방장 미디어 대기... (${attempts + 1}/10)`);
              setTimeout(() => startConnection(attempts + 1), 1000);
            } else {
              console.error('❌ 방장 미디어 준비 타임아웃');
            }
            return;
          }
          
          console.log(`🚀 WebRTC 연결 시작: ${peerUsername}`);
          console.log(`   방장이 Initiator로 Offer 전송`);
          console.log(`   iOS 참가자: ${isIOSPeer ? '✅' : '❌'}`);
          
          try {
            // ⭐ iOS 참가자를 위한 추가 대기
            if (isIOSPeer) {
              console.log('⏳ iOS 참가자 - 추가 안정화 대기 (1초)');
              await new Promise(r => setTimeout(r, 1000));
            }
            
            // PeerConnection 생성 (방장이 Initiator)
            const pc = await createPeerConnection(peerUsername, true);
            
            if (!pc) {
              throw new Error('PeerConnection 생성 실패');
            }
            
            console.log(`✅ PC 생성 완료`);
            
            // ⭐ iOS 참가자: Offer 전송 확인
            if (isIOSPeer) {
              console.log('📱 iOS 참가자: Offer 전송 대기...');
              
              // negotiationneeded 이벤트가 발생하지 않을 경우 수동 Offer 생성
              await new Promise(r => setTimeout(r, 500));
              
              if (pc.signalingState === 'stable' && !pc.localDescription) {
                console.log('⚠️ Offer가 자동 생성되지 않음 - 수동 생성');
                
                try {
                  const offerOptions = {
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                  };
                  
                  const offer = await pc.createOffer(offerOptions);
                  await pc.setLocalDescription(offer);
                  
                  if (sendWebRTCSignal) {
                    sendWebRTCSignal(peerUsername, 'offer', {
                      sdp: pc.localDescription
                    });
                    console.log(`✅ 수동 Offer 전송 완료 → ${peerUsername}`);
                  }
                } catch (offerError) {
                  console.error('❌ 수동 Offer 생성 실패:', offerError);
                }
              }
            }
            
          } catch (error) {
            console.error('❌ PC 생성 오류:', error);
            
            // ⭐ 재시도 로직 (최대 3회)
            if (attempts < 3) {
              const retryDelay = isIOSPeer ? 2000 : 1000;
              console.log(`🔄 재시도 (${attempts + 1}/3) - ${retryDelay}ms 후`);
              setTimeout(() => startConnection(attempts + 1), retryDelay);
            } else {
              console.error('❌ 최대 재시도 횟수 초과');
            }
          }
        };
        
        // ⭐ iOS 참가자는 더 긴 지연 시간
        const startDelay = isIOSPeer ? 1000 : 500;
        console.log(`⏳ ${startDelay}ms 후 연결 시작`);
        
        setTimeout(() => startConnection(0), startDelay);
        break;
      }

      case 'user_left':
        console.log(`👋 user_left: ${data.username}`);
        removeRemoteStream(data.username);
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
              : [...prev, { 
                  username: data.username, 
                  user_id: data.user_id, 
                  raised_at: new Date().toISOString() 
                }]
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
    peerConnections,
    createPeerConnection, 
    handleWebSocketSignal, 
    handleTrackStateChange,
    removeRemoteStream, 
    addChatMessage, 
    fetchRoomDetails, 
    fetchPendingRequests, 
    navigate,
    getLocalMedia
  ]);

  // =========================================================================
  // WebSocket 연결
  // =========================================================================
  const connectWebSocket = useCallback(() => {
    if (!roomId || !user || roomId === 'undefined') {
      console.error('❌ roomId 또는 user 없음');
      return;
    }

    if (wsRef.current) {
      const currentState = wsRef.current.readyState;
      
      if (currentState === WebSocket.OPEN || currentState === WebSocket.CONNECTING) {
        console.log('⚠️ 이미 연결 중');
        return;
      }
      
      try {
        wsRef.current.close(1000, 'Reconnecting');
      } catch (e) {}
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

      const connectionTimeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          console.error('❌ WebSocket 연결 타임아웃');
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
              socket.send(JSON.stringify({
                type: 'join',
                username: user.username
              }));
              console.log('📤 Join 메시지 전송');
              
              setTimeout(() => {
                setWsReady(true);
                console.log('✅ WebSocket 완전 준비');
              }, 500);
            } catch (e) {
              console.error('❌ Join 실패:', e);
            }
          }
        }, 500);
      };
  
      // ⭐⭐⭐ 핵심: handleWebSocketMessage 사용
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
          console.error('❌ 인증 실패');
          alert('인증이 만료되었습니다.');
          navigate('/login');
          return;
        }

        if (event.code !== 1000 && event.code !== 1001) {
          if (reconnectAttemptsRef.current < 5) {
            reconnectAttemptsRef.current += 1;
            const delay = Math.min(1000 * reconnectAttemptsRef.current, 5000);
            console.log(`🔄 재연결 (${reconnectAttemptsRef.current}/5) - ${delay}ms`);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              connectWebSocket();
            }, delay);
          } else {
            console.error('❌ 최대 재연결 횟수 초과');
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
    if (initializationRef.current) {
      console.log('⚠️ 이미 초기화 중');
      return;
    }

    try {
      initializationRef.current = true;
      
      if (isIOS()) {
        console.log('📱 iOS 감지');
        
        if (!isSafari()) {
          const confirmContinue = window.confirm(
            '⚠️ iOS에서는 Safari 사용을 권장합니다.\n\n계속 진행하시겠습니까?'
          );
          
          if (!confirmContinue) {
            throw new Error('사용자가 취소했습니다');
          }
        }
      }
      
      console.log('🎥 미디어 초기화');
      
      const stream = await getLocalMedia();
      
      if (localVideoRef.current && stream) {
        localVideoRef.current.srcObject = stream;
        
        if (isIOS()) {
          try {
            await localVideoRef.current.play();
            console.log('✅ iOS 비디오 재생');
          } catch (e) {
            console.warn('⚠️ iOS 자동 재생 실패:', e);
          }
        }
        
        console.log('✅ 로컬 비디오 설정 완료');
      }
    } catch (error) {
      console.error('❌ 미디어 초기화 실패:', error);
      
      if (isIOS()) {
        if (error.name === 'NotAllowedError') {
          alert('📱 iOS 권한 설정이 필요합니다.\n\n설정 > Safari > 카메라/마이크');
        } else if (error.name === 'NotReadableError') {
          alert('📱 카메라/마이크 사용 중\n\n다른 앱 종료 후 재시도');
        } else if (error.message !== '사용자가 취소했습니다') {
          alert('미디어 초기화 실패');
        }
      } else {
        alert('카메라와 마이크 접근 권한이 필요합니다.');
      }
      
      if (error.message !== '사용자가 취소했습니다') {
        throw error;
      }
    } finally {
      initializationRef.current = false;
    }
  }, [getLocalMedia]);

  // =========================================================================
  // 마이크/비디오 토글
  // =========================================================================
  const handleToggleMic = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        const newState = !isMicOn;
        audioTrack.enabled = newState;
        setIsMicOn(newState);
        broadcastTrackState('audio', newState);
        console.log('🎤 마이크:', newState ? 'ON' : 'OFF');
      }
    }
  }, [isMicOn, localStreamRef, broadcastTrackState]);

  const handleToggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        const newState = !isVideoOn;
        videoTrack.enabled = newState;
        setIsVideoOn(newState);
        broadcastTrackState('video', newState);
        console.log('📹 비디오:', newState ? 'ON' : 'OFF');
      }
    }
  }, [isVideoOn, localStreamRef, broadcastTrackState]);

  // =========================================================================
  // 회의 나가기
  // =========================================================================
  const handleLeave = async () => {
    if (room.is_host) {
      const confirmEnd = window.confirm(
        '회의를 종료하시겠습니까?\n\n"확인": 모든 참가자 퇴장\n"취소": 나만 나가기'
      );

      try {
        if (confirmEnd) {
          console.log('🛑 회의 종료');
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

  // =========================================================================
  // 채팅 전송
  // =========================================================================
  const handleSendChatMessage = async (content) => {
    const currentWs = wsRef.current;
    
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 연결 없음');
    }

    try {
      currentWs.send(JSON.stringify({
        type: 'chat',
        content: content
      }));
      
      console.log('💬 채팅 전송:', content.substring(0, 30));
    } catch (error) {
      console.error('❌ 채팅 실패:', error);
      throw error;
    }
  };

  // =========================================================================
  // 반응 전송
  // =========================================================================
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
      console.error('❌ 반응 실패:', error);
    }
  };

  // =========================================================================
  // 손들기/내리기
  // =========================================================================
  const handleRaiseHand = async () => {
    const currentWs = wsRef.current;
    
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket 연결 없음');
      return;
    }

    try {
      console.log('✋ 손들기 요청');
      currentWs.send(JSON.stringify({ type: 'raise_hand' }));
      setIsHandRaised(true);
      console.log('✅ 손들기 완료');
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
      console.log('👋 손내리기 요청');
      currentWs.send(JSON.stringify({ type: 'lower_hand' }));
      setIsHandRaised(false);
      console.log('✅ 손내리기 완료');
    } catch (error) {
      console.error('❌ 손내리기 실패:', error);
    }
  };

  // =========================================================================
  // 마운트/언마운트 처리
  // =========================================================================
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

  // =========================================================================
  // 초기 연결 및 방장 폴링
  // =========================================================================
  useEffect(() => {
    if (!room || !user) return;

    const isApproved = room.participant_status === 'approved' || room.is_host;
    
    if (isApproved && !wsConnected && !wsRef.current && !localStreamRef.current) {
      console.log('\n' + '='.repeat(60));
      console.log('✅ 초기 연결 조건 충족');
      console.log('   Is Approved:', isApproved);
      console.log('   Is Host:', room.is_host);
      console.log('='.repeat(60) + '\n');
      
      const initialize = async () => {
        try {
          console.log('🎥 미디어 초기화');
          await initializeMedia();
          
          await new Promise(resolve => setTimeout(resolve, 300));
          
          console.log('🔌 WebSocket 연결');
          connectWebSocket();
          
          console.log('✅ 초기화 완료');
        } catch (error) {
          console.error('❌ 초기화 실패:', error);
        }
      };
      
      initialize();
    }

    // 방장: 대기 요청 폴링
    if (room.is_host && isApproved && wsConnected) {
      console.log('👑 방장: 대기 요청 폴링');
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
  // 승인 대기 폴링 (참가자용)
  // =========================================================================
  useEffect(() => {
    if (!room || !user) return;
    
    const isPending = room.participant_status === 'pending';
    const isNotHost = !room.is_host;
    
    if (isPending && isNotHost) {
      console.log('⏰ 승인 대기 - 폴링 시작');
      
      let pollCount = 0;
      const maxPolls = 60;
      
      const pollInterval = setInterval(async () => {
        pollCount++;
        
        try {
          console.log(`🔄 상태 확인 (${pollCount}/${maxPolls})`);
          const updatedRoom = await fetchRoomDetails();
          
          if (updatedRoom.participant_status === 'approved') {
            console.log('\n✅ 폴링: 승인 감지!\n');
            clearInterval(pollInterval);
          }
          
          if (updatedRoom.participant_status === 'rejected') {
            console.log('❌ 폴링: 거부됨');
            clearInterval(pollInterval);
            alert('참가가 거부되었습니다.');
            navigate('/video-meetings');
          }
          
          if (pollCount >= maxPolls) {
            console.log('⏰ 폴링 타임아웃');
            clearInterval(pollInterval);
            
            const retry = window.confirm('승인 대기 시간 초과.\n\n계속 대기하시겠습니까?');
            
            if (!retry) {
              navigate('/video-meetings');
            }
          }
        } catch (error) {
          console.error('❌ 폴링 오류:', error);
        }
      }, 3000);
      
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

  // =========================================================================
  // 채팅 패널 열릴 때 읽지 않은 메시지 초기화
  // =========================================================================
  useEffect(() => {
    if (showChatPanel) {
      setUnreadChatCount(0);
    }
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
        <button
          onClick={() => navigate('/video-meetings')}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
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
        <button
          onClick={() => navigate('/video-meetings')}
          className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
        >
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
    ...remoteStreams.map(stream => ({
      ...stream,
      isHandRaised: raisedHands.some(h => h.username === stream.username)
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
          <span>Media: {localStreamRef.current ? '🟢' : '🔴'}</span>
          <span>Remote: {remoteStreams.length}</span>
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

      <VideoGrid 
        videos={allVideos}
        HandRaisedBadge={HandRaisedBadge}
      />

      {/* 📱 iOS 재생 버튼 */} 
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