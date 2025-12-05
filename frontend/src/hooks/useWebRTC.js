// frontend/src/hooks/useWebRTC.js (수정 버전)
import { useState, useRef, useCallback } from 'react';
import axios from '../api/axios';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function useWebRTC(roomId, currentUser, isHost) {
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState({});
  
  const localStreamRef = useRef(null);
  const peerConnections = useRef({});
  const processedSignals = useRef(new Set());

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
          height: { ideal: 720 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
      });
      
      localStreamRef.current = stream;
      
      console.log('✅ 미디어 준비 완료');
      console.log(`   Video: ${stream.getVideoTracks().length}`);
      console.log(`   Audio: ${stream.getAudioTracks().length}`);
      
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

    const message = {
      message_type: type,
      payload: JSON.stringify(payload),
      receiver_username: toPeerId,
    };

    console.log(`📤 시그널 전송: ${type} → ${toPeerId}`);

    try {
      const response = await axios.post(`/video-meetings/${roomId}/send_signal/`, message);
      console.log(`✅ 시그널 전송 성공 (${type}):`, response.data.id);
      return response.data;
    } catch (err) {
      console.error(`❌ Signal 전송 실패 (${type}):`, err);
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
    console.log(`   Current User: ${currentUser?.username}`);
    console.log(`${'='.repeat(60)}\n`);
    
    // 기존 연결 확인
    const existing = peerConnections.current[peerId];
    if (existing) {
      const state = existing.connectionState;
      console.log(`♻️ 기존 연결 상태: ${state}`);
      
      if (state === 'connected') {
        console.log('✅ 이미 연결됨 - 재사용');
        return existing;
      } else if (state === 'connecting') {
        console.log('⏳ 연결 중 - 대기');
        return existing;
      } else {
        console.log('🗑️ 기존 연결 정리');
        try {
          existing.close();
        } catch (e) {
          console.error('연결 종료 중 오류:', e);
        }
        delete peerConnections.current[peerId];
      }
    }
    
    try {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      // ⭐ Local Tracks 먼저 추가 (연결 전)
      if (localStreamRef.current) {
        const tracks = localStreamRef.current.getTracks();
        console.log(`🎤 Local Tracks 추가 (${peerId}):`, tracks.map(t => t.kind));
        
        tracks.forEach(track => {
          try {
            pc.addTrack(track, localStreamRef.current);
            console.log(`✅ ${track.kind} track 추가 완료`);
          } catch (e) {
            console.error(`❌ Track 추가 실패:`, e);
          }
        });
      } else {
        console.error(`❌ Local Stream 없음!`);
      }

      // ICE Candidate 이벤트
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`📡 ICE Candidate (${peerId}):`, event.candidate.candidate.substring(0, 50) + '...');
          sendSignal(peerId, 'candidate', event.candidate.toJSON());
        } else {
          console.log(`✅ ICE Gathering 완료 (${peerId})`);
        }
      };

      // Remote Track 이벤트
      pc.ontrack = (event) => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🎥 Remote Track 수신!`);
        console.log(`   From: ${peerId}`);
        console.log(`   Kind: ${event.track.kind}`);
        console.log(`   Streams: ${event.streams.length}`);
        console.log(`${'='.repeat(60)}\n`);
        
        const remoteStream = event.streams[0];
        
        if (!remoteStream) {
          console.error(`❌ Remote Stream 없음`);
          return;
        }

        console.log(`📺 Remote Stream ID: ${remoteStream.id}`);
        console.log(`   Tracks: ${remoteStream.getTracks().map(t => t.kind).join(', ')}`);
        
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
      };

      // ICE Connection State 변경
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log(`🔌 ICE State (${peerId}): ${state}`);
        
        setConnectionStatus(prev => ({...prev, [peerId]: state}));
        
        if (state === 'failed' || state === 'disconnected') {
          console.error(`❌ ICE 연결 실패/중단 (${peerId})`);
          setTimeout(() => {
            if (pc.restartIce) {
              console.log(`🔄 ICE 재시작 시도 (${peerId})`);
              pc.restartIce();
            }
          }, 1000);
        } else if (state === 'connected') {
          console.log(`✅✅✅ ICE 연결 성공! (${peerId})`);
        }
      };

      // Connection State 변경
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log(`🔗 Connection State (${peerId}): ${state}`);
        
        if (state === 'connected') {
          console.log(`\n${'🎉'.repeat(20)}`);
          console.log(`   ✅✅✅ Peer 연결 완료! (${peerId})`);
          console.log(`${'🎉'.repeat(20)}\n`);
        } else if (state === 'failed') {
          console.error(`❌ Peer 연결 실패 (${peerId})`);
        }
      };

      // 저장
      peerConnections.current[peerId] = pc;

      // ⭐ Initiator가 Offer 생성
      if (isInitiator) {
        console.log(`🎬 Initiator: Offer 생성 시작 (${peerId})`);
        
        // 약간의 딜레이 후 Offer 생성
        setTimeout(async () => {
          try {
            if (pc.signalingState !== 'stable') {
              console.warn(`⚠️ Signaling state not stable: ${pc.signalingState}`);
              return;
            }
            
            console.log(`📝 Creating Offer for ${peerId}...`);
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            
            console.log(`📄 Offer SDP (${peerId}):\n`, offer.sdp.substring(0, 200) + '...');
            
            await pc.setLocalDescription(offer);
            console.log(`✅ Local Description set (${peerId})`);
            
            await sendSignal(peerId, 'offer', pc.localDescription.toJSON());
            console.log(`✅✅ Offer 전송 완료! (${peerId})`);
          } catch (e) {
            console.error(`❌ Offer 생성/전송 실패 (${peerId}):`, e);
          }
        }, 500);
      }
      
      return pc;
    } catch (e) {
      console.error('❌ Peer Connection 생성 오류:', e);
      return null;
    }
  }, [sendSignal, currentUser]);

  // =========================================================================
  // Signal Handling
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
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📨 시그널 수신`);
    console.log(`   Type: ${type}`);
    console.log(`   From: ${peerId}`);
    console.log(`   To: ${receiver_username || 'all'}`);
    console.log(`   Signal ID: ${signalId}`);
    console.log(`${'='.repeat(60)}\n`);
    
    // 자신의 시그널 무시
    if (peerId === currentUser?.username) {
      console.log('⏭️ 자신의 시그널 무시');
      processedSignals.current.add(signalId);
      return;
    }

    // 수신자 확인
    if (receiver_username && receiver_username !== currentUser?.username) {
      console.log('⏭️ 다른 수신자의 시그널 무시');
      processedSignals.current.add(signalId);
      return;
    }

    let data;
    try {
      data = JSON.parse(payload);
    } catch (e) {
      console.error('❌ Payload 파싱 실패:', e);
      processedSignals.current.add(signalId);
      return;
    }

    // Approval 시그널 처리
    if (type === 'approval' && !isHost) {
      console.log('🎉 승인 알림 수신!');
      processedSignals.current.add(signalId);
      if (fetchRoomDetails) {
        await fetchRoomDetails();
      }
      return;
    }
    
    // Join Ready 시그널 처리
    if (type === 'join_ready') {
      console.log(`📢 Join Ready 수신 from ${peerId}`);
      processedSignals.current.add(signalId);
      
      if (isHost) {
        console.log(`👑 방장이 Join Ready 수신 - 피어 연결 시작`);
        
        setTimeout(() => {
          const existingPc = peerConnections.current[peerId];
          
          if (!existingPc || existingPc.connectionState === 'failed' || existingPc.connectionState === 'closed') {
            console.log(`🆕 새로운 Peer Connection 생성: ${peerId}`);
            createPeerConnection(peerId, true);
          } else {
            console.log(`♻️ 기존 연결 존재 (${existingPc.connectionState}) - Offer 재전송`);
            
            if (existingPc.signalingState === 'stable') {
              existingPc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
              }).then(offer => {
                return existingPc.setLocalDescription(offer);
              }).then(() => {
                return sendSignal(peerId, 'offer', existingPc.localDescription.toJSON());
              }).then(() => {
                console.log(`✅ Offer 재전송 완료 (${peerId})`);
              }).catch(e => {
                console.error(`❌ Offer 재전송 실패 (${peerId}):`, e);
              });
            }
          }
        }, 500);
      }
      return;
    }
    
    // WebRTC 시그널 처리
    let pc = peerConnections.current[peerId];
    
    if (!pc && type === 'offer') {
      console.log(`🆕 Offer 수신 - 새 연결 생성: ${peerId}`);
      pc = createPeerConnection(peerId, false);
      if (!pc) {
        console.error('❌ Peer Connection 생성 실패');
        processedSignals.current.add(signalId);
        return;
      }
    } else if (!pc) {
      console.warn(`⚠️ Peer Connection 없음: ${peerId} (type: ${type})`);
      processedSignals.current.add(signalId);
      return;
    }
    
    try {
      switch (type) {
        case 'offer':
          console.log(`📥 Offer 처리 시작 (${peerId})`);
          console.log(`   Signaling State: ${pc.signalingState}`);
          
          if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-remote-offer') {
            if (pc.signalingState === 'have-local-offer') {
              console.log('🔄 로컬 Offer 롤백...');
              await pc.setLocalDescription({type: 'rollback'});
            }
          }
          
          console.log(`📄 Setting Remote Description...`);
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          console.log(`✅ Remote Description set`);
          
          console.log(`📝 Creating Answer...`);
          const answer = await pc.createAnswer();
          console.log(`📄 Answer SDP:\n`, answer.sdp.substring(0, 200) + '...');
          
          await pc.setLocalDescription(answer);
          console.log(`✅ Local Description (Answer) set`);
          
          await sendSignal(peerId, 'answer', pc.localDescription.toJSON());
          console.log(`✅✅ Answer 전송 완료! (${peerId})`);
          break;
          
        case 'answer':
          console.log(`📥 Answer 처리 시작 (${peerId})`);
          console.log(`   Signaling State: ${pc.signalingState}`);
          
          if (pc.signalingState === 'have-local-offer') {
            console.log(`📄 Setting Remote Description (Answer)...`);
            await pc.setRemoteDescription(new RTCSessionDescription(data));
            console.log(`✅✅ Answer 적용 완료! (${peerId})`);
          } else {
            console.warn(`⚠️ Unexpected state for Answer: ${pc.signalingState}`);
          }
          break;
          
        case 'candidate':
          if (data && data.candidate) {
            if (pc.remoteDescription) {
              console.log(`📡 ICE Candidate 추가 (${peerId})`);
              await pc.addIceCandidate(new RTCIceCandidate(data));
              console.log(`✅ ICE Candidate 추가 완료`);
            } else {
              console.warn(`⚠️ Remote Description 없음 - Candidate 보류`);
            }
          }
          break;
      }
      
      processedSignals.current.add(signalId);
      
    } catch (e) {
      console.error(`❌ 시그널 처리 오류 (${type}, ${peerId}):`, e);
      processedSignals.current.add(signalId);
    }
  }, [currentUser, isHost, createPeerConnection, sendSignal]);

  // =========================================================================
  // Cleanup
  // =========================================================================
  
  const cleanup = useCallback(() => {
    console.log('🧹 WebRTC 정리...');
    
    Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
      console.log(`🗑️ 연결 종료: ${peerId}`);
      try {
        pc.close();
      } catch (e) {
        console.error(`연결 종료 오류 (${peerId}):`, e);
      }
    });
    peerConnections.current = {};
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      localStreamRef.current = null;
    }
    
    processedSignals.current.clear();
    setRemoteStreams([]);
    setConnectionStatus({});
    
    console.log('✅ WebRTC 정리 완료');
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