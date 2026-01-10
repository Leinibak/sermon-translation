// frontend/src/hooks/useWebRTC.js (iOS Safari 호환성 개선)

import { useState, useEffect, useRef, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
};

// ⭐ iOS Safari 감지
const isIOSSafari = () => {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const webkit = /WebKit/.test(ua);
  const notChrome = !/CriOS/.test(ua);
  return iOS && webkit && notChrome;
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
      console.log('   Video tracks:', stream.getVideoTracks().length);
      console.log('   Audio tracks:', stream.getAudioTracks().length);
      
      return stream;
    } catch (err) {
      console.error('❌ 미디어 접근 실패:', err);
      throw err;
    }
  }, []);


  // 📱 iOS 전용: 원격 스트림 재생 강제 트리거
  const forceRemotePlayback = useCallback(async (stream, peerUsername) => {
    if (!isIOSSafari()) return;
    
    console.log(`📱 iOS: ${peerUsername} 스트림 재생 강제 트리거`);
    
    // 🎬 임시 video 요소 생성하여 재생 시도
    const tempVideo = document.createElement('video');
    tempVideo.srcObject = stream;
    tempVideo.autoplay = true;
    tempVideo.playsInline = true;
    tempVideo.muted = false;
    
    try {
      await tempVideo.play();
      console.log(`✅ iOS: 재생 성공`);
      tempVideo.pause();
      tempVideo.srcObject = null;
    } catch (error) {
      console.warn(`⚠️ iOS 재생 실패:`, error);
    }
  }, []);

  // =========================================================================
  // ⭐⭐⭐ Peer Connection 생성 (iOS Safari 호환성 개선!)
  // =========================================================================
  const createPeerConnection = useCallback(async (peerUsername, isInitiator) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔧 Peer Connection 생성`);
    console.log(`   Peer: ${peerUsername}`);
    console.log(`   Initiator: ${isInitiator}`);
    console.log(`   나: ${currentUser?.username}`);
    console.log(`   iOS Safari: ${isIOSSafari()}`);
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

      const pc = new RTCPeerConnection(ICE_SERVERS);

      // ⭐⭐⭐ iOS Safari: ontrack 핸들러 (강화)
      pc.ontrack = async (event) => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🎥 Remote Track 수신`);
        console.log(`   Peer: ${peerUsername}`);
        console.log(`   Kind: ${event.track.kind}`);
        console.log(`   Enabled: ${event.track.enabled}`);
        console.log(`   ReadyState: ${event.track.readyState}`);
        console.log(`   Streams: ${event.streams.length}`);
        console.log(`${'='.repeat(60)}\n`);
        
        if (event.streams.length === 0) {
          console.warn('⚠️ No streams in event');
          return;
        }
        
        const remoteStream = event.streams[0];
        
        const videoTrack = remoteStream.getVideoTracks()[0];
        const audioTrack = remoteStream.getAudioTracks()[0];
        
        console.log('📊 Remote Stream 상세:');
        console.log('   Video:', videoTrack ? `${videoTrack.id} (${videoTrack.readyState})` : 'none');
        console.log('   Audio:', audioTrack ? `${audioTrack.id} (${audioTrack.readyState})` : 'none');

        // ⭐⭐⭐ iOS 전용: 스트림 준비 대기
        if (isIOSSafari()) {
          console.log('📱 iOS: 스트림 안정화 대기...');
          
          // 1. 트랙이 live 상태가 될 때까지 대기
          const waitForLiveTracks = async () => {
            let attempts = 0;
            const maxAttempts = 10;
            
            while (attempts < maxAttempts) {
              const videoLive = videoTrack ? videoTrack.readyState === 'live' : true;
              const audioLive = audioTrack ? audioTrack.readyState === 'live' : true;
              
              if (videoLive && audioLive) {
                console.log(`✅ iOS: 트랙 준비 완료 (시도: ${attempts + 1})`);
                break;
              }
              
              console.log(`⏳ iOS: 트랙 대기 중... (${attempts + 1}/${maxAttempts})`);
              await new Promise(r => setTimeout(r, 200));
              attempts++;
            }
          };
          
          await waitForLiveTracks();
          
          // 2. 추가 안정화 대기
          await new Promise(r => setTimeout(r, 500));
          
          // 3. 임시 video 요소로 재생 트리거 (iOS 최적화)
          console.log('📱 iOS: 재생 트리거 시도');
          
          const tempVideo = document.createElement('video');
          tempVideo.srcObject = remoteStream;
          tempVideo.autoplay = true;
          tempVideo.playsInline = true;
          tempVideo.muted = false;
          
          try {
            await tempVideo.play();
            console.log('✅ iOS: 임시 재생 성공');
            
            // 즉시 정리
            await new Promise(r => setTimeout(r, 100));
            tempVideo.pause();
            tempVideo.srcObject = null;
          } catch (error) {
            console.warn('⚠️ iOS 임시 재생 실패:', error.name);
            
            // 재생 실패 시에도 스트림은 추가 (수동 재생 버튼 표시용)
          }
        }
        
        // ⭐⭐⭐ 스트림 추가 (중복 체크)
        setRemoteStreams(prev => {
          const existingIndex = prev.findIndex(p => p.peerId === peerUsername);
          
          const streamData = { 
            peerId: peerUsername,
            username: peerUsername,
            stream: remoteStream,
            isMuted: !audioTrack?.enabled,
            isVideoOff: !videoTrack?.enabled,
            // ⭐ iOS 플래그 추가
            isIOS: isIOSSafari()
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
        
        // ⭐⭐⭐ iOS: 스트림 추가 후 재생 상태 모니터링
        if (isIOSSafari()) {
          setTimeout(() => {
            // VideoGrid의 video 요소들 확인
            const videoElements = document.querySelectorAll('video:not([muted])');
            
            videoElements.forEach(video => {
              if (video.srcObject === remoteStream) {
                console.log('📱 iOS: 원격 비디오 재생 상태 확인:', {
                  paused: video.paused,
                  readyState: video.readyState,
                  networkState: video.networkState
                });
                
                if (video.paused && video.readyState >= 2) {
                  console.log('⚠️ iOS: 비디오가 정지 상태 - 재생 필요');
                  
                  // IOSPlayButton 표시 이벤트 발송
                  window.dispatchEvent(new CustomEvent('ios-play-required', {
                    detail: { 
                      streamId: remoteStream.id, 
                      peerUsername,
                      videoElement: video
                    }
                  }));
                }
              }
            });
          }, 1500); // ⭐ 1.5초 후 체크
        }
      };

      console.log('📤 로컬 트랙 추가 중...');
      
      localStream.getTracks().forEach(track => {
        try {
          pc.addTrack(track, localStream);
          console.log(`✅ Track 추가: ${track.kind} (enabled: ${track.enabled}, id: ${track.id})`);
        } catch (e) {
          console.error(`❌ Track 추가 실패: ${track.kind}`, e);
        }
      });

      const senders = pc.getSenders();
      console.log('📊 Senders:', senders.map(s => ({
        kind: s.track?.kind,
        enabled: s.track?.enabled,
        id: s.track?.id
      })));

      pc.onnegotiationneeded = async () => {
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
          const offerOptions = {
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          };
          
          const offer = await pc.createOffer(offerOptions);
          
          if (isIOSSafari()) {
            console.log('📄 iOS Safari Offer SDP:', offer.sdp.substring(0, 200) + '...');
          }
          
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
        
        if (state === 'failed' && isIOSSafari()) {
          console.log('🔄 iOS Safari: ICE restart 시도');
          pc.restartIce();
        }
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
  }, [currentUser, forceRemotePlayback]);

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

    // Offer 수신 시 PC 생성
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
          
          // Rollback 처리
          if (pc.signalingState === 'have-local-offer') {
            console.log('🔄 Rollback 수행');
            await pc.setLocalDescription({type: 'rollback'});
          }
          
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          
          // ⭐ iOS Safari: answerToReceiveAudio/Video 명시
          const answerOptions = isIOSSafari() ? {
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          } : {};
          
          const answer = await pc.createAnswer(answerOptions);
          await pc.setLocalDescription(answer);
          
          if (sendSignalRef.current) {
            sendSignalRef.current(peerUsername, 'answer', {
              sdp: pc.localDescription
            });
            console.log(`✅ Answer 전송 완료`);
          }
          
          // Pending ICE 처리
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
            
            // Pending ICE 처리
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
            // Remote Description 확인
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

  // Track 상태 변경 처리
  const handleTrackStateChange = useCallback((data) => {
    const { username, kind, enabled } = data;
    
    console.log(`🎚️ Track 상태 변경 수신: ${username}`);
    console.log(`   Kind: ${kind}, Enabled: ${enabled}`);
    
    setRemoteStreams(prev => prev.map(stream => {
      if (stream.peerId === username) {
        return {
          ...stream,
          isMuted: kind === 'audio' ? !enabled : stream.isMuted,
          isVideoOff: kind === 'video' ? !enabled : stream.isVideoOff
        };
      }
      return stream;
    }));
  }, []);

  // Cleanup
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
    handleTrackStateChange,
    removeRemoteStream,
    cleanup,
  };
}