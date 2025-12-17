// frontend/src/hooks/useWebRTC.js (수정 버전)
import { useState, useRef, useCallback, useEffect } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
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
  const processedSignals = useRef(new Set());
  
  // ⭐⭐⭐ 핵심 수정: 항상 최신 함수 참조 유지
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
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      const constraints = {
        video: isMobile ? {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 24, max: 30 }
        } : {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: isMobile ? 16000 : 48000
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      
      console.log('✅ 미디어 준비 완료');
      return stream;
    } catch (err) {
      console.error('❌ 미디어 접근 실패:', err);
      
      if (err.name === 'NotAllowedError') {
        alert('카메라와 마이크 권한을 허용해주세요.');
      } else if (err.name === 'NotFoundError') {
        alert('카메라 또는 마이크를 찾을 수 없습니다.');
      }
      
      throw err;
    }
  }, []);

  // =========================================================================
  // Peer Connection 생성
  // =========================================================================
  const createPeerConnection = useCallback(async (peerId, isInitiator) => {
    // ⭐ Race condition 방지
    if (isCreatingConnection.current[peerId]) {
      console.log(`⏳ 연결 생성 대기: ${peerId}`);
      
      for (let i = 0; i < 50; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!isCreatingConnection.current[peerId]) {
          break;
        }
      }
      
      return peerConnections.current[peerId];
    }
    
    isCreatingConnection.current[peerId] = true;
    
    try {
      console.log(`🔧 Peer Connection 생성: ${peerId} (Initiator: ${isInitiator})`);
      
      // 기존 연결 확인
      const existing = peerConnections.current[peerId];
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
        delete peerConnections.current[peerId];
      }
      
      if (!localStreamRef.current) {
        throw new Error('Local Stream이 없습니다');
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);

      // Local Tracks 추가
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });

      // ⭐⭐⭐ ICE Candidate 핸들러
      pc.onicecandidate = (event) => {
        if (event.candidate && sendSignalRef.current) {
          sendSignalRef.current(peerId, 'ice_candidate', {
            candidate: event.candidate
          });
        }
      };

      // ⭐⭐⭐ Track 수신 핸들러
      pc.ontrack = (event) => {
        console.log(`🎥 Remote Track 수신: ${peerId} (${event.track.kind})`);
        
        if (event.streams.length === 0) return;
        
        const remoteStream = event.streams[0];
        
        setRemoteStreams(prev => {
          const existingIndex = prev.findIndex(p => p.peerId === peerId);
          
          const streamData = { 
            peerId, 
            username: peerId,
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

      // 연결 상태 핸들러
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log(`🔌 ICE State (${peerId}): ${state}`);
        
        setConnectionStatus(prev => ({...prev, [peerId]: state}));
        
        if (state === 'failed' && pc.restartIce) {
          console.log('🔄 ICE 재시작');
          pc.restartIce();
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log(`🔗 Connection State (${peerId}): ${state}`);
        
        if (state === 'failed' || state === 'closed') {
          setRemoteStreams(prev => prev.filter(s => s.peerId !== peerId));
          delete peerConnections.current[peerId];
        }
      };

      peerConnections.current[peerId] = pc;

      // ⭐⭐⭐ Initiator: Offer 생성
      if (isInitiator) {
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
              offerToReceiveVideo: true
            });
            
            await pc.setLocalDescription(offer);
            
            if (sendSignalRef.current) {
              sendSignalRef.current(peerId, 'offer', {
                sdp: pc.localDescription
              });
              console.log(`✅ Offer 전송: ${peerId}`);
            }
          } catch (e) {
            console.error('❌ Offer 생성 실패:', e);
          }
        }, 1000); // 1초 대기
      }
      
      return pc;
    } catch (e) {
      console.error('❌ Peer Connection 생성 오류:', e);
      return null;
    } finally {
      isCreatingConnection.current[peerId] = false;
    }
  }, []); // ⭐ 의존성 최소화

  // =========================================================================
  // WebSocket Signal Handler
  // =========================================================================
  const handleWebSocketSignal = useCallback(async (data) => {
    const { type, from_username: peerId, to_username } = data;

    if (peerId === currentUser?.username) return;
    if (to_username && to_username !== currentUser?.username) return;

    console.log(`📨 Signal: ${type} from ${peerId}`);

    let pc = peerConnections.current[peerId];

    // Offer 수신 시 연결 생성
    if (!pc && type === 'offer') {
      pc = await createPeerConnection(peerId, false);
      if (!pc) return;
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    if (!pc) {
      console.warn(`⚠️ PC 없음: ${peerId}`);
      
      // ⭐ Pending candidates 저장
      if (type === 'ice_candidate' && data.candidate) {
        if (!pendingCandidates.current[peerId]) {
          pendingCandidates.current[peerId] = [];
        }
        pendingCandidates.current[peerId].push(data.candidate);
      }
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
            console.log(`✅ Answer 전송: ${peerId}`);
          }
          
          // ⭐ Pending candidates 처리
          if (pendingCandidates.current[peerId]) {
            for (const candidate of pendingCandidates.current[peerId]) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
              } catch (e) {
                console.error('ICE 추가 실패:', e);
              }
            }
            delete pendingCandidates.current[peerId];
          }
          break;

        case 'answer':
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            console.log(`✅ Answer 적용: ${peerId}`);
            
            // ⭐ Pending candidates 처리
            if (pendingCandidates.current[peerId]) {
              for (const candidate of pendingCandidates.current[peerId]) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {}
              }
              delete pendingCandidates.current[peerId];
            }
          }
          break;

        case 'ice_candidate':
          if (data.candidate) {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log(`✅ ICE 추가: ${peerId}`);
              } catch (e) {
                console.error('ICE 추가 실패:', e);
              }
            } else {
              // Remote Description 없으면 대기
              if (!pendingCandidates.current[peerId]) {
                pendingCandidates.current[peerId] = [];
              }
              pendingCandidates.current[peerId].push(data.candidate);
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

  const removeRemoteStream = useCallback((peerId) => {
    console.log(`🗑️ Stream 제거: ${peerId}`);
    
    setRemoteStreams(prev => prev.filter(s => s.peerId !== peerId));
    
    if (peerConnections.current[peerId]) {
      try {
        peerConnections.current[peerId].close();
      } catch (e) {}
      delete peerConnections.current[peerId];
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