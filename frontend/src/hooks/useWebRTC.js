// frontend/src/hooks/useWebRTC.js (완전 수정 버전)
import { useState, useRef, useCallback, useEffect } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
};

export function useWebRTC(roomId, currentUser, isHost, sendWebRTCSignal) {
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState({});
  
  const localStreamRef = useRef(null);
  const peerConnections = useRef({});
  const pendingCandidates = useRef({});
  const isCreatingConnection = useRef({});
  
  // ⭐ sendWebRTCSignal을 항상 최신으로 유지
  const sendSignalRef = useRef(sendWebRTCSignal);
  
  useEffect(() => {
    sendSignalRef.current = sendWebRTCSignal;
  }, [sendWebRTCSignal]);

  // =========================================================================
  // Local Media
  // =========================================================================
  
  const getLocalMedia = useCallback(async () => {
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      const isActive = tracks.some(track => track.readyState === 'live');
      
      if (isActive) {
        console.log('✅ 기존 스트림 재사용');
        return localStreamRef.current;
      }
    }

    try {
      console.log('🎥 미디어 스트림 요청...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
      });
      
      localStreamRef.current = stream;
      console.log('✅ 미디어 준비 완료');
      
      return stream;
    } catch (err) {
      console.error('❌ 미디어 접근 실패:', err);
      throw err;
    }
  }, []);

  // =========================================================================
  // Peer Connection
  // =========================================================================
  
  const createPeerConnection = useCallback(async (peerId, isInitiator) => {
    // Race condition 방지
    if (isCreatingConnection.current[peerId]) {
      console.log(`⏳ 연결 생성 대기: ${peerId}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return peerConnections.current[peerId];
    }
    
    isCreatingConnection.current[peerId] = true;
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔧 Peer Connection 생성`);
    console.log(`   Peer: ${peerId}`);
    console.log(`   Initiator: ${isInitiator}`);
    console.log(`${'='.repeat(60)}\n`);
    
    try {
      // 기존 연결 확인
      const existing = peerConnections.current[peerId];
      if (existing) {
        const state = existing.connectionState;
        console.log(`♻️ 기존 연결 상태: ${state}`);
        
        if (state === 'connected' || state === 'connecting') {
          console.log('✅ 기존 연결 재사용');
          isCreatingConnection.current[peerId] = false;
          return existing;
        }
        
        console.log('🗑️ 기존 연결 정리');
        try {
          existing.close();
        } catch (e) {
          console.error('연결 종료 오류:', e);
        }
        delete peerConnections.current[peerId];
      }
      
      if (!localStreamRef.current) {
        throw new Error('Local Stream이 없습니다');
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);

      // ⭐ Local Tracks 추가
      const tracks = localStreamRef.current.getTracks();
      console.log(`📡 Local Tracks 추가: ${tracks.length}개`);
      
      tracks.forEach(track => {
        try {
          pc.addTrack(track, localStreamRef.current);
          console.log(`✅ ${track.kind} track 추가`);
        } catch (e) {
          console.error(`❌ Track 추가 실패:`, e);
        }
      });

      // ⭐ ICE Candidate 핸들러
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`📡 ICE Candidate 전송 (${peerId})`);
          
          // ⭐ ref를 통해 최신 함수 호출
          if (sendSignalRef.current) {
            sendSignalRef.current(peerId, 'ice_candidate', {
              candidate: event.candidate
            });
          }
        } else {
          console.log(`✅ ICE Gathering 완료 (${peerId})`);
        }
      };

      // ⭐ Track 수신 핸들러
      pc.ontrack = (event) => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🎥 Remote Track 수신!`);
        console.log(`   From: ${peerId}`);
        console.log(`   Kind: ${event.track.kind}`);
        console.log(`${'='.repeat(60)}\n`);
        
        if (event.streams.length > 0) {
          const remoteStream = event.streams[0];
          
          setRemoteStreams(prev => {
            const existingIndex = prev.findIndex(p => p.peerId === peerId);
            
            if (existingIndex >= 0) {
              console.log(`♻️ Remote Stream 업데이트`);
              const updated = [...prev];
              updated[existingIndex] = { 
                ...updated[existingIndex], 
                stream: remoteStream 
              };
              return updated;
            }
            
            console.log(`🆕 Remote Stream 추가`);
            return [
              ...prev, 
              { 
                peerId, 
                username: peerId,
                stream: remoteStream,
                isMuted: false,
                isVideoOff: false
              }
            ];
          });
        }
      };

      // ⭐ ICE 연결 상태
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log(`🔌 ICE State (${peerId}): ${state}`);
        
        setConnectionStatus(prev => ({...prev, [peerId]: state}));
        
        if (state === 'connected') {
          console.log(`✅✅ ICE 연결 성공! (${peerId})`);
          
          // 대기 Candidates 처리
          if (pendingCandidates.current[peerId]?.length > 0) {
            console.log(`📦 대기 Candidates 처리: ${pendingCandidates.current[peerId].length}개`);
            pendingCandidates.current[peerId].forEach(candidate => {
              pc.addIceCandidate(candidate).catch(e => {
                console.error('❌ Candidate 추가 실패:', e);
              });
            });
            delete pendingCandidates.current[peerId];
          }
        } else if (state === 'failed') {
          console.error(`❌ ICE 연결 실패 (${peerId})`);
        }
      };

      // ⭐ 연결 상태
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log(`🔗 Connection State (${peerId}): ${state}`);
        
        if (state === 'failed' || state === 'closed') {
          setRemoteStreams(prev => prev.filter(s => s.peerId !== peerId));
          delete peerConnections.current[peerId];
        }
      };

      peerConnections.current[peerId] = pc;
      console.log(`✅ Peer Connection 저장 완료`);

      // ⭐ Initiator: Offer 생성
      if (isInitiator) {
        console.log(`🎬 Initiator: Offer 생성 시작`);
        
        setTimeout(async () => {
          try {
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            
            await pc.setLocalDescription(offer);
            console.log(`✅ Local Description set`);
            
            // ⭐ ref를 통해 최신 함수 호출
            if (sendSignalRef.current) {
              sendSignalRef.current(peerId, 'offer', {
                sdp: pc.localDescription
              });
              console.log(`✅✅ Offer 전송 완료!`);
            }
          } catch (e) {
            console.error(`❌ Offer 생성/전송 실패:`, e);
          }
        }, 1000);
      }
      
      return pc;
    } catch (e) {
      console.error('❌ Peer Connection 생성 오류:', e);
      return null;
    } finally {
      isCreatingConnection.current[peerId] = false;
    }
  }, []); // ⭐ 의존성 제거 (ref 사용)

  // =========================================================================
  // WebSocket Signal Handler
  // =========================================================================
  
  const handleWebSocketSignal = useCallback(async (data) => {
    const { type, from_user_id: peerId, to_user_id } = data;

    // 자신의 시그널 무시
    if (peerId === currentUser?.username) {
      return;
    }

    // 수신자 확인
    if (to_user_id && to_user_id !== currentUser?.username) {
      return;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📨 WebSocket 시그널 수신`);
    console.log(`   Type: ${type}`);
    console.log(`   From: ${peerId}`);
    console.log(`   To: ${to_user_id || 'broadcast'}`);
    console.log(`${'='.repeat(60)}\n`);

    // ⭐ Join 메시지 처리 (방장만)
    if (type === 'join') {
      console.log(`📢 Join 메시지 수신 from ${peerId}`);
      
      if (isHost) {
        console.log(`👑 방장이 Join 수신 - 피어 연결 시작`);
        
        setTimeout(async () => {
          const existingPc = peerConnections.current[peerId];
          
          if (!existingPc || existingPc.connectionState === 'failed' || existingPc.connectionState === 'closed') {
            await createPeerConnection(peerId, true);
          } else {
            console.log(`✅ 기존 연결 유지 (${existingPc.connectionState})`);
          }
        }, 500);
      }
      return;
    }

    // ⭐ WebRTC 시그널 처리
    let pc = peerConnections.current[peerId];

    if (!pc && type === 'offer') {
      pc = await createPeerConnection(peerId, false);
      if (!pc) {
        console.error('❌ Peer Connection 생성 실패');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!pc) {
      console.warn(`⚠️ Peer Connection 없음`);
      return;
    }

    try {
      switch (type) {
        case 'offer':
          console.log(`📥 Offer 처리 시작`);
          console.log(`   Signaling State: ${pc.signalingState}`);
          
          if (pc.signalingState === 'have-local-offer') {
            await pc.setLocalDescription({type: 'rollback'});
            console.log('✅ Rollback 완료');
          }
          
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          console.log(`✅ Remote Description set`);
          
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          console.log(`✅ Answer 생성 완료`);
          
          // ⭐ ref를 통해 최신 함수 호출
          if (sendSignalRef.current) {
            sendSignalRef.current(peerId, 'answer', {
              sdp: pc.localDescription
            });
            console.log(`✅✅ Answer 전송 완료!`);
          }
          break;

        case 'answer':
          console.log(`📥 Answer 처리 시작`);
          console.log(`   Signaling State: ${pc.signalingState}`);
          
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            console.log(`✅✅ Answer 적용 완료!`);
          } else {
            console.warn(`⚠️ 비정상 상태: ${pc.signalingState}`);
          }
          break;

        case 'ice_candidate':
          console.log(`📥 ICE Candidate 처리`);
          
          if (data.candidate) {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
              console.log(`✅ ICE Candidate 추가`);
            } else {
              console.warn(`⚠️ Remote Description 없음 - 큐에 추가`);
              if (!pendingCandidates.current[peerId]) {
                pendingCandidates.current[peerId] = [];
              }
              pendingCandidates.current[peerId].push(new RTCIceCandidate(data.candidate));
            }
          }
          break;

        default:
          console.warn(`⚠️ 알 수 없는 시그널: ${type}`);
      }
    } catch (e) {
      console.error(`❌ 시그널 처리 실패:`, e);
    }
  }, [currentUser, createPeerConnection, isHost]);

  // =========================================================================
  // Cleanup
  // =========================================================================
  
  const cleanup = useCallback(() => {
    console.log('\n🧹 WebRTC 정리...');
    
    // Peer Connections
    Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
      try {
        pc.close();
        console.log(`🔌 연결 종료: ${peerId}`);
      } catch (e) {
        console.error(`연결 종료 오류:`, e);
      }
    });
    peerConnections.current = {};
    
    // Local Stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      localStreamRef.current = null;
    }
    
    // 상태 초기화
    pendingCandidates.current = {};
    isCreatingConnection.current = {};
    setRemoteStreams([]);
    setConnectionStatus({});
    
    console.log('✅ 정리 완료\n');
  }, []);

  return {
    localStreamRef,
    peerConnections,
    remoteStreams,
    connectionStatus,
    getLocalMedia,
    createPeerConnection,
    handleWebSocketSignal,
    cleanup,
  };
}