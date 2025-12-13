// frontend/src/hooks/useWebRTC.js (완전 복원 버전)
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

const CONNECTION_TIMEOUT = 15000;
const RECONNECT_DELAY = 2000;
const MAX_PROCESSED_SIGNALS = 500;

export function useWebRTC(roomId, currentUser, isHost, sendWebRTCSignal) {
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState({});
  
  const localStreamRef = useRef(null);
  const peerConnections = useRef({});
  const processedSignals = useRef(new Set());
  const pendingCandidates = useRef({});
  const connectionTimers = useRef({});
  const isCreatingConnection = useRef({});
  const signalQueue = useRef({});
  const cleanupTimerRef = useRef(null);
  
  // ⭐ sendWebRTCSignal을 ref로 저장하여 순환 참조 방지
  const sendSignalRef = useRef(sendWebRTCSignal);
  
  useEffect(() => {
    sendSignalRef.current = sendWebRTCSignal;
  }, [sendWebRTCSignal]);
  
  // ⭐ 메모리 누수 방지: 주기적인 정리
  useEffect(() => {
    cleanupTimerRef.current = setInterval(() => {
      // Processed signals 제한
      if (processedSignals.current.size > MAX_PROCESSED_SIGNALS) {
        console.log('🧹 Processed signals 정리:', processedSignals.current.size);
        const arr = Array.from(processedSignals.current);
        const keep = arr.slice(-MAX_PROCESSED_SIGNALS / 2);
        processedSignals.current = new Set(keep);
      }
      
      // 만료된 타이머 정리
      const now = Date.now();
      Object.keys(connectionTimers.current).forEach(peerId => {
        if (connectionTimers.current[peerId] < now - 60000) {
          delete connectionTimers.current[peerId];
        }
      });
      
      // 빈 pending candidates 정리
      Object.keys(pendingCandidates.current).forEach(peerId => {
        if (pendingCandidates.current[peerId]?.length === 0) {
          delete pendingCandidates.current[peerId];
        }
      });
    }, 30000); // 30초마다
    
    return () => {
      if (cleanupTimerRef.current) {
        clearInterval(cleanupTimerRef.current);
      }
    };
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
        console.log('⚠️ 기존 스트림 비활성 - 재생성');
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
      
      // Track 종료 이벤트
      stream.getTracks().forEach(track => {
        track.onended = () => {
          console.warn(`⚠️ Track 종료: ${track.kind}`);
        };
      });
      
      return stream;
    } catch (err) {
      console.error('❌ 미디어 접근 실패:', err);
      throw err;
    }
  }, []);

  // =========================================================================
  // Signaling (HTTP - 백업용)
  // =========================================================================
  
  const sendSignal = useCallback(async (toPeerId, type, payload = {}) => {
    if (!currentUser?.username) {
      console.warn('⚠️ currentUser 없음');
      return;
    }

    const message = {
      message_type: type,
      payload: JSON.stringify(payload),
      receiver_username: toPeerId,
    };

    console.log(`📤 HTTP 시그널 전송: ${type} → ${toPeerId}`);

    try {
      const response = await axios.post(
        `/video-meetings/${roomId}/send_signal/`, 
        message,
        { timeout: 10000 }
      );
      console.log(`✅ 시그널 전송 성공: ${response.data.id}`);
      return response.data;
    } catch (err) {
      console.error(`❌ Signal 전송 실패:`, err.message);
      throw err;
    }
  }, [roomId, currentUser]);

  // =========================================================================
  // Peer Connection
  // =========================================================================
  
  const createPeerConnection = useCallback(async (peerId, isInitiator) => {
    // Race condition 방지
    if (isCreatingConnection.current[peerId]) {
      console.log(`⏳ 연결 생성 대기: ${peerId}`);
      
      for (let i = 0; i < 50; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!isCreatingConnection.current[peerId]) {
          const existing = peerConnections.current[peerId];
          if (existing && existing.connectionState !== 'failed') {
            console.log(`✅ 대기 후 기존 연결 사용`);
            return existing;
          }
        }
      }
    }
    
    isCreatingConnection.current[peerId] = true;
    
    console.log(`🔧 Peer Connection 생성: ${peerId} (Initiator: ${isInitiator})`);
    
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
        
        if (connectionTimers.current[peerId]) {
          clearTimeout(connectionTimers.current[peerId]);
          delete connectionTimers.current[peerId];
        }
      }
      
      if (!localStreamRef.current) {
        throw new Error('Local Stream이 없습니다');
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);

      // 타임아웃 설정
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
          pc.addTrack(track, localStreamRef.current);
          console.log(`✅ ${track.kind} track 추가`);
        } catch (e) {
          console.error(`❌ Track 추가 실패:`, e);
        }
      });

      // ⭐ ICE Candidate 핸들러
      pc.onicecandidate = (event) => {
        if (event.candidate && sendSignalRef.current) {
          console.log(`📡 ICE Candidate 전송 (${peerId})`);
          sendSignalRef.current(peerId, 'ice_candidate', {
            candidate: event.candidate
          });
        }
      };

      // ⭐ Track 수신 핸들러
      pc.ontrack = (event) => {
        console.log(`🎥 Remote Track 수신! From: ${peerId}, Kind: ${event.track.kind}`);
        
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

      // ⭐ ICE 연결 상태 핸들러
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log(`🔌 ICE State (${peerId}): ${state}`);
        setConnectionStatus(prev => ({...prev, [peerId]: state}));
        
        if (state === 'connected') {
          console.log(`✅ ICE 연결 성공! (${peerId})`);
          
          if (connectionTimers.current[peerId]) {
            clearTimeout(connectionTimers.current[peerId]);
            delete connectionTimers.current[peerId];
          }
          
          // 대기 Candidates 처리
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
          
          if (pc.restartIce) {
            setTimeout(() => {
              console.log(`🔄 ICE 재시작 (${peerId})`);
              pc.restartIce();
            }, RECONNECT_DELAY);
          }
        } else if (state === 'disconnected') {
          console.warn(`⚠️ ICE 연결 끊김 (${peerId})`);
          
          setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected') {
              console.log(`🔄 연결 재생성 시도 (${peerId})`);
              delete peerConnections.current[peerId];
              createPeerConnection(peerId, isHost);
            }
          }, 5000);
        }
      };

      // ⭐ 연결 상태 핸들러
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log(`🔗 Connection State (${peerId}): ${state}`);
        
        if (state === 'failed' || state === 'closed') {
          setRemoteStreams(prev => prev.filter(s => s.peerId !== peerId));
          delete peerConnections.current[peerId];
        }
      };
      
      // ⭐ Negotiation needed 핸들러
      pc.onnegotiationneeded = async () => {
        console.log(`🔄 Negotiation needed (${peerId})`);
        
        if (isInitiator && pc.signalingState === 'stable') {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            if (sendSignalRef.current) {
              await sendSignalRef.current(peerId, 'offer', { sdp: pc.localDescription });
            }
          } catch (e) {
            console.error('❌ Renegotiation 실패:', e);
          }
        }
      };

      peerConnections.current[peerId] = pc;
      console.log(`✅ Peer Connection 저장 완료`);

      // ⭐ Initiator: Offer 생성
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
            
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            
            await pc.setLocalDescription(offer);
            
            if (sendSignalRef.current) {
              await sendSignalRef.current(peerId, 'offer', {
                sdp: pc.localDescription
              });
              console.log(`✅ Offer 전송 완료!`);
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
      delete isCreatingConnection.current[peerId];
    }
  }, [isHost]);

  // =========================================================================
  // Signal Processing Queue
  // =========================================================================
  
  const processSignalQueue = useCallback(async (peerId) => {
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
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }, []);
  
  const processWebRTCSignal = useCallback(async (peerId, type, data) => {
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
          console.log(`📥 Offer 처리 시작`);
          
          if (pc.signalingState === 'have-local-offer') {
            await pc.setLocalDescription({type: 'rollback'});
            console.log('✅ Rollback 완료');
          }
          
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          console.log(`✅ Remote Description set`);
          
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          console.log(`✅ Answer 생성 완료`);
          
          if (sendSignalRef.current) {
            await sendSignalRef.current(peerId, 'answer', { sdp: pc.localDescription });
          }
          console.log(`✅ Answer 전송 완료!`);
          break;
          
        case 'answer':
          console.log(`📥 Answer 처리 시작`);
          
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data));
            console.log(`✅ Answer 적용 완료!`);
          } else {
            console.warn(`⚠️ 비정상 상태: ${pc.signalingState}`);
          }
          break;
          
        case 'candidate':
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
  }, [createPeerConnection]);

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

    console.log(`📨 WebSocket 시그널 수신: ${type} from ${peerId}`);

    // Join 메시지 처리
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
        }, 300);
      }
      return;
    }

    let pc = peerConnections.current[peerId];

    if (!pc && type === 'offer') {
      pc = await createPeerConnection(peerId, false);
    }

    if (!pc) {
      console.warn(`⚠️ Peer Connection 없음`);
      return;
    }

    try {
      switch (type) {
        case 'offer':
          if (pc.signalingState === 'have-local-offer') {
            await pc.setLocalDescription({type: 'rollback'});
          }
          
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          if (sendSignalRef.current) {
            sendSignalRef.current(peerId, 'answer', {
              sdp: pc.localDescription
            });
          }
          break;

        case 'answer':
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          }
          break;

        case 'ice_candidate':
          if (data.candidate) {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } else {
              if (!pendingCandidates.current[peerId]) {
                pendingCandidates.current[peerId] = [];
              }
              pendingCandidates.current[peerId].push(new RTCIceCandidate(data.candidate));
            }
          }
          break;
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
      } catch (e) {
        console.error(`연결 종료 오류 (${peerId}):`, e);
      }
    });
    peerConnections.current = {};
    
    // Local Stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`🛑 Track 중지: ${track.kind}`);
      });
      localStreamRef.current = null;
    }
    
    // 타이머
    Object.values(connectionTimers.current).forEach(timer => clearTimeout(timer));
    connectionTimers.current = {};
    
    // 정리 타이머
    if (cleanupTimerRef.current) {
      clearInterval(cleanupTimerRef.current);
    }
    
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
    peerConnections,
    remoteStreams,
    connectionStatus,
    getLocalMedia,
    sendSignal,
    createPeerConnection,
    handleWebSocketSignal,
    processSignalQueue,
    cleanup,
  };
}