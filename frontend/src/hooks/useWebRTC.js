// frontend/src/hooks/useWebRTC.js (영상 전송 수정 버전)
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
      console.log('📊 트랙 상태:', {
        video: stream.getVideoTracks().map(t => ({
          id: t.id,
          enabled: t.enabled,
          readyState: t.readyState,
          muted: t.muted
        })),
        audio: stream.getAudioTracks().map(t => ({
          id: t.id,
          enabled: t.enabled,
          readyState: t.readyState,
          muted: t.muted
        }))
      });
      
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
  // ⭐⭐⭐ Peer Connection 생성 (트랙 추가 로직 개선)
  // =========================================================================
  const createPeerConnection = useCallback(async (peerUsername, isInitiator) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔧 Peer Connection 생성`);
    console.log(`   Peer: ${peerUsername}`);
    console.log(`   Initiator: ${isInitiator}`);
    console.log(`${'='.repeat(60)}\n`);
    
    // ⭐⭐⭐ 중복 생성 방지
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
      // 기존 연결 정리
      const existing = peerConnections.current[peerUsername];
      if (existing) {
        const state = existing.connectionState;
        
        if (state === 'connected') {
          console.log('✅ 이미 연결됨 - 재사용');
          return existing;
        }
        
        console.log('🗑️ 기존 연결 정리');
        try {
          existing.close();
        } catch (e) {}
        delete peerConnections.current[peerUsername];
      }
      
      // ⭐⭐⭐ 로컬 스트림 확인
      if (!localStreamRef.current) {
        throw new Error('Local Stream 없음');
      }

      const localStream = localStreamRef.current;
      const videoTracks = localStream.getVideoTracks();
      const audioTracks = localStream.getAudioTracks();

      if (videoTracks.length === 0 && audioTracks.length === 0) {
        throw new Error('로컬 스트림에 트랙이 없습니다');
      }

      console.log('📊 로컬 스트림:', {
        video: videoTracks.length,
        audio: audioTracks.length,
        videoEnabled: videoTracks[0]?.enabled,
        audioEnabled: audioTracks[0]?.enabled
      });

      // PeerConnection 생성
      const pc = new RTCPeerConnection(ICE_SERVERS);

      // ⭐⭐⭐ 트랙 추가 (반드시 연결 전에)
      localStream.getTracks().forEach(track => {
        try {
          pc.addTrack(track, localStream);
          console.log(`✅ Track 추가: ${track.kind}`);
        } catch (e) {
          console.error(`❌ Track 추가 실패: ${track.kind}`, e);
        }
      });

      // ⭐⭐⭐ ontrack - 상대방 영상 수신
      pc.ontrack = (event) => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🎥 Remote Track 수신`);
        console.log(`   Peer: ${peerUsername}`);
        console.log(`   Kind: ${event.track.kind}`);
        console.log(`   Streams: ${event.streams.length}`);
        console.log(`${'='.repeat(60)}\n`);
        
        if (event.streams.length === 0) {
          console.warn('⚠️ No streams');
          return;
        }
        
        const remoteStream = event.streams[0];
        
        console.log('📊 Remote Stream:', {
          id: remoteStream.id,
          active: remoteStream.active,
          video: remoteStream.getVideoTracks().length,
          audio: remoteStream.getAudioTracks().length
        });
        
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

      // ⭐⭐⭐ negotiationneeded - Offer 자동 생성
      pc.onnegotiationneeded = async () => {
        // Initiator만 Offer 생성
        if (!isInitiator) {
          console.log('⚠️ Non-initiator - 대기');
          return;
        }

        if (pc.signalingState !== 'stable') {
          console.log(`⚠️ Signaling state: ${pc.signalingState}`);
          return;
        }
        
        console.log('🔄 Negotiation needed - Offer 생성');
        
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          
          if (sendSignalRef.current) {
            sendSignalRef.current(peerUsername, 'offer', {
              sdp: pc.localDescription
            });
            console.log(`✅ Offer 전송`);
          }
        } catch (e) {
          console.error('❌ Offer 생성 실패:', e);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && sendSignalRef.current) {
          sendSignalRef.current(peerUsername, 'ice_candidate', {
            candidate: event.candidate
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log(`🔌 ICE (${peerUsername}): ${state}`);
        setConnectionStatus(prev => ({...prev, [peerUsername]: state}));
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log(`🔗 Connection (${peerUsername}): ${state}`);
        
        if (state === 'failed' || state === 'closed') {
          setRemoteStreams(prev => prev.filter(s => s.peerId !== peerUsername));
          delete peerConnections.current[peerUsername];
        }
      };

      peerConnections.current[peerUsername] = pc;
      return pc;
      
    } catch (e) {
      console.error('❌ PC 생성 오류:', e);
      return null;
    } finally {
      isCreatingConnection.current[peerUsername] = false;
    }
  }, [currentUser]);

  // =========================================================================
  // WebSocket Signal Handler
  // =========================================================================
  const handleWebSocketSignal = useCallback(async (data) => {
    const { type, from_username: peerUsername, to_username } = data;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📨 Signal 수신: ${type}`);
    console.log(`   From: ${peerUsername}`);
    console.log(`   To: ${to_username || 'ALL'}`);
    console.log(`${'='.repeat(60)}\n`);

    // 자신의 시그널 무시
    if (peerUsername === currentUser?.username) {
      return;
    }
    
    // 다른 사용자의 시그널 무시
    if (to_username && to_username !== currentUser?.username) {
      return;
    }

    let pc = peerConnections.current[peerUsername];

    // ⭐⭐⭐ Offer 수신 시 PC 생성
    if (!pc && type === 'offer') {
      console.log('🔧 Offer 수신 - PC 생성 (Non-initiator)');
      pc = await createPeerConnection(peerUsername, false);
      
      if (!pc) {
        console.error('❌ PC 생성 실패');
        return;
      }
      
      // PC 생성 후 약간 대기
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    if (!pc) {
      console.warn(`⚠️ PC 없음: ${peerUsername}`);
      
      // ICE candidate는 임시 저장
      if (type === 'ice_candidate' && data.candidate) {
        if (!pendingCandidates.current[peerUsername]) {
          pendingCandidates.current[peerUsername] = [];
        }
        pendingCandidates.current[peerUsername].push(data.candidate);
      }
      return;
    }

    try {
      switch (type) {
        case 'offer':
          console.log('📥 Offer 처리');
          
          // ⭐⭐⭐ Rollback 처리
          if (pc.signalingState === 'have-local-offer') {
            console.log('🔄 Rollback 수행');
            await pc.setLocalDescription({type: 'rollback'});
          }
          
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          if (sendSignalRef.current) {
            sendSignalRef.current(peerUsername, 'answer', {
              sdp: pc.localDescription
            });
            console.log(`✅ Answer 전송`);
          }
          
          // ⭐⭐⭐ Pending ICE 처리
          if (pendingCandidates.current[peerUsername]) {
            console.log(`📤 Pending ICE 처리 (${pendingCandidates.current[peerUsername].length}개)`);
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
            console.log(`✅ Answer 적용`);
            
            // ⭐⭐⭐ Pending ICE 처리
            if (pendingCandidates.current[peerUsername]) {
              for (const candidate of pendingCandidates.current[peerUsername]) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {}
              }
              delete pendingCandidates.current[peerUsername];
            }
          } else {
            console.warn(`⚠️ Answer 무시 (State: ${pc.signalingState})`);
          }
          break;

        case 'ice_candidate':
          if (data.candidate) {
            // ⭐⭐⭐ Remote Description 확인
            if (pc.remoteDescription && pc.remoteDescription.type) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch (e) {
                console.error('ICE 추가 실패:', e);
              }
            } else {
              // Pending에 저장
              if (!pendingCandidates.current[peerUsername]) {
                pendingCandidates.current[peerUsername] = [];
              }
              pendingCandidates.current[peerUsername].push(data.candidate);
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