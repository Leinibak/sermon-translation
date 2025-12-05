// frontend/src/hooks/useWebRTC.js (개선 버전)
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
  const pendingCandidates = useRef({}); // ⭐ ICE Candidate 대기 큐

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
      
      // ⭐ Track 정보 상세 로깅
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

    const message = {
      message_type: type,
      payload: JSON.stringify(payload),
      receiver_username: toPeerId,
    };

    console.log(`📤 시그널 전송: ${type} → ${toPeerId}`);

    try {
      const response = await axios.post(`/video-meetings/${roomId}/send_signal/`, message);
      console.log(`✅ 시그널 전송 성공 (${type}): ID ${response.data.id}`);
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
    
    // ⭐ 기존 연결이 있으면 정리
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

      // ⭐⭐⭐ CRITICAL: Local Stream이 준비되었는지 확인
      if (!localStreamRef.current) {
        console.error('❌ CRITICAL: Local Stream이 없습니다!');
        return null;
      }

      // ⭐⭐⭐ 1단계: Local Tracks 즉시 추가 (Offer 생성 전)
      const tracks = localStreamRef.current.getTracks();
      console.log(`\n📡 Local Tracks 추가 시작 (${peerId})`);
      console.log(`   총 Tracks: ${tracks.length}`);
      
      tracks.forEach(track => {
        try {
          console.log(`   추가 중: ${track.kind} - ${track.label}`);
          console.log(`     Track ID: ${track.id}`);
          console.log(`     Enabled: ${track.enabled}`);
          console.log(`     ReadyState: ${track.readyState}`);
          
          const sender = pc.addTrack(track, localStreamRef.current);
          
          console.log(`   ✅ ${track.kind} track 추가 성공`);
          console.log(`     Sender Track ID: ${sender.track?.id}`);
        } catch (e) {
          console.error(`   ❌ ${track.kind} track 추가 실패:`, e);
        }
      });
      
      // ⭐ 추가된 Senders 확인
      const senders = pc.getSenders();
      console.log(`\n📊 추가된 Senders: ${senders.length}`);
      senders.forEach((sender, idx) => {
        if (sender.track) {
          console.log(`   ${idx + 1}. ${sender.track.kind}: ${sender.track.id}`);
        }
      });
      console.log('');

      // ⭐⭐⭐ 2단계: 이벤트 핸들러 설정
      
      // ICE Candidate
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`📡 ICE Candidate 생성 (${peerId})`);
          console.log(`   Type: ${event.candidate.type}`);
          console.log(`   Protocol: ${event.candidate.protocol}`);
          sendSignal(peerId, 'candidate', event.candidate.toJSON())
            .catch(e => console.error('ICE Candidate 전송 실패:', e));
        } else {
          console.log(`✅ ICE Gathering 완료 (${peerId})`);
        }
      };

      // ⭐⭐⭐ Remote Track - 가장 중요!
      pc.ontrack = (event) => {
        console.log(`\n${'🎉'.repeat(30)}`);
        console.log(`🎥 Remote Track 수신!`);
        console.log(`   From: ${peerId}`);
        console.log(`   Kind: ${event.track.kind}`);
        console.log(`   Track ID: ${event.track.id}`);
        console.log(`   Track Label: ${event.track.label}`);
        console.log(`   Track State: ${event.track.readyState}`);
        console.log(`   Track Enabled: ${event.track.enabled}`);
        console.log(`   Streams Count: ${event.streams.length}`);
        
        if (event.streams.length > 0) {
          const remoteStream = event.streams[0];
          console.log(`   Stream ID: ${remoteStream.id}`);
          console.log(`   Stream Active: ${remoteStream.active}`);
          
          const streamTracks = remoteStream.getTracks();
          console.log(`   Stream Tracks: ${streamTracks.length}`);
          streamTracks.forEach(t => {
            console.log(`     - ${t.kind}: ${t.id} (enabled: ${t.enabled}, state: ${t.readyState})`);
          });
          
          // ⭐ Remote Stream 상태 업데이트
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
          
          console.log(`✅✅✅ Remote Stream 설정 완료!`);
        } else {
          console.error(`❌ Remote Stream 없음!`);
        }
        
        console.log(`${'🎉'.repeat(30)}\n`);
      };

      // Negotiation Needed (디버깅용)
      pc.onnegotiationneeded = async () => {
        console.log(`🔄 Negotiation needed (${peerId})`);
      };

      // ICE Connection State
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log(`🔌 ICE State (${peerId}): ${state}`);
        
        setConnectionStatus(prev => ({...prev, [peerId]: state}));
        
        if (state === 'connected') {
          console.log(`✅✅✅ ICE 연결 성공! (${peerId})`);
        } else if (state === 'failed') {
          console.error(`❌ ICE 연결 실패 (${peerId})`);
          // ICE 재시작 시도
          if (pc.restartIce) {
            console.log(`🔄 ICE 재시작 시도 (${peerId})`);
            pc.restartIce();
          }
        } else if (state === 'disconnected') {
          console.warn(`⚠️ ICE 연결 끊김 (${peerId})`);
        }
      };

      // Connection State
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log(`🔗 Connection State (${peerId}): ${state}`);
        
        if (state === 'connected') {
          console.log(`\n${'🎊'.repeat(30)}`);
          console.log(`   ✅✅✅ Peer 연결 완료! (${peerId})`);
          console.log(`${'🎊'.repeat(30)}\n`);
          
          // ⭐ 대기 중인 ICE Candidates 처리
          if (pendingCandidates.current[peerId]) {
            console.log(`📦 대기 중인 ICE Candidates 처리: ${pendingCandidates.current[peerId].length}개`);
            pendingCandidates.current[peerId].forEach(candidate => {
              pc.addIceCandidate(candidate)
                .then(() => console.log('✅ 대기 Candidate 추가 성공'))
                .catch(e => console.error('❌ 대기 Candidate 추가 실패:', e));
            });
            delete pendingCandidates.current[peerId];
          }
        } else if (state === 'failed') {
          console.error(`❌ Peer 연결 실패 (${peerId})`);
        }
      };

      // ICE Gathering State
      pc.onicegatheringstatechange = () => {
        console.log(`📊 ICE Gathering State (${peerId}): ${pc.iceGatheringState}`);
      };

      // Signaling State
      pc.onsignalingstatechange = () => {
        console.log(`📝 Signaling State (${peerId}): ${pc.signalingState}`);
      };

      // 저장
      peerConnections.current[peerId] = pc;
      console.log(`✅ Peer Connection 저장 완료 (${peerId})`);

      // ⭐⭐⭐ 3단계: Initiator가 Offer 생성 (Track 추가 후)
      if (isInitiator) {
        console.log(`\n🎬 Initiator: Offer 생성 시작 (${peerId})`);
        
        // ⭐ Track 추가 후 충분한 대기 시간
        setTimeout(async () => {
          try {
            if (pc.signalingState !== 'stable') {
              console.warn(`⚠️ Signaling state not stable: ${pc.signalingState}`);
              // Stable 상태가 아니면 대기
              await new Promise(resolve => {
                const checkState = setInterval(() => {
                  if (pc.signalingState === 'stable') {
                    clearInterval(checkState);
                    resolve();
                  }
                }, 100);
                
                setTimeout(() => {
                  clearInterval(checkState);
                  resolve();
                }, 3000);
              });
            }
            
            console.log(`📝 Creating Offer for ${peerId}...`);
            console.log(`   현재 Senders: ${pc.getSenders().length}`);
            
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            
            console.log(`✅ Offer 생성 완료`);
            console.log(`   Type: ${offer.type}`);
            console.log(`   SDP 길이: ${offer.sdp.length} bytes`);
            console.log(`   Audio: ${offer.sdp.includes('m=audio') ? 'Yes' : 'No'}`);
            console.log(`   Video: ${offer.sdp.includes('m=video') ? 'Yes' : 'No'}`);
            
            await pc.setLocalDescription(offer);
            console.log(`✅ Local Description set`);
            console.log(`   Signaling State: ${pc.signalingState}`);
            
            await sendSignal(peerId, 'offer', pc.localDescription.toJSON());
            console.log(`✅✅✅ Offer 전송 완료! (${peerId})\n`);
          } catch (e) {
            console.error(`❌ Offer 생성/전송 실패 (${peerId}):`, e);
            console.error('Stack:', e.stack);
          }
        }, 1500); // ⭐ 1.5초 대기 (충분한 시간 확보)
      }
      
      return pc;
    } catch (e) {
      console.error('❌ Peer Connection 생성 오류:', e);
      console.error('Stack:', e.stack);
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
    console.log(`   Signal ID: ${signalId}`);
    console.log(`   Type: ${type}`);
    console.log(`   From: ${peerId}`);
    console.log(`   To: ${receiver_username || 'broadcast'}`);
    console.log(`${'='.repeat(60)}\n`);
    
    // 자신의 시그널 무시
    if (peerId === currentUser?.username) {
      console.log('⏭️ 자신의 시그널 무시');
      processedSignals.current.add(signalId);
      return;
    }

    // 수신자 확인
    if (receiver_username && receiver_username !== currentUser?.username) {
      console.log(`⏭️ 다른 수신자의 시그널 무시 (to: ${receiver_username})`);
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

    // ⭐⭐⭐ Join Ready 시그널 처리 (방장만)
    if (type === 'join_ready') {
      console.log(`\n${'📢'.repeat(30)}`);
      console.log(`📢 Join Ready 수신!`);
      console.log(`   From: ${peerId}`);
      console.log(`   Is Host: ${isHost}`);
      console.log(`${'📢'.repeat(30)}\n`);
      
      processedSignals.current.add(signalId);
      
      if (isHost) {
        console.log(`👑 방장이 Join Ready 수신 - Peer Connection 생성 시작`);
        
        // ⭐ 즉시 연결 생성 (대기 시간 최소화)
        setTimeout(() => {
          const existingPc = peerConnections.current[peerId];
          
          if (!existingPc) {
            console.log(`🆕 새로운 Peer Connection 생성 (Initiator): ${peerId}`);
            createPeerConnection(peerId, true);
          } else {
            const state = existingPc.connectionState;
            console.log(`♻️ 기존 연결 존재 (${state})`);
            
            if (state === 'failed' || state === 'closed') {
              console.log(`🔄 연결 재생성 필요 (${state})`);
              delete peerConnections.current[peerId];
              createPeerConnection(peerId, true);
            } else if (state === 'new' || state === 'connecting') {
              console.log(`⏳ 연결 진행 중... 대기`);
            } else {
              console.log(`✅ 연결 유지`);
            }
          }
        }, 300); // ⭐ 300ms 대기 (빠른 응답)
      } else {
        console.log(`👤 참가자는 Join Ready를 무시`);
      }
      return;
    }
    
    // ⭐⭐⭐ WebRTC 시그널 처리
    let pc = peerConnections.current[peerId];
    
    if (!pc && type === 'offer') {
      console.log(`🆕 Offer 수신 - 새 연결 생성: ${peerId}`);
      pc = createPeerConnection(peerId, false);
      
      if (!pc) {
        console.error('❌ CRITICAL: Peer Connection 생성 실패!');
        processedSignals.current.add(signalId);
        return;
      }
      
      // ⭐ PC 생성 직후 약간의 대기 (안정화)
      await new Promise(resolve => setTimeout(resolve, 500));
    } else if (!pc) {
      console.warn(`⚠️ Peer Connection 없음: ${peerId} (type: ${type})`);
      processedSignals.current.add(signalId);
      return;
    }
    
    try {
      switch (type) {
        case 'offer':
          console.log(`\n📥 Offer 처리 시작 (${peerId})`);
          console.log(`   Signaling State: ${pc.signalingState}`);
          console.log(`   Connection State: ${pc.connectionState}`);
          
          // ⭐ Signaling State 확인 및 처리
          if (pc.signalingState === 'have-local-offer') {
            console.log('🔄 Rollback 필요 (have-local-offer)');
            await pc.setLocalDescription({type: 'rollback'});
            console.log('✅ Rollback 완료');
          }
          
          console.log(`📝 Setting Remote Description (Offer)...`);
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          console.log(`✅ Remote Description set`);
          console.log(`   New Signaling State: ${pc.signalingState}`);
          
          console.log(`📝 Creating Answer...`);
          const answer = await pc.createAnswer();
          console.log(`✅ Answer 생성 완료`);
          console.log(`   Audio: ${answer.sdp.includes('m=audio') ? 'Yes' : 'No'}`);
          console.log(`   Video: ${answer.sdp.includes('m=video') ? 'Yes' : 'No'}`);
          
          await pc.setLocalDescription(answer);
          console.log(`✅ Local Description (Answer) set`);
          
          await sendSignal(peerId, 'answer', pc.localDescription.toJSON());
          console.log(`✅✅✅ Answer 전송 완료! (${peerId})\n`);
          break;
          
        case 'answer':
          console.log(`\n📥 Answer 처리 시작 (${peerId})`);
          console.log(`   Signaling State: ${pc.signalingState}`);
          console.log(`   Connection State: ${pc.connectionState}`);
          
          if (pc.signalingState === 'have-local-offer') {
            console.log(`📝 Setting Remote Description (Answer)...`);
            await pc.setRemoteDescription(new RTCSessionDescription(data));
            console.log(`✅✅✅ Answer 적용 완료! (${peerId})`);
            console.log(`   New Signaling State: ${pc.signalingState}\n`);
          } else {
            console.warn(`⚠️ Unexpected state for Answer: ${pc.signalingState}`);
            console.warn(`   무시하고 계속 진행...`);
          }
          break;
          
        case 'candidate':
          console.log(`📥 ICE Candidate 처리 (${peerId})`);
          
          if (data && data.candidate) {
            console.log(`   Candidate: ${data.candidate.substring(0, 50)}...`);
            console.log(`   Remote Description: ${pc.remoteDescription ? 'Yes' : 'No'}`);
            
            if (pc.remoteDescription) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(data));
                console.log(`✅ ICE Candidate 추가 성공`);
              } catch (e) {
                console.error(`❌ ICE Candidate 추가 실패:`, e);
              }
            } else {
              console.warn(`⚠️ Remote Description 없음 - Candidate 대기 큐에 추가`);
              if (!pendingCandidates.current[peerId]) {
                pendingCandidates.current[peerId] = [];
              }
              pendingCandidates.current[peerId].push(new RTCIceCandidate(data));
              console.log(`   대기 큐 크기: ${pendingCandidates.current[peerId].length}`);
            }
          }
          break;
          
        default:
          console.warn(`⚠️ 알 수 없는 시그널: ${type}`);
      }
      
      processedSignals.current.add(signalId);
      
    } catch (e) {
      console.error(`❌ 시그널 처리 오류 (${type}, ${peerId}):`, e);
      console.error('Stack:', e.stack);
      processedSignals.current.add(signalId);
    }
  }, [currentUser, isHost, createPeerConnection, sendSignal]);

  // =========================================================================
  // Cleanup
  // =========================================================================
  
  const cleanup = useCallback(() => {
    console.log('\n🧹 WebRTC 정리 시작...');
    
    // Peer Connections 정리
    Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
      console.log(`🗑️ 연결 종료: ${peerId} (state: ${pc.connectionState})`);
      try {
        pc.close();
      } catch (e) {
        console.error(`연결 종료 오류 (${peerId}):`, e);
      }
    });
    peerConnections.current = {};
    
    // Local Stream 정리
    if (localStreamRef.current) {
      console.log('🗑️ Local Stream 정리');
      localStreamRef.current.getTracks().forEach(track => {
        console.log(`   - Stopping ${track.kind}: ${track.label}`);
        track.stop();
      });
      localStreamRef.current = null;
    }
    
    // 기타 정리
    processedSignals.current.clear();
    pendingCandidates.current = {};
    setRemoteStreams([]);
    setConnectionStatus({});
    
    console.log('✅ WebRTC 정리 완료\n');
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