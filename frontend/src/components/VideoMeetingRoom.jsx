// frontend/src/components/VideoMeetingRoom.jsx (수정 버전)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Video, VideoOff, Mic, MicOff, PhoneOff, Users, UserCheck, UserX, Bell, Loader } from 'lucide-react';
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
  const localStreamRef = useRef(null); // ⭐ ref로 변경
  
  // WebRTC 상태
  const [remoteStreams, setRemoteStreams] = useState([]);
  const peerConnections = useRef({});
  const signalPollingIntervalRef = useRef(null);

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
  const [mediaReady, setMediaReady] = useState(false); // ⭐ 미디어 준비 상태

  const currentPeerId = user?.username;

  // =========================================================================
  // 1. WebRTC & Signaling Functions
  // =========================================================================

  const sendSignal = useCallback(async (toPeerId, type, payload = {}) => {
    if (!currentPeerId) return;

    const message = {
      message_type: type,
      payload: JSON.stringify(payload),
      receiver_username: toPeerId,
    };

    try {
      await axios.post(`/video-meetings/${id}/send_signal/`, message);
    } catch (err) {
      console.error(`❌ Signal 전송 실패 (${type} to ${toPeerId}):`, err);
    }
  }, [id, currentPeerId]);

  const createPeerConnection = useCallback((peerId, isInitiator) => {
    try {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`📡 ICE Candidate 전송 (${peerId}):`, event.candidate);
          sendSignal(peerId, 'candidate', event.candidate.toJSON());
        }
      };

      pc.ontrack = (event) => {
        console.log(`🎥 Remote Stream 수신 (${peerId})`, event.streams[0]);
        const remoteStream = event.streams[0];
        setRemoteStreams(prev => {
          const existingPeer = prev.find(p => p.peerId === peerId);
          if (existingPeer) {
            return prev.map(p => p.peerId === peerId ? { ...p, stream: remoteStream } : p);
          }
          
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

      peerConnections.current[peerId] = pc;
      console.log(`✅ Peer Connection 생성 완료: ${peerId}`);

      // ⭐ ref에서 스트림 가져오기
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
        console.log(`🎤 Local Tracks 추가: ${peerId}`);
      }

      if (isInitiator) {
        pc.onnegotiationneeded = async () => {
          try {
            console.log(`💬 Offer 생성 시도: ${peerId}`);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignal(peerId, 'offer', pc.localDescription.toJSON());
            console.log(`💬 Offer 전송 완료: ${peerId}`);
          } catch (e) {
            console.error('❌ Offer 생성 실패:', e);
          }
        };
      }
      return pc;
    } catch (e) {
      console.error('❌ Peer Connection 생성 중 오류:', e);
      return null;
    }
  }, [sendSignal]); // ⭐ localStream 의존성 제거

  const handleSignalMessage = useCallback(async (message) => {
    const { sender_username: peerId, message_type: type, payload } = message;
    const data = JSON.parse(payload);
    
    if (peerId === currentPeerId) return;

    let pc = peerConnections.current[peerId];
    
    if (!pc) {
      pc = createPeerConnection(peerId, false);
      if (!pc) return;
    }
    
    try {
      switch (type) {
        case 'offer':
          console.log(`📥 Offer 수신: ${peerId}`);
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(peerId, 'answer', pc.localDescription.toJSON());
          console.log(`📤 Answer 전송: ${peerId}`);
          break;
        case 'answer':
          console.log(`📥 Answer 수신: ${peerId}`);
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          break;
        case 'candidate':
          console.log(`📥 ICE Candidate 수신: ${peerId}`);
          if (data.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
          break;
        case 'join_ready':
          console.log(`📢 Join Ready 수신: ${peerId}`);
          if (isHost && !pc.localDescription) {
            pc.dispatchEvent(new Event('negotiationneeded')); 
          }
          break;
        default:
          console.warn(`⚠️ 알 수 없는 시그널 타입: ${type}`);
      }
    } catch (e) {
      console.error(`❌ 시그널 처리 중 오류 (${type} from ${peerId}):`, e);
    }
  }, [createPeerConnection, sendSignal, currentPeerId, isHost]);

  const pollSignals = useCallback(async () => {
    if (!currentPeerId) return;

    try {
      const response = await axios.get(`/video-meetings/${id}/get_signals/`);
      const signals = response.data;
      
      if (signals && signals.length > 0) {
        console.log(`📩 새로운 시그널 ${signals.length}개 수신:`, signals);
        signals.forEach(handleSignalMessage);
      }
    } catch (error) {
      console.error('❌ 시그널 폴링 실패:', error);
      if (error.response?.status === 404 || error.response?.status === 403) {
        clearInterval(signalPollingIntervalRef.current);
      }
    }
  }, [id, currentPeerId, handleSignalMessage]);
  
  // ⭐ 미디어 스트림 가져오기 (한 번만 실행)
  const getLocalMedia = useCallback(async () => {
    // 이미 스트림이 있으면 재사용
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

  const fetchRoomDetails = useCallback(async () => {
    try {
      const response = await axios.get(`/video-meetings/${id}/`);
      const roomData = response.data;
      setRoom(roomData);

      const isCurrentUserHost = roomData.host_username === user.username;
      setIsHost(isCurrentUserHost);

      const approvedParticipants = roomData.participants.filter(p => p.status === 'approved');
      setParticipants(approvedParticipants);
      
      if (!isCurrentUserHost) {
        const status = roomData.participant_status;
        if (status === 'rejected') {
          alert('참가 요청이 거부되었습니다.');
          navigate('/video-meetings');
          return;
        }
        if (status !== 'approved') {
          if (status === 'pending') {
            console.log('대기 중입니다...');
          }
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
  }, [id, user, navigate]);

  // ⭐ 미디어 정리 함수
  const cleanupMedia = useCallback(() => {
    console.log('🧹 미디어 정리 시작...');
    
    // 1. Peer Connections 정리
    Object.values(peerConnections.current).forEach(pc => {
      pc.close();
    });
    peerConnections.current = {};
    
    // 2. Local Stream 정리
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`🛑 Track 중지: ${track.kind}`);
      });
      localStreamRef.current = null;
    }
    
    // 3. Video Element 정리
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    
    // 4. Polling 중지
    if (signalPollingIntervalRef.current) {
      clearInterval(signalPollingIntervalRef.current);
      signalPollingIntervalRef.current = null;
    }
    
    setMediaReady(false);
    setRemoteStreams([]);
    
    console.log('✅ 미디어 정리 완료');
  }, []);

  const handleLeave = async () => {
    console.log('👋 회의 종료/나가기 시도...');
    
    try {
      // 미디어 정리
      cleanupMedia();
      
      // 백엔드에 나가기 요청
      await axios.post(`/video-meetings/${id}/leave/`);
      console.log('✅ 회의실 나가기 완료');
      
      navigate('/video-meetings');
    } catch (error) {
      console.error('❌ 회의실 나가기 실패:', error);
      // 에러가 발생해도 페이지 이동
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

  // =========================================================================
  // 3. useEffect Hooks
  // =========================================================================

  // ⭐ 컴포넌트 마운트/언마운트 시 정리
  useEffect(() => {
    fetchRoomDetails();
    
    return () => {
      console.log('🔄 컴포넌트 언마운트 - 정리 시작');
      cleanupMedia();
    };
  }, [fetchRoomDetails, cleanupMedia]);
  
  // ⭐ WebRTC 초기화 (미디어 준비 후 한 번만)
  useEffect(() => {
    if (!room || mediaReady || !user) return;
    
    const isApproved = room.participant_status === 'approved' || isHost;
    if (!isApproved) return;

    console.log('🚀 WebRTC 초기화 시작...');
    
    getLocalMedia().then(stream => {
      if (!stream) return;

      // 시그널 폴링 시작
      signalPollingIntervalRef.current = setInterval(pollSignals, 1000);
      
      // Host가 아닌 경우 join_ready 시그널 전송
      if (!isHost && room.host_username) {
        console.log('📢 Join Ready 시그널 전송 (Host에게)');
        sendSignal(room.host_username, 'join_ready');
      }
    });
  }, [room, user, isHost, mediaReady, getLocalMedia, pollSignals, sendSignal]);

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
                {participants.filter(p => p.status === 'approved').length + (isHost ? 1 : 0)}명 참가 중
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

      {/* ⭐ 메인 비디오 영역 - 크기 조정 */}
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