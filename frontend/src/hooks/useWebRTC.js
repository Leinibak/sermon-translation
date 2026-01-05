// frontend/src/hooks/useWebRTC.js (트랙 추가 개선 버전)
import { useState, useRef, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
};

export function useWebRTC(roomId, currentUser, isHost, sendWebRTCSignal) {
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState({});
  
  const localStreamRef = useRef(null);
  const peerConnections = useRef({});
  const pendingCandidates = useRef({});
  const isCreatingConnection = useRef({});
  
  const sendSignalRef = useRef(sendWebRTCSignal);
  const isHostRef = useRef(isHost);
  
  // ⭐ sendWebRTCSignal과 isHost를 항상 최신으로 유지
  useEffect(() => {
    sendSignalRef.current = sendWebRTCSignal;
    isHostRef.current = isHost;
  }, [sendWebRTCSignal, isHost]);

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
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      
      console.log('✅ 미디어 준비 완료');
      console.log('📊 트랙 상태:', {
        video: stream.getVideoTracks().map(t => ({
          id: t.id,
          enabled: t.enabled,
          readyState: t.readyState,
        })),
        audio: stream.getAudioTracks().map(t => ({
          id: t.id,
          enabled: t.enabled,
          readyState: t.readyState,
        }))
      });
      
      return stream;
    } catch (err) {
      console.error('❌ 미디어 접근 실패:', err);
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
    console.log(`   나: ${currentUser?.username}`);
    console.log(`${'='.repeat(60)}\n`);
    
    // 중복 생성 방지
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
      console.log('📤 로컬 트랙 추가 중...');
      localStream.getTracks().forEach(track => {
        try {
          pc.addTrack(track, localStream);
          console.log(`✅ Track 추가: ${track.kind} (${track.id.substring(0, 8)}...)`);
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
        console.log(`   Track ID: ${event.track.id.substring(0, 8)}...`);
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
        
        // ⭐ 상태 업데이트
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
            console.log('🔄 기존 스트림 업데이트');
            return updated;
          }
          
          console.log('➕ 새 스트림 추가');
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
            console.log(`✅ Offer 전송 완료`);
          }
        } catch (e) {
          console.error('❌ Offer 생성 실패:', e);
        }
      };

      // ⭐ ICE Candidate 핸들러
      pc.onicecandidate = (event) => {
        if (event.candidate && sendSignalRef.current) {
          sendSignalRef.current(peerUsername, 'ice_candidate', {
            candidate: event.candidate
          });
        }
      };

      // ⭐ 연결 상태 핸들러
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
      console.log('✅ PeerConnection 저장 완료');
      
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
          console.log('🔥 Offer 처리');
          
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
            console.log(`✅ Answer 전송 완료`);
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
          console.log('🔥 Answer 처리');
          
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            console.log(`✅ Answer 적용 완료`);
            
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