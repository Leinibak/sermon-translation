// frontend/src/components/VideoMeetingRoom.jsx (수정 버전 - 순환 참조 해결)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Video, VideoOff, Mic, MicOff, PhoneOff, Users, UserCheck, UserX, Bell, Loader, X } from 'lucide-react';
import axios from '../api/axios';
import { useAuth } from '../contexts/AuthContext';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

function VideoMeetingRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // 로컬 미디어 관련 Ref
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  
  // WebRTC 상태
  const [remoteStreams, setRemoteStreams] = useState([]);
  const peerConnections = useRef({});
  const signalPollingIntervalRef = useRef(null);
  const pendingPollingIntervalRef = useRef(null);
  const processedSignals = useRef(new Set());

  // 회의실 및 UI 상태
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [showPendingPanel, setShowPendingPanel] = useState(false);
  const [error, setError] = useState(null);
  const [mediaReady, setMediaReady] = useState(false);

  const currentPeerId = user?.username;

  // ⭐ fetchRoomDetails를 ref로 관리하여 순환 참조 방지
  const fetchRoomDetailsRef = useRef(null);

  // =========================================================================
  // 1. WebRTC & Signaling Functions
  // =========================================================================

  const sendSignal = useCallback(async (toPeerId, type, payload = {}) => {
    if (!currentPeerId) {
      console.warn('⚠️ currentPeerId 없음, 시그널 전송 불가');
      return;
    }

    const message = {
      message_type: type,
      payload: JSON.stringify(payload),
      receiver_username: toPeerId,
    };

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📤 시그널 전송 시도: ${type} to ${toPeerId}`);
    console.log(`   Sender: ${currentPeerId}`);
    console.log(`   Payload size: ${JSON.stringify(payload).length} bytes`);
    console.log(`${'='.repeat(60)}\n`);

    try {
      const response = await axios.post(`/video-meetings/${id}/send_signal/`, message);
      console.log(`✅ 시그널 전송 성공 (${type} to ${toPeerId}):`, response.data);
    } catch (err) {
      console.error(`❌ Signal 전송 실패 (${type} to ${toPeerId}):`, err);
      console.error('Error details:', err.response?.data);
    }
  }, [id, currentPeerId]);

  const createPeerConnection = useCallback((peerId, isInitiator) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔧 Peer Connection 생성 시작`);
    console.log(`   Peer: ${peerId}`);
    console.log(`   Initiator: ${isInitiator}`);
    console.log(`   Current User: ${currentPeerId}`);
    console.log(`   기존 연결 존재: ${!!peerConnections.current[peerId]}`);
    console.log(`${'='.repeat(60)}\n`);
    
    // ⭐ 이미 연결이 있으면 재사용
    if (peerConnections.current[peerId]) {
      console.log(`♻️ 기존 Peer Connection 재사용: ${peerId}`);
      return peerConnections.current[peerId];
    }
    
    try {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`📡 ICE Candidate 생성 (${peerId}):`, event.candidate.candidate);
          sendSignal(peerId, 'candidate', event.candidate.toJSON());
        } else {
          console.log(`✅ ICE Gathering 완료 (${peerId})`);
        }
      };

      pc.ontrack = (event) => {
        console.log(`🎥 Remote Track 수신 (${peerId})`, {
          kind: event.track.kind,
          streamId: event.streams[0]?.id,
          trackId: event.track.id
        });
        
        const remoteStream = event.streams[0];
        
        if (!remoteStream) {
          console.error(`❌ Remote Stream 없음 (${peerId})`);
          return;
        }
        
        console.log(`📺 Remote Stream 상태 (${peerId}):`, {
          id: remoteStream.id,
          active: remoteStream.active,
          videoTracks: remoteStream.getVideoTracks().length,
          audioTracks: remoteStream.getAudioTracks().length
        });
        
        setRemoteStreams(prev => {
          const existingIndex = prev.findIndex(p => p.peerId === peerId);
          
          if (existingIndex >= 0) {
            console.log(`♻️ 기존 Remote Stream 업데이트: ${peerId}`);
            const updated = [...prev];
            updated[existingIndex] = { 
              ...updated[existingIndex], 
              stream: remoteStream 
            };
            return updated;
          }
          
          console.log(`🆕 새로운 Remote Stream 추가: ${peerId}`);
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

      pc.oniceconnectionstatechange = () => {
        console.log(`🔌 ICE Connection State (${peerId}): ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          console.error(`❌ ICE 연결 실패/끊김 (${peerId})`);
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`🔗 Connection State (${peerId}): ${pc.connectionState}`);
        if (pc.connectionState === 'failed') {
          console.error(`❌ 연결 실패 (${peerId})`);
        }
      };

      // ⭐ 저장 먼저
      peerConnections.current[peerId] = pc;
      console.log(`✅ Peer Connection 객체 생성 및 저장 완료: ${peerId}`);

      // ⭐ Local Tracks 추가
      if (localStreamRef.current) {
        const tracks = localStreamRef.current.getTracks();
        console.log(`🎤 Local Tracks 추가 시작 (${peerId}):`, tracks.map(t => `${t.kind}(${t.id})`));
        
        tracks.forEach(track => {
          try {
            const sender = pc.addTrack(track, localStreamRef.current);
            console.log(`✅ Track 추가 성공: ${track.kind} (${peerId})`, {
              trackId: track.id,
              enabled: track.enabled,
              readyState: track.readyState
            });
          } catch (e) {
            console.error(`❌ Track 추가 실패 (${peerId}):`, e);
          }
        });
      } else {
        console.error(`❌ Local Stream 없음 (${peerId})`);
      }

      if (isInitiator) {
        console.log(`🎬 Initiator 모드: Offer 생성 예약 (${peerId})`);
        
        // ⭐ negotiationneeded 대신 직접 Offer 생성
        setTimeout(async () => {
          if (pc.signalingState !== 'stable') {
            console.warn(`⚠️ Signaling state not stable: ${pc.signalingState}`);
            return;
          }
          
          try {
            console.log(`📝 Offer 생성 중... (${peerId})`);
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            console.log(`✅ Offer 생성 완료 (${peerId})`);
            
            await pc.setLocalDescription(offer);
            console.log(`✅ Local Description 설정 완료 (${peerId})`);
            
            await sendSignal(peerId, 'offer', pc.localDescription.toJSON());
            console.log(`✅ Offer 전송 완료 (${peerId})`);
          } catch (e) {
            console.error(`❌ Offer 생성/전송 실패 (${peerId}):`, e);
          }
        }, 500); // 0.5초 후 Offer 생성
      }
      
      return pc;
    } catch (e) {
      console.error('❌ Peer Connection 생성 중 오류:', e);
      return null;
    }
  }, [sendSignal, currentPeerId]);

  // ⭐ handleSignalMessage에서 fetchRoomDetailsRef 사용
  const handleSignalMessage = useCallback(async (message) => {
    const { id: signalId, sender_username: peerId, message_type: type, payload, receiver_username } = message;
    
    if (processedSignals.current.has(signalId)) {
      return;
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📨 시그널 수신: ${type} from ${peerId} (ID: ${signalId})`);
    console.log(`   Receiver: ${receiver_username}`);
    console.log(`   Current User: ${currentPeerId}`);
    console.log(`   Is Host: ${isHost}`);
    console.log(`${'='.repeat(60)}\n`);
    
    if (peerId === currentPeerId) {
      console.log('⚠️ 자신의 시그널 무시');
      processedSignals.current.add(signalId);
      return;
    }

    // ⭐ 특정 수신자 지정된 시그널은 해당 수신자만 처리
    if (receiver_username && receiver_username !== currentPeerId) {
      console.log(`⚠️ 다른 사용자를 위한 시그널 무시 (to: ${receiver_username})`);
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

    // ⭐ approval 시그널 처리 (참가자가 받음) - ref 사용
    if (type === 'approval' && !isHost) {
      console.log('🎉 승인 알림 수신! 회의실 정보를 새로고침합니다.');
      processedSignals.current.add(signalId);
      // ref를 통해 호출
      if (fetchRoomDetailsRef.current) {
        await fetchRoomDetailsRef.current();
      }
      return;
    }
    
    let pc = peerConnections.current[peerId];
    
    if (!pc && type === 'offer') {
      console.log(`🆕 새로운 Peer Connection 생성 (Offer 수신): ${peerId}`);
      pc = createPeerConnection(peerId, false);
      if (!pc) {
        console.error('❌ Peer Connection 생성 실패');
        processedSignals.current.add(signalId);
        return;
      }
    } else if (!pc) {
      console.warn(`⚠️ Peer Connection 없음: ${peerId}, Type: ${type}`);
      processedSignals.current.add(signalId);
      return;
    }
    
    try {
      switch (type) {
        case 'offer':
          console.log(`📥 Offer 수신 (${peerId})`);
          console.log(`   Signaling State: ${pc.signalingState}`);
          
          if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-remote-offer') {
            console.warn(`⚠️ Offer 수신 시 비정상 상태: ${pc.signalingState}`);
          }
          
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          console.log(`✅ Remote Description 설정 완료 (${peerId})`);
          
          const answer = await pc.createAnswer();
          console.log(`✅ Answer 생성 완료 (${peerId})`);
          
          await pc.setLocalDescription(answer);
          console.log(`✅ Local Description (Answer) 설정 완료 (${peerId})`);
          
          await sendSignal(peerId, 'answer', pc.localDescription.toJSON());
          console.log(`✅ Answer 전송 완료: ${peerId}`);
          break;
          
        case 'answer':
          console.log(`📥 Answer 수신 (${peerId})`);
          console.log(`   Signaling State: ${pc.signalingState}`);
          
          if (pc.signalingState !== 'have-local-offer') {
            console.warn(`⚠️ Answer 수신 시 비정상 상태: ${pc.signalingState}`);
          }
          
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          console.log(`✅ Remote Description (Answer) 설정 완료: ${peerId}`);
          break;
          
        case 'candidate':
          console.log(`📥 ICE Candidate 수신 (${peerId})`);
          if (data && data.candidate) {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(data));
              console.log(`✅ ICE Candidate 추가 완료: ${peerId}`);
            } else {
              console.warn(`⚠️ Remote Description 없어서 ICE Candidate 보류: ${peerId}`);
              // ICE candidate는 무시해도 연결은 될 수 있음
            }
          }
          break;
          
        case 'join_ready':
          console.log(`📢 Join Ready 수신 (${peerId})`);
          if (isHost) {
            console.log(`🤝 방장이 Join Ready 수신 - 피어 연결 시작: ${peerId}`);
            
            if (!peerConnections.current[peerId]) {
              console.log(`🆕 Join Ready에 대한 Peer Connection 생성: ${peerId}`);
              createPeerConnection(peerId, true); // 방장이 Initiator
            } else {
              console.log(`♻️ 기존 Peer Connection 존재, Offer 재전송: ${peerId}`);
              const existingPc = peerConnections.current[peerId];
              
              if (existingPc.signalingState === 'stable') {
                try {
                  const offer = await existingPc.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                  });
                  await existingPc.setLocalDescription(offer);
                  await sendSignal(peerId, 'offer', existingPc.localDescription.toJSON());
                  console.log(`✅ Offer 재전송 완료: ${peerId}`);
                } catch (e) {
                  console.error(`❌ Offer 재전송 실패: ${peerId}`, e);
                }
              }
            }
          }
          break;
          
        default:
          console.warn(`⚠️ 알 수 없는 시그널 타입: ${type}`);
      }
      
      processedSignals.current.add(signalId);
      
    } catch (e) {
      console.error(`❌ 시그널 처리 중 오류 (${type} from ${peerId}):`, e);
      console.error('Stack:', e.stack);
      processedSignals.current.add(signalId);
    }
  }, [createPeerConnection, sendSignal, currentPeerId, isHost]);

  const pollSignals = useCallback(async () => {
    if (!currentPeerId) return;

    try {
      const response = await axios.get(`/video-meetings/${id}/get_signals/`);
      const signals = response.data;
      
      if (signals && signals.length > 0) {
        console.log(`📩 새로운 시그널 ${signals.length}개 수신:`, signals);
        
        for (const signal of signals) {
          await handleSignalMessage(signal);
        }
      }
    } catch (error) {
      console.error('❌ 시그널 폴링 실패:', error);
      if (error.response?.status === 404 || error.response?.status === 403) {
        clearInterval(signalPollingIntervalRef.current);
      }
    }
  }, [id, currentPeerId, handleSignalMessage]);

  const pollPendingRequests = useCallback(async () => {
    if (!isHost) return;

    try {
      const response = await axios.get(`/video-meetings/${id}/pending_requests/`);
      const pending = response.data;
      
      console.log(`📋 대기 요청 ${pending.length}개:`, pending);
      setPendingRequests(pending);
      
      if (pending.length > 0 && !showPendingPanel) {
        setShowPendingPanel(true);
      }
    } catch (error) {
      console.error('❌ 대기 요청 폴링 실패:', error);
    }
  }, [id, isHost, showPendingPanel]);
  
  const getLocalMedia = useCallback(async () => {
    if (localStreamRef.current) {
      console.log('✅ 기존 스트림 재사용');
      return localStreamRef.current;
    }

    try {
      console.log('🎥 미디어 스트림 요청 중...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: true,
      });
      
      localStreamRef.current = stream;
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      setMediaReady(true);
      console.log('✅ 미디어 스트림 준비 완료');
      return stream;
    } catch (err) {
      console.error('❌ 로컬 미디어 접근 실패:', err);
      alert('마이크와 카메라 접근 권한이 필요합니다.');
      setError('미디어 접근 실패');
      return null;
    }
  }, []);
  
  // =========================================================================
  // 2. Room & Participant Handling
  // =========================================================================

  // ⭐ fetchRoomDetails를 별도로 정의하고 ref에 저장
  const fetchRoomDetails = useCallback(async () => {
    try {
      const response = await axios.get(`/video-meetings/${id}/`);
      const roomData = response.data;
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📋 회의실 정보 로딩`);
      console.log(`   Room: ${roomData.title}`);
      console.log(`   Host: ${roomData.host_username}`);
      console.log(`   Current User: ${user?.username}`);
      console.log(`   Status: ${roomData.participant_status}`);
      console.log(`   Participants: ${roomData.participants?.length || 0}`);
      console.log(`${'='.repeat(60)}\n`);
      
      const previousStatus = room?.participant_status;
      
      setRoom(roomData);

      const isCurrentUserHost = roomData.host_username === user.username;
      setIsHost(isCurrentUserHost);

      const approvedParticipants = roomData.participants.filter(p => p.status === 'approved');
      setParticipants(approvedParticipants);
      
      console.log(`👥 승인된 참가자: ${approvedParticipants.length}명`);
      approvedParticipants.forEach(p => {
        console.log(`   - ${p.username} (${p.status})`);
      });
      
      if (!isCurrentUserHost) {
        const status = roomData.participant_status;
        
        // ⭐ 승인 상태가 변경되었을 때만 처리
        if (previousStatus !== 'approved' && status === 'approved') {
          console.log('🎉 승인 완료! 미디어 초기화를 트리거합니다.');
          // mediaReady를 false로 설정하여 useEffect 재실행
          setMediaReady(false);
        }
        
        if (status === 'rejected') {
          alert('참가 요청이 거부되었습니다.');
          navigate('/video-meetings');
          return;
        }
      }
    } catch (error) {
      console.error('❌ 회의실 정보 로딩 실패:', error);
      setError('회의실 정보를 가져올 수 없습니다.');
      if (error.response?.status === 404) {
        alert('회의실을 찾을 수 없습니다.');
        navigate('/video-meetings');
      }
    } finally {
      setLoading(false);
    }
  }, [id, user, navigate, room?.participant_status]);

  // ⭐ fetchRoomDetails를 ref에 저장
  useEffect(() => {
    fetchRoomDetailsRef.current = fetchRoomDetails;
  }, [fetchRoomDetails]);

  const cleanupMedia = useCallback(() => {
    console.log('🧹 미디어 정리 시작...');
    
    Object.values(peerConnections.current).forEach(pc => {
      pc.close();
    });
    peerConnections.current = {};
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`🛑 Track 중지: ${track.kind} (readyState: ${track.readyState})`);
      });
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      
      localStreamRef.current = null;
    }
    
    if (signalPollingIntervalRef.current) {
      clearInterval(signalPollingIntervalRef.current);
      signalPollingIntervalRef.current = null;
    }
    
    if (pendingPollingIntervalRef.current) {
      clearInterval(pendingPollingIntervalRef.current);
      pendingPollingIntervalRef.current = null;
    }
    
    processedSignals.current.clear();
    
    setMediaReady(false);
    setRemoteStreams([]);
    
    console.log('✅ 미디어 정리 완료');
  }, []);

  const handleLeave = async () => {
    console.log('👋 회의 종료/나가기 시도...');
    
    cleanupMedia();
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      await axios.post(`/video-meetings/${id}/leave/`);
      console.log('✅ 회의실 나가기 완료');
    } catch (error) {
      console.error('❌ 회의실 나가기 실패:', error);
    } finally {
      navigate('/video-meetings');
    }
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isMicOn;
        setIsMicOn(!isMicOn);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoOn;
        setIsVideoOn(!isVideoOn);
      }
    }
  };

  const handleApprove = async (participantId) => {
    try {
      const response = await axios.post(`/video-meetings/${id}/approve_participant/`, {
        participant_id: participantId
      });
      
      const approvedParticipant = response.data;
      console.log(`✅ 참가 승인 완료:`, approvedParticipant);
      
      setPendingRequests(prev => prev.filter(p => p.id !== participantId));
      setParticipants(prev => [...prev, approvedParticipant]);
      
      // ⭐ 회의실 정보 새로고침 (participant_count 업데이트)
      await fetchRoomDetails();
      
      // ⭐ 승인된 참가자와 피어 연결 시작 (방장이 Offer 생성)
      const participantUsername = approvedParticipant.username;
      if (participantUsername && !peerConnections.current[participantUsername]) {
        console.log(`🤝 승인된 참가자와 피어 연결 대기: ${participantUsername}`);
        console.log(`   참가자가 join_ready를 보낼 때까지 대기합니다.`);
        // join_ready 시그널을 받으면 자동으로 연결 시작됨
      }
    } catch (error) {
      console.error('❌ 참가 승인 실패:', error);
      alert('참가 승인에 실패했습니다.');
    }
  };

  const handleReject = async (participantId) => {
    try {
      await axios.post(`/video-meetings/${id}/reject_participant/`, {
        participant_id: participantId
      });
      
      console.log(`✅ 참가 거부 완료: ${participantId}`);
      
      setPendingRequests(prev => prev.filter(p => p.id !== participantId));
    } catch (error) {
      console.error('❌ 참가 거부 실패:', error);
      alert('참가 거부에 실패했습니다.');
    }
  };

  // =========================================================================
  // 3. useEffect Hooks
  // =========================================================================

  useEffect(() => {
    fetchRoomDetails();
    
    return () => {
      console.log('🔄 컴포넌트 언마운트 - 정리 시작');
      cleanupMedia();
    };
  }, [fetchRoomDetails, cleanupMedia]);
  
  useEffect(() => {
    if (!room || mediaReady || !user) return;
    
    const isApproved = room.participant_status === 'approved' || isHost;
    if (!isApproved) {
      console.log('⏳ 아직 승인되지 않음. 대기 중...');
      return;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('🚀 WebRTC 초기화 시작');
    console.log(`   User: ${user.username}`);
    console.log(`   Is Host: ${isHost}`);
    console.log(`   Room: ${room.title}`);
    console.log(`   Participant Status: ${room.participant_status}`);
    console.log(`   Media Ready: ${mediaReady}`);
    console.log(`${'='.repeat(60)}\n`);
    
    const initializeMedia = async () => {
      const stream = await getLocalMedia();
      if (!stream) {
        console.error('❌ 미디어 스트림 획득 실패');
        return;
      }

      console.log('✅ 미디어 스트림 준비 완료');
      console.log(`   Video Tracks: ${stream.getVideoTracks().length}`);
      console.log(`   Audio Tracks: ${stream.getAudioTracks().length}`);
      
      // 시그널 폴링 시작
      console.log('📡 시그널 폴링 시작');
      signalPollingIntervalRef.current = setInterval(pollSignals, 1000);
      
      if (isHost) {
        console.log('👑 방장 모드 초기화');
        pollPendingRequests();
        pendingPollingIntervalRef.current = setInterval(pollPendingRequests, 2000);
        
        const approvedParticipants = room.participants.filter(p => p.status === 'approved');
        console.log(`👥 이미 승인된 참가자 ${approvedParticipants.length}명과 연결 준비`);
        
        // 이미 승인된 참가자들은 join_ready를 보낼 것이므로 대기
        approvedParticipants.forEach(p => {
          console.log(`   - 대기 중: ${p.username}`);
        });
      } else {
        // ⭐ 참가자는 미디어 준비 후 join_ready 전송
        console.log('👤 참가자 모드 초기화');
        console.log(`   Host: ${room.host_username}`);
        
        if (room.host_username && room.participant_status === 'approved') {
          // 충분한 시간을 주고 join_ready 전송
          setTimeout(() => {
            console.log('\n📢 Join Ready 시그널 전송 시도');
            console.log(`   To: ${room.host_username}`);
            console.log(`   From: ${user.username}`);
            sendSignal(room.host_username, 'join_ready', {
              username: user.username,
              timestamp: Date.now()
            });
            console.log('✅ Join Ready 전송 완료\n');
          }, 2000); // 2초 후 전송
        }
      }
    };
    
    initializeMedia();
  }, [room, user, isHost, mediaReady, getLocalMedia, pollSignals, pollPendingRequests, sendSignal]);

  // =========================================================================
  // 4. UI Rendering
  // =========================================================================
  
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-900">
        <Loader className="animate-spin w-10 h-10 text-white" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-900 text-white">
        <p>{error || '회의실을 로드할 수 없습니다.'}</p>
      </div>
    );
  }

  const allVideos = [
    {
      peerId: currentPeerId,
      username: `${user?.username}`,
      stream: localStreamRef.current,
      isLocal: true,
      isMuted: !isMicOn,
      isVideoOff: !isVideoOn,
      ref: localVideoRef,
    },
    ...remoteStreams,
  ].filter(v => v.stream || v.isLocal);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      
      {/* 상단 헤더 */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-white text-xl font-bold">{room?.title}</h1>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-400">
                {allVideos.length}명 참가 중
              </span>
            </div>
          </div>
          
          {isHost && (
            <button 
              onClick={() => setShowPendingPanel(!showPendingPanel)}
              className="relative p-2 bg-gray-700 text-white rounded-full hover:bg-gray-600 transition"
            >
              <Bell className="w-5 h-5" />
              {pendingRequests.length > 0 && (
                <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 대기 요청 패널 */}
      {isHost && showPendingPanel && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-gray-900 font-semibold flex items-center">
              <Users className="w-5 h-5 mr-2" />
              참가 대기 중 ({pendingRequests.length})
            </h3>
            <button
              onClick={() => setShowPendingPanel(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {pendingRequests.length === 0 ? (
            <p className="text-gray-600 text-sm">대기 중인 참가자가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm"
                >
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                      <span className="text-blue-600 font-semibold text-sm">
                        {request.username?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-gray-900 font-medium">{request.username}</p>
                      <p className="text-gray-500 text-xs">
                        {new Date(request.created_at).toLocaleString('ko-KR')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(request.id)}
                      className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition flex items-center text-sm"
                    >
                      <UserCheck className="w-4 h-4 mr-1" />
                      승인
                    </button>
                    <button
                      onClick={() => handleReject(request.id)}
                      className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition flex items-center text-sm"
                    >
                      <UserX className="w-4 h-4 mr-1" />
                      거부
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 메인 비디오 영역 */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-6xl mx-auto grid gap-4" 
             style={{
               gridTemplateColumns: allVideos.length === 1 
                 ? '1fr' 
                 : allVideos.length === 2
                 ? 'repeat(2, 1fr)'
                 : 'repeat(auto-fit, minmax(400px, 1fr))'
             }}>
          
          {allVideos.map((video, index) => (
            <div 
              key={video.peerId || index} 
              className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video"
              style={{ maxHeight: '400px' }}
            >
              <VideoElement 
                ref={video.ref} 
                stream={video.stream} 
                isLocal={video.isLocal}
                isVideoOff={video.isVideoOff}
              />

              {video.isVideoOff && (
                <div className="absolute inset-0 bg-gray-900 bg-opacity-70 flex items-center justify-center">
                  <VideoOff className="w-12 h-12 text-gray-400" />
                </div>
              )}
              
              <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 px-3 py-1 rounded flex items-center gap-2">
                {video.isMuted ? (
                  <MicOff className="w-4 h-4 text-red-400" />
                ) : (
                  <Mic className="w-4 h-4 text-white" />
                )}
                <span className="text-white text-sm font-medium">
                  {video.username}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* 하단 컨트롤 바 */}
      <div className="bg-gray-800 border-t border-gray-700 px-6 py-3 flex justify-center items-center gap-6">
        <button
          onClick={toggleMic}
          className={`p-3 rounded-full transition ${isMicOn ? 'bg-white text-gray-900 hover:bg-gray-200' : 'bg-red-600 text-white hover:bg-red-700'}`}
        >
          {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
        </button>
        <button
          onClick={toggleVideo}
          className={`p-3 rounded-full transition ${isVideoOn ? 'bg-white text-gray-900 hover:bg-gray-200' : 'bg-red-600 text-white hover:bg-red-700'}`}
        >
          {isVideoOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
        </button>
        <button
          onClick={handleLeave}
          className="p-3 bg-red-800 text-white rounded-full hover:bg-red-900 transition"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

// =========================================================================
// Helper Component
// =========================================================================

const VideoElement = React.forwardRef(({ stream, isLocal, isVideoOff }, ref) => {
  const defaultRef = useRef();
  const resolvedRef = ref || defaultRef;

  useEffect(() => {
    if (resolvedRef.current && stream) {
      resolvedRef.current.srcObject = stream;
    }
  }, [stream, resolvedRef]);

  return (
    <video
      ref={resolvedRef}
      autoPlay
      playsInline
      muted={isLocal}
      className={`w-full h-full object-cover ${isLocal ? 'transform scaleX(-1)' : ''}`}
      style={{ display: isVideoOff ? 'none' : 'block' }}
    />
  );
});

export default VideoMeetingRoom;