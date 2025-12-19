// frontend/src/hooks/useWebRTC.js (버그 수정 버전)
import { useState, useRef, useCallback, useEffect } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  sdpSemantics: 'unified-plan'
};

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

const isMobileDevice = () => {
  if (navigator.userAgentData && navigator.userAgentData.mobile !== undefined) {
    return navigator.userAgentData.mobile;
  }
  
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) ||
    ('ontouchstart' in window && navigator.maxTouchPoints > 0)
  );
};

export function useWebRTC(roomId, currentUser, isHost, sendWebRTCSignal) {
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState({});
  
  const localStreamRef = useRef(null);
  const peerConnections = useRef({});
  const pendingCandidates = useRef({});
  const isCreatingConnection = useRef({});
  const processedSignals = useRef(new Set());
  
  // ⭐⭐⭐ sendWebRTCSignal 최신 참조 유지
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
      const isActive = tracks.every(track => track.readyState === 'live');
      
      if (isActive) {
        console.log('✅ 기존 스트림 재사용');
        return localStreamRef.current;
      }
      
      console.log('⚠️ 기존 스트림 비활성 - 정리');
      tracks.forEach(track => track.stop());
      localStreamRef.current = null;
    }

    try {
      const isMobile = isMobileDevice();
      const isiOS = isIOS();
      
      const constraints = {
        video: isMobile ? {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          facingMode: 'user',
          frameRate: { ideal: isiOS ? 15 : 24, max: 30 }
        } : {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: isiOS ? 16000 : (isMobile ? 16000 : 48000)
        }
      };
      
      console.log('🎥 미디어 제약:', { iOS: isiOS, Mobile: isMobile });
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      
      console.log('✅ 미디어 준비 완료');
      return stream;
    } catch (err) {
      console.error('❌ 미디어 접근 실패:', err);
      
      if (err.name === 'NotAllowedError') {
        alert(
          isIOS() 
            ? '📱 카메라/마이크 권한 허용\n\n설정 > Safari > 카메라/마이크'
            : '카메라와 마이크 권한을 허용해주세요.'
        );
      } else if (err.name === 'NotFoundError') {
        alert('카메라 또는 마이크를 찾을 수 없습니다.');
      } else if (err.name === 'NotReadableError') {
        alert('카메라/마이크가 다른 앱에서 사용 중일 수 있습니다.\n\n백그라운드 앱을 종료하고 다시 시도해주세요.');
      }
      
      throw err;
    }
  }, []);

  // =========================================================================
  // ⭐⭐⭐ Peer Connection 생성 (isInitiator 매개변수로 받음)
  // =========================================================================
  const createPeerConnection = useCallback(async (peerUsername, isInitiator) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔧 Peer Connection 생성`);
    console.log(`   Peer Username: ${peerUsername}`);
    console.log(`   Initiator: ${isInitiator}`);
    console.log(`   Current User: ${currentUser?.username}`);
    console.log(`${'='.repeat(60)}\n`);
    
    if (isCreatingConnection.current[peerUsername]) {
      console.log(`⏳ 연결 생성 대기: ${peerUsername}`);
      
      for (let i = 0; i < 50; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!isCreatingConnection.current[peerUsername]) {
          break;
        }
      }
      
      return peerConnections.current[peerUsername];
    }
    
    isCreatingConnection.current[peerUsername] = true;
    
    try {
      const isiOS = isIOS();
      
      console.log(`📱 iOS: ${isiOS}`);
      
      const existing = peerConnections.current[peerUsername];
      if (existing) {
        const state = existing.connectionState;
        
        if (state === 'connected' || state === 'connecting') {
          console.log('✅ 기존 연결 재사용');
          return existing;
        }
        
        console.log('🗑️ 기존 연결 정리');
        try {
          existing.close();
        } catch (e) {}
        delete peerConnections.current[peerUsername];
      }
      
      if (!localStreamRef.current) {
        throw new Error('Local Stream 없음');
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);

      if (isiOS) {
        const videoTracks = localStreamRef.current.getVideoTracks();
        const audioTracks = localStreamRef.current.getAudioTracks();
        
        videoTracks.forEach(track => {
          pc.addTrack(track, localStreamRef.current);
          console.log('📹 Video track added (iOS)');
        });
        
        audioTracks.forEach(track => {
          pc.addTrack(track, localStreamRef.current);
          console.log('🎤 Audio track added (iOS)');
        });
      } else {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      pc.onnegotiationneeded = async () => {
        if (isInitiator && pc.signalingState === 'stable') {
          console.log('🔄 Negotiation needed (iOS)');
          
          try {
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true,
              iceRestart: false
            });
            
            await pc.setLocalDescription(offer);
            
            if (sendSignalRef.current) {
              sendSignalRef.current(peerUsername, 'offer', {
                sdp: pc.localDescription
              });
            }
          } catch (e) {
            console.error('❌ Re-negotiation 실패:', e);
          }
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && sendSignalRef.current) {
          if (isiOS) {
            console.log('🧊 ICE (iOS):', event.candidate.type);
          }
          
          sendSignalRef.current(peerUsername, 'ice_candidate', {
            candidate: event.candidate
          });
        } else if (!event.candidate && isiOS) {
          console.log('✅ ICE gathering complete (iOS)');
        }
      };

      pc.ontrack = (event) => {
        console.log(`🎥 Remote Track: ${peerUsername} (${event.track.kind}, iOS:${isiOS})`);
        
        if (event.streams.length === 0) {
          console.warn('⚠️ No streams in track event');
          return;
        }
        
        const remoteStream = event.streams[0];
        
        if (isiOS) {
          console.log('📊 Stream tracks (iOS):', {
            video: remoteStream.getVideoTracks().length,
            audio: remoteStream.getAudioTracks().length
          });
        }
        
        setRemoteStreams(prev => {
          const existingIndex = prev.findIndex(p => p.peerId === peerUsername);
          
          const streamData = { 
            peerId: peerUsername,
            username: peerUsername,
            stream: remoteStream,
            isMuted: !remoteStream.getAudioTracks()[0]?.enabled,
            isVideoOff: !remoteStream.getVideoTracks()[0]?.enabled
          };
          
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = streamData;
            return updated;
          }
          
          return [...prev, streamData];
        });
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log(`🔌 ICE State (${peerUsername}, iOS:${isiOS}): ${state}`);
        
        setConnectionStatus(prev => ({...prev, [peerUsername]: state}));
        
        if (state === 'failed') {
          console.log('🔄 ICE 재시작');
          
          if (pc.restartIce) {
            pc.restartIce();
          } else if (isiOS && isInitiator) {
            setTimeout(async () => {
              if (pc.signalingState === 'stable') {
                try {
                  const offer = await pc.createOffer({ iceRestart: true });
                  await pc.setLocalDescription(offer);
                  
                  if (sendSignalRef.current) {
                    sendSignalRef.current(peerUsername, 'offer', { sdp: pc.localDescription });
                  }
                } catch (e) {
                  console.error('❌ ICE restart 실패:', e);
                }
              }
            }, 1000);
          }
        }
        
        if (state === 'disconnected' && isiOS) {
          console.warn('⚠️ Disconnected (iOS)');
          setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected') {
              pc.restartIce?.();
            }
          }, 2000);
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log(`🔗 Connection State (${peerUsername}, iOS:${isiOS}): ${state}`);
        
        if (state === 'failed' || state === 'closed') {
          setRemoteStreams(prev => prev.filter(s => s.peerId !== peerUsername));
          delete peerConnections.current[peerUsername];
        }
      };

      peerConnections.current[peerUsername] = pc;

      if (isInitiator) {
        const delay = isiOS ? 2000 : 1000;
        
        setTimeout(async () => {
          if (pc.signalingState !== 'stable') {
            console.warn(`⚠️ Signaling state: ${pc.signalingState}`);
            return;
          }
          
          if (pc.connectionState === 'connected') {
            console.log('✅ 이미 연결됨');
            return;
          }
          
          try {
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true,
              voiceActivityDetection: false
            });
            
            await pc.setLocalDescription(offer);
            
            if (sendSignalRef.current) {
              sendSignalRef.current(peerUsername, 'offer', {
                sdp: pc.localDescription
              });
              console.log(`✅ Offer 전송: ${peerUsername} (iOS:${isiOS})`);
            }
          } catch (e) {
            console.error('❌ Offer 생성 실패:', e);
          }
        }, delay);
      }
      
      return pc;
    } catch (e) {
      console.error('❌ Peer Connection 생성 오류:', e);
      return null;
    } finally {
      isCreatingConnection.current[peerUsername] = false;
    }
  }, [currentUser]); // ⭐ isInitiator 제거 (매개변수로 받음)
  
  // =========================================================================
  // WebSocket Signal Handler
  // =========================================================================
  const handleWebSocketSignal = useCallback(async (data) => {
    const { type, from_username: peerUsername, to_username } = data;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📨 WebSocket Signal 수신`);
    console.log(`   Type: ${type}`);
    console.log(`   From Username: ${peerUsername}`);
    console.log(`   To Username: ${to_username || 'BROADCAST'}`);
    console.log(`   Current User: ${currentUser?.username}`);
    console.log(`${'='.repeat(60)}\n`);

    if (peerUsername === currentUser?.username) {
      console.log('⚠️ 자신의 시그널 - 무시');
      return;
    }
    
    if (to_username && to_username !== currentUser?.username) {
      console.log('⚠️ 다른 사용자의 시그널 - 무시');
      return;
    }

    let pc = peerConnections.current[peerUsername];

    if (!pc && type === 'offer') {
      console.log('🔧 Offer 수신 - PC 생성');
      pc = await createPeerConnection(peerUsername, false);
      if (!pc) {
        console.error('❌ PC 생성 실패');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    if (!pc) {
      console.warn(`⚠️ PC 없음: ${peerUsername}`);
      
      if (type === 'ice_candidate' && data.candidate) {
        if (!pendingCandidates.current[peerUsername]) {
          pendingCandidates.current[peerUsername] = [];
        }
        pendingCandidates.current[peerUsername].push(data.candidate);
        console.log(`💾 ICE candidate 저장 (Pending)`);
      }
      return;
    }

    try {
      switch (type) {
        case 'offer':
          console.log('📥 Offer 처리');
          
          if (pc.signalingState === 'have-local-offer') {
            await pc.setLocalDescription({type: 'rollback'});
          }
          
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          if (sendSignalRef.current) {
            sendSignalRef.current(peerUsername, 'answer', {
              sdp: pc.localDescription
            });
            console.log(`✅ Answer 전송: ${peerUsername}`);
          }
          
          if (pendingCandidates.current[peerUsername]) {
            console.log(`📤 Pending ICE candidates 처리 (${pendingCandidates.current[peerUsername].length}개)`);
            for (const candidate of pendingCandidates.current[peerUsername]) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
              } catch (e) {
                console.error('ICE 추가 실패:', e);
              }
            }
            delete pendingCandidates.current[peerUsername];
          }
          break;

        case 'answer':
          console.log('📥 Answer 처리');
          
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            console.log(`✅ Answer 적용: ${peerUsername}`);
            
            if (pendingCandidates.current[peerUsername]) {
              console.log(`📤 Pending ICE candidates 처리 (${pendingCandidates.current[peerUsername].length}개)`);
              for (const candidate of pendingCandidates.current[peerUsername]) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {}
              }
              delete pendingCandidates.current[peerUsername];
            }
          } else {
            console.warn(`⚠️ Answer 무시 (Signaling State: ${pc.signalingState})`);
          }
          break;

        case 'ice_candidate':
          if (data.candidate) {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log(`✅ ICE 추가: ${peerUsername}`);
              } catch (e) {
                console.error('ICE 추가 실패:', e);
              }
            } else {
              if (!pendingCandidates.current[peerUsername]) {
                pendingCandidates.current[peerUsername] = [];
              }
              pendingCandidates.current[peerUsername].push(data.candidate);
              console.log(`💾 ICE candidate 저장 (Remote Description 대기)`);
            }
          }
          break;
      }
    } catch (e) {
      console.error(`❌ Signal 처리 실패 (${type}):`, e);
    }
  }, [currentUser, createPeerConnection]);

  // =========================================================================
  // Cleanup
  // =========================================================================
  const cleanup = useCallback(() => {
    console.log('🧹 WebRTC 정리');
    
    Object.values(peerConnections.current).forEach(pc => {
      try {
        pc.close();
      } catch (e) {}
    });
    peerConnections.current = {};
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    pendingCandidates.current = {};
    isCreatingConnection.current = {};
    processedSignals.current.clear();
    setRemoteStreams([]);
    setConnectionStatus({});
  }, []);

  const removeRemoteStream = useCallback((peerUsername) => {
    console.log(`🗑️ Stream 제거: ${peerUsername}`);
    
    setRemoteStreams(prev => prev.filter(s => s.peerId !== peerUsername));
    
    if (peerConnections.current[peerUsername]) {
      try {
        peerConnections.current[peerUsername].close();
      } catch (e) {}
      delete peerConnections.current[peerUsername];
    }
  }, []);

  return {
    localStreamRef,
    peerConnections,
    remoteStreams,
    connectionStatus,
    getLocalMedia,
    createPeerConnection,
    handleWebSocketSignal,
    removeRemoteStream,
    cleanup,
  };
}