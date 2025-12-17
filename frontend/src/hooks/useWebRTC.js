// frontend/src/hooks/useWebRTC.js (완전 수정 버전)
import { useState, useRef, useCallback, useEffect } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' }
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
  const processedSignals = useRef(new Set()); // ⭐ 추가: 중복 시그널 방지
  
  // ⭐ sendWebRTCSignal을 항상 최신으로 유지
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
      } else {
        console.log('⚠️ 기존 스트림 비활성 - 새로 생성');
        tracks.forEach(track => track.stop());
        localStreamRef.current = null;
      }
    }

    try {
      console.log('🎥 미디어 스트림 요청...');
      
      // ⭐ 모바일 환경 감지
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      // ⭐ 모바일 최적화 설정
      const constraints = {
        video: isMobile ? {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 24, max: 30 }  // ⭐ 모바일 프레임레이트 제한
        } : {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: isMobile ? 16000 : 48000  // ⭐ 모바일 오디오 최적화
        }
      };
      
      console.log('📱 디바이스 타입:', isMobile ? 'Mobile' : 'Desktop');
      console.log('🎛️ Constraints:', constraints);
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      localStreamRef.current = stream;
      console.log('✅ 미디어 준비 완료');
      console.log(`   Video tracks: ${stream.getVideoTracks().length}`);
      console.log(`   Audio tracks: ${stream.getAudioTracks().length}`);
      
      // ⭐ Track 상태 모니터링 (모바일 중요)
      stream.getTracks().forEach(track => {
        track.onended = () => {
          console.warn(`⚠️ Track ended: ${track.kind}`);
          // 자동 재시작 시도 (모바일에서 중요)
          if (isMobile) {
            console.log('🔄 Track 재시작 시도 (모바일)');
            setTimeout(() => {
              getLocalMedia().catch(e => console.error('재시작 실패:', e));
            }, 1000);
          }
        };
      });
      
      return stream;
    } catch (err) {
      console.error('❌ 미디어 접근 실패:', err);
      
      // ⭐ 사용자 친화적 에러 메시지
      if (err.name === 'NotAllowedError') {
        alert('카메라와 마이크 권한을 허용해주세요.\n\n설정 > 사이트 설정에서 권한을 변경할 수 있습니다.');
      } else if (err.name === 'NotFoundError') {
        alert('카메라 또는 마이크를 찾을 수 없습니다.');
      } else {
        alert('미디어 장치에 접근할 수 없습니다: ' + err.message);
      }
      
      throw err;
    }
  }, []);

  // =========================================================================
  // Peer Connection
  // =========================================================================
  const createPeerConnection = useCallback(async (peerId, isInitiator) => {
    // Race condition 방지
    if (isCreatingConnection.current[peerId]) {
      console.log(`⏳ 연결 생성 대기: ${peerId}`);
      
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!isCreatingConnection.current[peerId]) {
          break;
        }
      }
      
      return peerConnections.current[peerId];
    }
    
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
          isCreatingConnection.current[peerId] = false;
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
      
      if (!localStreamRef.current) {
        throw new Error('Local Stream이 없습니다');
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);

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
        if (event.candidate) {
          console.log(`📡 ICE Candidate 생성 (${peerId})`);
          
          if (sendSignalRef.current) {
            sendSignalRef.current(peerId, 'ice_candidate', {
              candidate: event.candidate
            });
          }
        }
      };

      // ⭐ Track 수신 핸들러
      pc.ontrack = (event) => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🎥 Remote Track 수신!`);
        console.log(`   From: ${peerId}`);
        console.log(`   Kind: ${event.track.kind}`);
        console.log(`${'='.repeat(60)}\n`);
        
        if (event.streams.length === 0) {
          console.error('❌ Stream이 없음');
          return;
        }
        
        const remoteStream = event.streams[0];
        const videoTrack = remoteStream.getVideoTracks()[0];
        const audioTrack = remoteStream.getAudioTracks()[0];
        
        // Track 이벤트 리스너
        if (videoTrack) {
          videoTrack.onmute = () => {
            console.log(`🔇 Video muted (${peerId})`);
            setRemoteStreams(prev => prev.map(s => 
              s.peerId === peerId ? {...s, isVideoOff: true} : s
            ));
          };
          videoTrack.onunmute = () => {
            console.log(`🔊 Video unmuted (${peerId})`);
            setRemoteStreams(prev => prev.map(s => 
              s.peerId === peerId ? {...s, isVideoOff: false} : s
            ));
          };
        }
        
        setRemoteStreams(prev => {
          const existingIndex = prev.findIndex(p => p.peerId === peerId);
          
          if (existingIndex >= 0) {
            console.log(`♻️ Remote Stream 업데이트`);
            const updated = [...prev];
            updated[existingIndex] = { 
              ...updated[existingIndex], 
              stream: remoteStream,
              isMuted: !audioTrack?.enabled,
              isVideoOff: !videoTrack?.enabled
            };
            return updated;
          }
          
          console.log(`🆕 Remote Stream 추가`);
          return [
            ...prev, 
            { 
              peerId, 
              username: peerId,
              stream: remoteStream,
              isMuted: !audioTrack?.enabled,
              isVideoOff: !videoTrack?.enabled
            }
          ];
        });
      };

      // ICE 연결 상태
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log(`🔌 ICE State (${peerId}): ${state}`);
        
        setConnectionStatus(prev => ({...prev, [peerId]: state}));
        
        if (state === 'connected') {
          console.log(`✅✅ ICE 연결 성공! (${peerId})`);
        } else if (state === 'failed') {
          console.error(`❌ ICE 연결 실패 (${peerId})`);
          if (pc.restartIce) {
            console.log('🔄 ICE 재시작 시도...');
            pc.restartIce();
          }
        }
      };

      // 연결 상태
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log(`🔗 Connection State (${peerId}): ${state}`);
        
        if (state === 'connected') {
          console.log(`🎉🎉 Peer 연결 완료! (${peerId})`);
        } else if (state === 'failed' || state === 'closed') {
          console.log(`❌ 연결 실패/종료 (${peerId})`);
          setRemoteStreams(prev => prev.filter(s => s.peerId !== peerId));
          delete peerConnections.current[peerId];
        }
      };

      peerConnections.current[peerId] = pc;
      console.log(`✅ Peer Connection 저장 완료`);

      // ⭐⭐⭐ Initiator: Offer 생성 (안전한 타이밍)
      if (isInitiator) {
        console.log(`🎬 Initiator: Offer 생성 시작`);
        
        // ⭐ 충분한 대기 시간 (참가자 준비 + 안정화)
        setTimeout(async () => {
          try {
            // ⭐ 상태 체크
            if (pc.signalingState !== 'stable') {
              console.warn(`⚠️ Signaling state not stable: ${pc.signalingState}`);
              return;
            }
            
            if (pc.connectionState === 'connected') {
              console.log(`✅ 이미 연결됨 - Offer 생성 스킵`);
              return;
            }
            
            console.log(`📝 Creating Offer...`);
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            
            console.log(`✅ Offer created`);
            
            await pc.setLocalDescription(offer);
            console.log(`✅ Local Description set`);
            
            // ⭐ Offer 전송
            if (sendSignalRef.current) {
              const success = sendSignalRef.current(peerId, 'offer', {
                sdp: pc.localDescription
              });
              
              if (success) {
                console.log(`✅✅ Offer 전송 완료!`);
              } else {
                console.error(`❌ Offer 전송 실패 - 재시도`);
                
                setTimeout(() => {
                  if (sendSignalRef.current) {
                    sendSignalRef.current(peerId, 'offer', {
                      sdp: pc.localDescription
                    });
                  }
                }, 1000);
              }
            }
          } catch (e) {
            console.error(`❌ Offer 생성/전송 실패:`, e);
            
            // 재시도
            setTimeout(() => {
              if (pc.signalingState === 'stable') {
                pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
                  .then(offer => pc.setLocalDescription(offer))
                  .then(() => {
                    if (sendSignalRef.current) {
                      sendSignalRef.current(peerId, 'offer', { sdp: pc.localDescription });
                    }
                  })
                  .catch(err => console.error('재시도 실패:', err));
              }
            }, 2000);
          }
        }, 1500); // ⭐ 1.5초 대기 (충분한 시간)
      }
      
      return pc;
    } catch (e) {
      console.error('❌ Peer Connection 생성 오류:', e);
      return null;
    } finally {
      isCreatingConnection.current[peerId] = false;
    }
  }, []);

  // =========================================================================
  // WebSocket Signal Handler (개선 버전)
  // =========================================================================
  
  const handleWebSocketSignal = useCallback(async (data) => {
    const { type, from_username: peerId, to_username, id: signalId } = data;

    // 자신의 시그널 무시
    if (peerId === currentUser?.username) {
      return;
    }

    // 수신자 확인
    if (to_username && to_username !== currentUser?.username) {
      return;
    }

    // ⭐ 중복 시그널 방지 (선택사항)
    if (signalId && processedSignals.current.has(signalId)) {
      console.log('⚠️ 중복 시그널 무시:', signalId);
      return;
    }
    
    if (signalId) {
      processedSignals.current.add(signalId);
      
      // 메모리 관리: 1000개 이상이면 오래된 것 제거
      if (processedSignals.current.size > 1000) {
        const toDelete = Array.from(processedSignals.current).slice(0, 500);
        toDelete.forEach(id => processedSignals.current.delete(id));
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📨 WebSocket 시그널 수신`);
    console.log(`   Type: ${type}`);
    console.log(`   From: ${peerId}`);
    console.log(`   To: ${to_username || 'broadcast'}`);
    console.log(`${'='.repeat(60)}\n`);

    // ⭐ user_joined 처리 (방장만)
    // if (type === 'user_joined') {
    //   console.log(`📢 User Joined 수신 from ${peerId}`);
      
    //   if (isHost) {
    //     console.log(`👑 방장이 User Joined 수신 - 피어 연결 시작`);
    //     console.log(`   Current Peer: ${peerId}`);
    //     console.log(`   Current User: ${currentUser?.username}`);
        
    //     setTimeout(async () => {
    //       const existingPc = peerConnections.current[peerId];
          
    //       console.log(`🔍 기존 연결 확인:`);
    //       console.log(`   Exists: ${!!existingPc}`);
    //       console.log(`   State: ${existingPc?.connectionState}`);
          
    //       if (!existingPc || existingPc.connectionState === 'failed' || existingPc.connectionState === 'closed') {
    //         console.log(`🆕 새로운 Peer Connection 생성 (Initiator)`);
    //         const newPc = await createPeerConnection(peerId, true);
            
    //         if (newPc) {
    //           console.log(`✅ Peer Connection 생성 완료`);
    //         } else {
    //           console.error(`❌ Peer Connection 생성 실패`);
    //         }
    //       } else {
    //         console.log(`✅ 기존 연결 유지 (${existingPc.connectionState})`);
    //       }
    //     }, 1500);
    //   } else {
    //     console.log(`👤 참가자는 User Joined 무시 (방장이 Offer를 보낼 것)`);
    //   }
    //   return;
    // }
    if (type === 'user_joined') {
      console.log(`📢 User Joined 수신 from ${peerId}`);

      if (isHost) {
        console.log('👑 방장: user_joined 수신 (아무것도 하지 않음)');
        console.log('👉 join_ready를 기다림');
      }

      return;
    }

    // ⭐⭐⭐ join_ready 처리 (방장만)
    if (type === 'join_ready' && isHost) {
      console.log(`📥 join_ready 수신 ← ${peerId}`);

      // 이미 연결돼 있으면 무시
      if (peerConnections.current[peerId]) {
        console.warn(`⚠️ 이미 PeerConnection 존재: ${peerId}`);
        return;
      }

      // 로컬 미디어 준비 확인
      if (!localStreamRef.current) {
        console.error('❌ 로컬 미디어 없음 → Offer 생성 중단');
        return;
      }

      // 안전하게 Offer 생성
      setTimeout(async () => {
        try {
          console.log(`🎬 방장: createPeerConnection (Initiator) → ${peerId}`);
          await createPeerConnection(peerId, true);
        } catch (e) {
          console.error('❌ PeerConnection 생성 실패:', e);
        }
      }, 300);

      return;
    }
    // ⭐ WebRTC 시그널 처리
    let pc = peerConnections.current[peerId];

    if (!pc && type === 'offer') {
      console.log('🆕 Offer 수신 - 새 연결 생성');
      pc = await createPeerConnection(peerId, false);
      if (!pc) {
        console.error('❌ Peer Connection 생성 실패');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!pc) {
      console.warn(`⚠️ Peer Connection 없음 (${type})`);
      return;
    }

    try {
      switch (type) {
        case 'offer':
          console.log(`📥 Offer 처리 시작`);
          console.log(`   Signaling State: ${pc.signalingState}`);
          
          // Rollback if needed
          if (pc.signalingState === 'have-local-offer') {
            console.log('🔄 Rollback 수행');
            await pc.setLocalDescription({type: 'rollback'});
          }
          
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          console.log(`✅ Remote Description set (Offer)`);
          
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          console.log(`✅ Answer 생성 및 Local Description set`);
          
          // ⭐ ref를 통해 최신 함수 호출
          if (sendSignalRef.current) {
            const success = sendSignalRef.current(peerId, 'answer', {
              sdp: pc.localDescription
            });
            
            if (success) {
              console.log(`✅✅ Answer 전송 완료!`);
            } else {
              console.error(`❌ Answer 전송 실패`);
            }
          }
          break;

        case 'answer':
          console.log(`📥 Answer 처리 시작`);
          console.log(`   Signaling State: ${pc.signalingState}`);
          
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            console.log(`✅✅ Answer 적용 완료!`);
          } else {
            console.warn(`⚠️ 비정상 상태: ${pc.signalingState}`);
          }
          break;

        case 'ice_candidate':
          console.log(`📥 ICE Candidate 처리 from ${peerId}`);
          
          if (data.candidate) {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log(`✅ ICE Candidate 추가 성공`);
              } catch (e) {
                console.error('❌ ICE Candidate 추가 실패:', e);
              }
            } else {
              console.warn(`⚠️ Remote Description 없음 - 큐에 추가`);
              if (!pendingCandidates.current[peerId]) {
                pendingCandidates.current[peerId] = [];
              }
              pendingCandidates.current[peerId].push(new RTCIceCandidate(data.candidate));
            }
          }
          break;

        default:
          console.warn(`⚠️ 알 수 없는 시그널: ${type}`);
      }
    } catch (e) {
      console.error(`❌ 시그널 처리 실패 (${type}):`, e);
      console.error('Stack:', e.stack);
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
        console.log(`🔌 연결 종료: ${peerId}`);
      } catch (e) {
        console.error(`연결 종료 오류:`, e);
      }
    });
    peerConnections.current = {};
    
    // Local Stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      localStreamRef.current = null;
    }
    
    // 상태 초기화
    pendingCandidates.current = {};
    isCreatingConnection.current = {};
    processedSignals.current.clear();
    setRemoteStreams([]);
    setConnectionStatus({});
    
    console.log('✅ 정리 완료\n');
  }, []);

  // ✅ removeRemoteStream 함수 추가
  const removeRemoteStream = useCallback((peerId) => {
    console.log(`🗑️ Remote Stream 제거: ${peerId}`);
    
    setRemoteStreams(prev => prev.filter(s => s.peerId !== peerId));
    
    // Peer Connection도 정리
    if (peerConnections.current[peerId]) {
      try {
        peerConnections.current[peerId].close();
      } catch (e) {
        console.error('연결 종료 오류:', e);
      }
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