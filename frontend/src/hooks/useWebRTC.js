// frontend/src/hooks/useWebRTC.js (개선 버전)
import { useState, useRef, useCallback, useEffect } from 'react';
import axios from '../api/axios';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
};

// 연결 상태 추적을 위한 상수
const CONNECTION_TIMEOUT = 15000; // 15초
const RECONNECT_DELAY = 2000; // 2초

export function useWebRTC(roomId, currentUser, isHost) {
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState({});
  
  const localStreamRef = useRef(null);
  const peerConnections = useRef({});
  const processedSignals = useRef(new Set());
  const pendingCandidates = useRef({});
  const connectionTimers = useRef({});
  const isCreatingConnection = useRef({});
  const signalQueue = useRef({});
  
  // 메모리 누수 방지: 주기적인 정리
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      
      // 5분 이상 된 processed signals 제거
      if (processedSignals.current.size > 1000) {
        console.log('🧹 Processed signals 정리 중...');
        processedSignals.current.clear();
      }
      
      // 만료된 타이머 정리
      Object.keys(connectionTimers.current).forEach(peerId => {
        if (connectionTimers.current[peerId] < now - 60000) {
          delete connectionTimers.current[peerId];
        }
      });
    }, 60000); // 1분마다 실행
    
    return () => clearInterval(cleanupInterval);
  }, []);

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
      } else {
        console.log('⚠️ 기존 스트림이 비활성 상태 - 재생성');
        tracks.forEach(track => track.stop());
        localStreamRef.current = null;
      }
    }

    try {
      console.log('🎥 미디어 스트림 요청...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          facingMode: 'user',
          frameRate: { ideal: 30, max: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1
        },
      });
      
      localStreamRef.current = stream;
      
      console.log('✅ 미디어 준비 완료');
      console.log(`   Video: ${stream.getVideoTracks().length}개`);
      console.log(`   Audio: ${stream.getAudioTracks().length}개`);
      
      // Track 종료 이벤트 리스너
      stream.getTracks().forEach(track => {
        track.onended = () => {
          console.warn(`⚠️ Track 종료됨: ${track.kind}`);
        };
      });
      
      return stream;
    } catch (err) {
      console.error('❌ 미디어 접근 실패:', err);
      throw err;
    }
  }, []);

  // =========================================================================
  // Signaling
  // =========================================================================
  
  const sendSignal = useCallback(async (toPeerId, type, payload = {}) => {
    if (!currentUser?.username) {
      console.warn('⚠️ currentUser 없음, 시그널 전송 불가');
      return;
    }

    const payloadString = JSON.stringify(payload);

    const message = {
      message_type: type,
      payload: payloadString,
      receiver_username: toPeerId,
    };

    console.log(`📤 시그널 전송: ${type} → ${toPeerId}`);

    try {
      const response = await axios.post(
        `/video-meetings/${roomId}/send_signal/`, 
        message,
        { timeout: 10000 } // 10초 타임아웃
      );
      console.log(`✅ 시그널 전송 성공 (${type}): ID ${response.data.id}`);
      return response.data;
    } catch (err) {
      console.error(`❌ Signal 전송 실패 (${type}):`, err.message);
      throw err;
    }
  }, [roomId, currentUser]);

  // =========================================================================
  // Peer Connection (Race Condition 방지)
  // =========================================================================
  
  const createPeerConnection = useCallback(async (peerId, isInitiator) => {
    // Race condition 방지: 이미 생성 중이면 대기
    if (isCreatingConnection.current[peerId]) {
      console.log(`⏳ 연결 생성 대기 중: ${peerId}`);
      
      // 최대 5초 대기
      for (let i = 0; i < 50; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!isCreatingConnection.current[peerId]) {
          const existing = peerConnections.current[peerId];
          if (existing && existing.connectionState !== 'failed') {
            console.log(`✅ 대기 후 기존 연결 사용: ${peerId}`);
            return existing;
          }
        }
      }
    }
    
    // 락 획득
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
          return existing;
        }
        
        console.log('🗑️ 기존 연결 정리');
        try {
          existing.close();
        } catch (e) {
          console.error('연결 종료 오류:', e);
        }
        delete peerConnections.current[peerId];
        
        // 타이머 정리
        if (connectionTimers.current[peerId]) {
          clearTimeout(connectionTimers.current[peerId]);
          delete connectionTimers.current[peerId];
        }
      }
      
      // Local Stream 확인
      if (!localStreamRef.current) {
        throw new Error('Local Stream이 없습니다');
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);

      // 연결 타임아웃 설정
      connectionTimers.current[peerId] = setTimeout(() => {
        if (pc.connectionState !== 'connected') {
          console.error(`⏱️ 연결 타임아웃: ${peerId}`);
          pc.close();
          delete peerConnections.current[peerId];
        }
      }, CONNECTION_TIMEOUT);

      // Local Tracks 추가
      const tracks = localStreamRef.current.getTracks();
      console.log(`📡 Local Tracks 추가: ${tracks.length}개`);
      
      tracks.forEach(track => {
        try {
          const sender = pc.addTrack(track, localStreamRef.current);
          console.log(`✅ ${track.kind} track 추가 (ID: ${sender.track?.id})`);
        } catch (e) {
          console.error(`❌ Track 추가 실패:`, e);
        }
      });

      // Event Handlers
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`📡 ICE Candidate 생성 (${peerId})`);
          sendSignal(peerId, 'candidate', event.candidate.toJSON())
            .catch(e => console.error('ICE Candidate 전송 실패:', e));
        }
      };

      pc.ontrack = (event) => {
        console.log(`\n${'🎉'.repeat(30)}`);
        console.log(`🎥 Remote Track 수신! From: ${peerId}, Kind: ${event.track.kind}`);
        console.log(`${'🎉'.repeat(30)}\n`);
        
        if (event.streams.length > 0) {
          const remoteStream = event.streams[0];
          
          setRemoteStreams(prev => {
            const existingIndex = prev.findIndex(p => p.peerId === peerId);
            
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = { 
                ...updated[existingIndex], 
                stream: remoteStream 
              };
              return updated;
            }
            
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

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log(`🔌 ICE State (${peerId}): ${state}`);
        setConnectionStatus(prev => ({...prev, [peerId]: state}));
        
        if (state === 'connected') {
          console.log(`✅ ICE 연결 성공! (${peerId})`);
          
          // 타이머 해제
          if (connectionTimers.current[peerId]) {
            clearTimeout(connectionTimers.current[peerId]);
            delete connectionTimers.current[peerId];
          }
          
          // 대기 중인 ICE Candidates 처리
          if (pendingCandidates.current[peerId]?.length > 0) {
            console.log(`📦 대기 Candidates 처리: ${pendingCandidates.current[peerId].length}개`);
            pendingCandidates.current[peerId].forEach(candidate => {
              pc.addIceCandidate(candidate)
                .then(() => console.log('✅ 대기 Candidate 추가'))
                .catch(e => console.error('❌ Candidate 추가 실패:', e));
            });
            delete pendingCandidates.current[peerId];
          }
        } else if (state === 'failed') {
          console.error(`❌ ICE 연결 실패 (${peerId})`);
          
          // 재연결 시도
          if (pc.restartIce) {
            setTimeout(() => {
              console.log(`🔄 ICE 재시작 (${peerId})`);
              pc.restartIce();
            }, RECONNECT_DELAY);
          }
        } else if (state === 'disconnected') {
          console.warn(`⚠️ ICE 연결 끊김 (${peerId})`);
          
          // 5초 후에도 연결 안되면 재생성
          setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected') {
              console.log(`🔄 연결 재생성 시도 (${peerId})`);
              delete peerConnections.current[peerId];
              createPeerConnection(peerId, isHost);
            }
          }, 5000);
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log(`🔗 Connection State (${peerId}): ${state}`);
        
        if (state === 'failed' || state === 'closed') {
          // 원격 스트림 제거
          setRemoteStreams(prev => prev.filter(s => s.peerId !== peerId));
          delete peerConnections.current[peerId];
        }
      };
      
      pc.onnegotiationneeded = async () => {
        console.log(`🔄 Negotiation needed (${peerId})`);
        
        if (isInitiator && pc.signalingState === 'stable') {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendSignal(peerId, 'offer', pc.localDescription.toJSON());
          } catch (e) {
            console.error('❌ Renegotiation 실패:', e);
          }
        }
      };

      // 저장
      peerConnections.current[peerId] = pc;
      console.log(`✅ Peer Connection 저장 완료`);

      // Initiator가 Offer 생성
      if (isInitiator) {
        console.log(`🎬 Initiator: Offer 생성 시작`);
        
        setTimeout(async () => {
          try {
            if (pc.signalingState !== 'stable') {
              console.warn(`⚠️ Signaling state: ${pc.signalingState}`);
              await new Promise(resolve => {
                const check = setInterval(() => {
                  if (pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer') {
                    clearInterval(check);
                    resolve();
                  }
                }, 100);
                setTimeout(() => { clearInterval(check); resolve(); }, 5000);
              });
            }
            
            console.log(`📝 Creating Offer for ${peerId}...`);
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            
            await pc.setLocalDescription(offer);
            console.log(`✅ Local Description set`);
            
            await sendSignal(peerId, 'offer', pc.localDescription.toJSON());
            console.log(`✅✅✅ Offer 전송 완료!`);
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
      // 락 해제
      delete isCreatingConnection.current[peerId];
    }
  }, [sendSignal, isHost]);

  // =========================================================================
  // Signal Handling (메모리 누수 방지)
  // =========================================================================
  
  const handleSignal = useCallback(async (signal, fetchRoomDetails) => {
    const { 
      id: signalId, 
      sender_username: peerId, 
      message_type: type, 
      payload,
      receiver_username 
    } = signal;
    
    // 중복 처리 방지
    if (processedSignals.current.has(signalId)) {
      return;
    }
    
    // 자신의 시그널 무시
    if (peerId === currentUser?.username) {
      processedSignals.current.add(signalId);
      return;
    }

    // 수신자 확인
    if (receiver_username && receiver_username !== currentUser?.username) {
      processedSignals.current.add(signalId);
      return;
    }

    console.log(`📨 시그널 수신: ${type} from ${peerId}`);

    // Payload 파싱
    let data;
    try {
      if (typeof payload === 'string') {
        data = payload === '' || payload === 'undefined' ? {} : JSON.parse(payload);
      } else {
        data = payload || {};
      }
    } catch (e) {
      console.error('❌ Payload 파싱 실패:', e);
      processedSignals.current.add(signalId);
      return;
    }

    // Join Ready 처리
    if (type === 'join_ready') {
      processedSignals.current.add(signalId);
      
      if (isHost) {
        console.log(`📢 Join Ready 수신 from ${peerId}`);
        
        setTimeout(async () => {
          const existingPc = peerConnections.current[peerId];
          
          if (!existingPc || existingPc.connectionState === 'failed' || existingPc.connectionState === 'closed') {
            await createPeerConnection(peerId, true);
          } else {
            console.log(`✅ 기존 연결 유지 (${existingPc.connectionState})`);
          }
        }, 300);
      }
      return;
    }
    
    // Signal 큐에 추가 (순차 처리)
    if (!signalQueue.current[peerId]) {
      signalQueue.current[peerId] = [];
    }
    signalQueue.current[peerId].push({ type, data, signalId });
    
    // 큐 처리
    if (signalQueue.current[peerId].length === 1) {
      await processSignalQueue(peerId);
    }
  }, [currentUser, isHost, createPeerConnection]);
  
  // Signal Queue 처리 함수
  const processSignalQueue = async (peerId) => {
    const queue = signalQueue.current[peerId];
    
    while (queue && queue.length > 0) {
      const { type, data, signalId } = queue[0];
      
      try {
        await processWebRTCSignal(peerId, type, data);
        processedSignals.current.add(signalId);
      } catch (e) {
        console.error(`❌ 시그널 처리 오류 (${type}):`, e);
      }
      
      queue.shift();
      await new Promise(resolve => setTimeout(resolve, 50)); // 50ms 대기
    }
  };
  
  // WebRTC Signal 처리
  const processWebRTCSignal = async (peerId, type, data) => {
    let pc = peerConnections.current[peerId];
    
    if (!pc && type === 'offer') {
      console.log(`🆕 Offer 수신 - 새 연결 생성`);
      pc = await createPeerConnection(peerId, false);
      if (!pc) {
        throw new Error('Peer Connection 생성 실패');
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    } else if (!pc) {
      console.warn(`⚠️ Peer Connection 없음: ${peerId}`);
      return;
    }
    
    try {
      switch (type) {
        case 'offer':
          console.log(`📥 Offer 처리 시작 (${peerId})`);
          
          if (pc.signalingState === 'have-local-offer') {
            await pc.setLocalDescription({type: 'rollback'});
            console.log('✅ Rollback 완료');
          }
          
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          console.log(`✅ Remote Description set`);
          
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          console.log(`✅ Answer 생성 완료`);
          
          await sendSignal(peerId, 'answer', pc.localDescription.toJSON());
          console.log(`✅✅✅ Answer 전송 완료!`);
          break;
          
        case 'answer':
          console.log(`📥 Answer 처리 시작 (${peerId})`);
          
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data));
            console.log(`✅✅✅ Answer 적용 완료!`);
          } else {
            console.warn(`⚠️ 비정상 상태: ${pc.signalingState}`);
          }
          break;
          
        case 'candidate':
          console.log(`📥 ICE Candidate 처리 (${peerId})`);
          
          if (data && data.candidate) {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(data));
              console.log(`✅ ICE Candidate 추가`);
            } else {
              console.warn(`⚠️ Remote Description 없음 - 큐에 추가`);
              if (!pendingCandidates.current[peerId]) {
                pendingCandidates.current[peerId] = [];
              }
              pendingCandidates.current[peerId].push(new RTCIceCandidate(data));
            }
          }
          break;
      }
    } catch (e) {
      console.error(`❌ ${type} 처리 실패:`, e);
      throw e;
    }
  };

  // =========================================================================
  // Cleanup
  // =========================================================================
  
  const cleanup = useCallback(() => {
    console.log('\n🧹 WebRTC 정리...');
    
    // Peer Connections 정리
    Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
      try {
        pc.close();
      } catch (e) {
        console.error(`연결 종료 오류 (${peerId}):`, e);
      }
    });
    peerConnections.current = {};
    
    // Local Stream 정리
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`🛑 Track 중지: ${track.kind}`);
      });
      localStreamRef.current = null;
    }
    
    // 타이머 정리
    Object.values(connectionTimers.current).forEach(timer => clearTimeout(timer));
    connectionTimers.current = {};
    
    // 상태 초기화
    processedSignals.current.clear();
    pendingCandidates.current = {};
    signalQueue.current = {};
    isCreatingConnection.current = {};
    setRemoteStreams([]);
    setConnectionStatus({});
    
    console.log('✅ 정리 완료');
  }, []);

  return {
    localStreamRef,
    peerConnections, // 외부에서 참조 가능하도록
    remoteStreams,
    connectionStatus,
    getLocalMedia,
    sendSignal,
    createPeerConnection,
    handleSignal,
    cleanup,
  };
}