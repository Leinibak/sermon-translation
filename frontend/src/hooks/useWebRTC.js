// frontend/src/hooks/useWebRTC.js (수정 버전)
import { useState, useRef, useCallback } from 'react';
import axios from '../api/axios';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export function useWebRTC(roomId, currentUser, isHost) {
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState({});
  
  const localStreamRef = useRef(null);
  const peerConnections = useRef({});
  const processedSignals = useRef(new Set());
  const pendingCandidates = useRef({});

  // =========================================================================
  // Local Media
  // =========================================================================
  
  const getLocalMedia = useCallback(async () => {
    if (localStreamRef.current) {
      console.log('✅ 기존 스트림 재사용');
      return localStreamRef.current;
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
          autoGainControl: true,
          sampleRate: 48000
        },
      });
      
      localStreamRef.current = stream;
      
      console.log('✅ 미디어 준비 완료');
      console.log(`   Video tracks: ${stream.getVideoTracks().length}`);
      console.log(`   Audio tracks: ${stream.getAudioTracks().length}`);
      
      stream.getTracks().forEach(track => {
        console.log(`   - ${track.kind}: ${track.label} (enabled: ${track.enabled})`);
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

    // ⭐⭐⭐ payload를 JSON 문자열로 변환
    const payloadString = JSON.stringify(payload);

    const message = {
      message_type: type,
      payload: payloadString,  // ⭐ 문자열로 전송
      receiver_username: toPeerId,
    };

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📤 시그널 전송: ${type} → ${toPeerId}`);
    console.log(`   Payload: ${payloadString.substring(0, 100)}...`);
    console.log(`${'='.repeat(60)}\n`);

    try {
      const response = await axios.post(`/video-meetings/${roomId}/send_signal/`, message);
      console.log(`✅ 시그널 전송 성공 (${type}): ID ${response.data.id}`);
      return response.data;
    } catch (err) {
      console.error(`❌ Signal 전송 실패 (${type}):`, err);
      console.error('Error details:', err.response?.data);
      throw err;
    }
  }, [roomId, currentUser]);

  // =========================================================================
  // Peer Connection
  // =========================================================================
  
  const createPeerConnection = useCallback((peerId, isInitiator) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔧 Peer Connection 생성`);
    console.log(`   Peer: ${peerId}`);
    console.log(`   Initiator: ${isInitiator}`);
    console.log(`${'='.repeat(60)}\n`);
    
    const existing = peerConnections.current[peerId];
    if (existing) {
      const state = existing.connectionState;
      console.log(`♻️ 기존 연결 발견: ${state}`);
      
      if (state === 'connected') {
        console.log('✅ 이미 연결됨 - 기존 연결 유지');
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
    
    try {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      if (!localStreamRef.current) {
        console.error('❌ CRITICAL: Local Stream이 없습니다!');
        return null;
      }

      // Local Tracks 추가
      const tracks = localStreamRef.current.getTracks();
      console.log(`📡 Local Tracks 추가 시작: ${tracks.length}개`);
      
      tracks.forEach(track => {
        try {
          pc.addTrack(track, localStreamRef.current);
          console.log(`✅ ${track.kind} track 추가 성공`);
        } catch (e) {
          console.error(`❌ ${track.kind} track 추가 실패:`, e);
        }
      });

      // Event Handlers
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`📡 ICE Candidate 생성 (${peerId})`);
          sendSignal(peerId, 'candidate', event.candidate.toJSON())
            .catch(e => console.error('ICE Candidate 전송 실패:', e));
        } else {
          console.log(`✅ ICE Gathering 완료 (${peerId})`);
        }
      };

      pc.ontrack = (event) => {
        console.log(`\n${'🎉'.repeat(30)}`);
        console.log(`🎥 Remote Track 수신! From: ${peerId}`);
        console.log(`   Kind: ${event.track.kind}`);
        console.log(`${'🎉'.repeat(30)}\n`);
        
        if (event.streams.length > 0) {
          const remoteStream = event.streams[0];
          
          setRemoteStreams(prev => {
            const existingIndex = prev.findIndex(p => p.peerId === peerId);
            
            if (existingIndex >= 0) {
              console.log(`♻️ Remote Stream 업데이트: ${peerId}`);
              const updated = [...prev];
              updated[existingIndex] = { 
                ...updated[existingIndex], 
                stream: remoteStream 
              };
              return updated;
            }
            
            console.log(`🆕 Remote Stream 추가: ${peerId}`);
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
          console.log(`✅✅✅ ICE 연결 성공! (${peerId})`);
          
          // 대기 중인 ICE Candidates 처리
          if (pendingCandidates.current[peerId]) {
            console.log(`📦 대기 Candidates 처리: ${pendingCandidates.current[peerId].length}개`);
            pendingCandidates.current[peerId].forEach(candidate => {
              pc.addIceCandidate(candidate)
                .then(() => console.log('✅ 대기 Candidate 추가 성공'))
                .catch(e => console.error('❌ 대기 Candidate 추가 실패:', e));
            });
            delete pendingCandidates.current[peerId];
          }
        } else if (state === 'failed') {
          console.error(`❌ ICE 연결 실패 (${peerId})`);
          if (pc.restartIce) {
            console.log(`🔄 ICE 재시작 시도`);
            pc.restartIce();
          }
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`🔗 Connection State (${peerId}): ${pc.connectionState}`);
      };

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
                  if (pc.signalingState === 'stable') {
                    clearInterval(check);
                    resolve();
                  }
                }, 100);
                setTimeout(() => { clearInterval(check); resolve(); }, 3000);
              });
            }
            
            console.log(`📝 Creating Offer...`);
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
        }, 1500);
      }
      
      return pc;
    } catch (e) {
      console.error('❌ Peer Connection 생성 오류:', e);
      return null;
    }
  }, [sendSignal]);

  // =========================================================================
  // Signal Handling
  // =========================================================================
  
  const handleSignal = useCallback(async (signal, fetchRoomDetails) => {
    const { 
      id: signalId, 
      sender_username: peerId, 
      message_type: type, 
      payload,  // ⭐ 이제 JSON 문자열로 옴
      receiver_username 
    } = signal;
    
    if (processedSignals.current.has(signalId)) {
      return;
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📨 시그널 수신`);
    console.log(`   Signal ID: ${signalId}`);
    console.log(`   Type: ${type}`);
    console.log(`   From: ${peerId}`);
    console.log(`   To: ${receiver_username || 'all'}`);
    console.log(`${'='.repeat(60)}\n`);
    
    if (peerId === currentUser?.username) {
      console.log('⏭️ 자신의 시그널 무시');
      processedSignals.current.add(signalId);
      return;
    }

    if (receiver_username && receiver_username !== currentUser?.username) {
      console.log(`⏭️ 다른 수신자의 시그널 무시`);
      processedSignals.current.add(signalId);
      return;
    }

    // ⭐⭐⭐ payload 파싱 처리 개선
    let data;
    try {
      // payload가 문자열이면 파싱, 아니면 그대로 사용
      if (typeof payload === 'string') {
        if (payload === '' || payload === 'undefined') {
          data = {};
        } else {
          data = JSON.parse(payload);
        }
      } else {
        data = payload || {};
      }
    } catch (e) {
      console.error('❌ Payload 파싱 실패:', e);
      console.error('   Payload:', payload);
      processedSignals.current.add(signalId);
      return;
    }

    // Join Ready 처리
    if (type === 'join_ready') {
      console.log(`📢 Join Ready 수신! From: ${peerId}`);
      processedSignals.current.add(signalId);
      
      if (isHost) {
        console.log(`👑 방장이 Join Ready 수신 - Peer Connection 생성`);
        
        setTimeout(() => {
          const existingPc = peerConnections.current[peerId];
          
          if (!existingPc || existingPc.connectionState === 'failed' || existingPc.connectionState === 'closed') {
            console.log(`🆕 새 Peer Connection 생성`);
            createPeerConnection(peerId, true);
          } else {
            console.log(`✅ 기존 연결 유지 (${existingPc.connectionState})`);
          }
        }, 300);
      }
      return;
    }
    
    // WebRTC 시그널 처리
    let pc = peerConnections.current[peerId];
    
    if (!pc && type === 'offer') {
      console.log(`🆕 Offer 수신 - 새 연결 생성`);
      pc = createPeerConnection(peerId, false);
      if (!pc) {
        console.error('❌ Peer Connection 생성 실패');
        processedSignals.current.add(signalId);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    } else if (!pc) {
      console.warn(`⚠️ Peer Connection 없음: ${peerId}`);
      processedSignals.current.add(signalId);
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
          console.log(`✅ Answer 생성 및 설정 완료`);
          
          await sendSignal(peerId, 'answer', pc.localDescription.toJSON());
          console.log(`✅✅✅ Answer 전송 완료!`);
          break;
          
        case 'answer':
          console.log(`📥 Answer 처리 시작`);
          
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data));
            console.log(`✅✅✅ Answer 적용 완료!`);
          }
          break;
          
        case 'candidate':
          console.log(`📥 ICE Candidate 처리`);
          
          if (data && data.candidate) {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(data));
              console.log(`✅ ICE Candidate 추가 성공`);
            } else {
              console.warn(`⚠️ Remote Description 없음 - 대기 큐에 추가`);
              if (!pendingCandidates.current[peerId]) {
                pendingCandidates.current[peerId] = [];
              }
              pendingCandidates.current[peerId].push(new RTCIceCandidate(data));
            }
          }
          break;
      }
      
      processedSignals.current.add(signalId);
      
    } catch (e) {
      console.error(`❌ 시그널 처리 오류 (${type}):`, e);
      processedSignals.current.add(signalId);
    }
  }, [currentUser, isHost, createPeerConnection, sendSignal]);

  // =========================================================================
  // Cleanup
  // =========================================================================
  
  const cleanup = useCallback(() => {
    console.log('\n🧹 WebRTC 정리...');
    
    Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
      try {
        pc.close();
      } catch (e) {}
    });
    peerConnections.current = {};
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    processedSignals.current.clear();
    pendingCandidates.current = {};
    setRemoteStreams([]);
    setConnectionStatus({});
    
    console.log('✅ 정리 완료');
  }, []);

  return {
    localStreamRef,
    remoteStreams,
    connectionStatus,
    getLocalMedia,
    sendSignal,
    createPeerConnection,
    handleSignal,
    cleanup,
  };
}