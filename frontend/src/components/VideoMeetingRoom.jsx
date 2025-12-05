// frontend/src/components/VideoMeetingRoom.jsx (최종 개선 버전)
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Custom Hooks
import { useWebRTC } from '../hooks/useWebRTC';
import { useVideoMeetingAPI } from '../hooks/useVideoMeetingAPI';

// UI Components
import { RoomHeader } from './VideoMeeting/RoomHeader';
import { PendingRequestsPanel } from './VideoMeeting/PendingRequestsPanel';
import { VideoGrid } from './VideoMeeting/VideoGrid';
import { ControlBar } from './VideoMeeting/ControlBar';
import { HostLeaveModal } from './VideoMeeting/HostLeaveModal';

function VideoMeetingRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // State
  const [isHost, setIsHost] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [showPendingPanel, setShowPendingPanel] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false); // ⭐ 새로운 상태
  const [mediaReady, setMediaReady] = useState(false);

  // Refs
  const localVideoRef = useRef(null);
  const signalPollingIntervalRef = useRef(null);
  const pendingPollingIntervalRef = useRef(null);
  const fetchRoomDetailsRef = useRef(null);

  // Custom Hooks
  const api = useVideoMeetingAPI(id);
  const webrtc = useWebRTC(id, user, isHost);

  const { room, participants, pendingRequests, loading, error } = api;
  const { 
    localStreamRef, 
    remoteStreams, 
    connectionStatus,
    getLocalMedia,
    sendSignal,
    handleSignal,
    cleanup 
  } = webrtc;

  // =========================================================================
  // Handlers
  // =========================================================================

  // ⭐ 방장 퇴장 핸들러 (모달 표시)
  const handleLeaveClick = () => {
    if (isHost && remoteStreams.length > 0) {
      // 방장이고 참가자가 있으면 모달 표시
      setShowLeaveModal(true);
    } else {
      // 방장이 아니거나 참가자가 없으면 바로 나가기
      handleLeaveOnly();
    }
  };

  // ⭐ 나만 나가기
  const handleLeaveOnly = async () => {
    console.log('👋 회의실 나가기...');
    
    cleanup();
    
    try {
      await api.leaveRoom();
    } catch (error) {
      console.error('❌ 나가기 실패:', error);
    } finally {
      navigate('/video-meetings');
    }
  };

  // ⭐ 회의 종료 (모든 참가자 퇴장)
  const handleEndMeeting = async () => {
    console.log('🛑 회의 종료...');
    
    cleanup();
    
    try {
      // 회의 종료 API 호출
      await api.endMeeting();
      alert('회의가 종료되었습니다. 모든 참가자가 퇴장됩니다.');
    } catch (error) {
      console.error('❌ 회의 종료 실패:', error);
      alert('회의 종료에 실패했습니다.');
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
        console.log(`🎤 마이크 ${!isMicOn ? 'ON' : 'OFF'}`);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoOn;
        setIsVideoOn(!isVideoOn);
        console.log(`📹 비디오 ${!isVideoOn ? 'ON' : 'OFF'}`);
      }
    }
  };

  const handleApprove = async (participantId) => {
    try {
      await api.approveParticipant(participantId);
      console.log('✅ 승인 완료');
    } catch (error) {
      alert('참가 승인에 실패했습니다.');
    }
  };

  const handleReject = async (participantId) => {
    try {
      await api.rejectParticipant(participantId);
      console.log('✅ 거부 완료');
    } catch (error) {
      alert('참가 거부에 실패했습니다.');
    }
  };

  // =========================================================================
  // Signal Polling
  // =========================================================================

  const pollSignals = async () => {
    const signals = await api.pollSignals();
    
    if (signals === null) {
      clearInterval(signalPollingIntervalRef.current);
      return;
    }
    
    if (signals && signals.length > 0) {
      console.log(`📩 ${signals.length}개 시그널 수신`);
      
      for (const signal of signals) {
        await handleSignal(signal, fetchRoomDetailsRef.current);
      }
    }
  };

  const pollPendingRequests = async () => {
    if (!isHost) return;
    
    const pending = await api.fetchPendingRequests();
    
    // ⭐ 새로운 대기 요청이 있으면 자동으로 패널 표시
    if (pending.length > 0) {
      if (!showPendingPanel) {
        console.log(`📢 ${pending.length}개 대기 요청 - 패널 자동 표시`);
        setShowPendingPanel(true);
      }
    } else if (pending.length === 0 && showPendingPanel) {
      // 대기 요청이 없으면 패널 자동 닫기
      console.log('✅ 모든 요청 처리 완료 - 패널 닫기');
      setShowPendingPanel(false);
    }
  };

  // =========================================================================
  // Effects
  // =========================================================================

  // Room Details 가져오기
  useEffect(() => {
    const fetchAndSetRoom = async () => {
      try {
        const roomData = await api.fetchRoomDetails();
        
        const isCurrentUserHost = roomData.host_username === user.username;
        setIsHost(isCurrentUserHost);
        
        if (!isCurrentUserHost) {
          const status = roomData.participant_status;
          
          if (status === 'rejected') {
            alert('참가 요청이 거부되었습니다.');
            navigate('/video-meetings');
            return;
          }
          
          if (room && room.participant_status !== 'approved' && status === 'approved') {
            console.log('🎉 승인 완료! 미디어 초기화 트리거');
            setMediaReady(false);
          }
        }
      } catch (error) {
        if (error.response?.status === 404) {
          alert('회의실을 찾을 수 없습니다.');
          navigate('/video-meetings');
        }
      }
    };
    
    fetchAndSetRoom();
    fetchRoomDetailsRef.current = fetchAndSetRoom;
    
    return () => {
      console.log('🔄 컴포넌트 언마운트');
      cleanup();
    };
  }, []);

  // WebRTC 초기화
  useEffect(() => {
    if (!room || mediaReady || !user) return;
    
    const isApproved = room.participant_status === 'approved' || isHost;
    if (!isApproved) {
      console.log('⏳ 승인 대기 중...');
      return;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('🚀 WebRTC 초기화');
    console.log(`   User: ${user.username}`);
    console.log(`   Is Host: ${isHost}`);
    console.log(`${'='.repeat(60)}\n`);
    
    const initializeMedia = async () => {
      try {
        console.log('🎥 미디어 획득 시작...');
        const stream = await getLocalMedia();
        
        if (!stream) {
          alert('마이크와 카메라 권한이 필요합니다.');
          return;
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          console.log('✅ Local Video Element에 스트림 연결');
        }

        setMediaReady(true);
        console.log('✅ 미디어 준비 완료');
        
        // ⭐ 약간의 대기 후 폴링 시작 (안정화)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 시그널 폴링 시작
        console.log('📡 시그널 폴링 시작 (1초 간격)');
        signalPollingIntervalRef.current = setInterval(pollSignals, 1000);
        
        if (isHost) {
          console.log('👑 방장 모드 - 대기 요청 폴링 시작');
          
          // 즉시 한 번 실행
          pollPendingRequests();
          
          // 1초마다 체크
          pendingPollingIntervalRef.current = setInterval(pollPendingRequests, 1000);
        } else {
          console.log('👤 참가자 모드');
          
          // ⭐ 참가자는 승인된 상태에서만 Join Ready 전송
          if (room.host_username && room.participant_status === 'approved') {
            console.log(`\n${'🎯'.repeat(30)}`);
            console.log(`🎯 승인 완료 - Join Ready 전송`);
            console.log(`   Host: ${room.host_username}`);
            console.log(`   User: ${user.username}`);
            console.log(`${'🎯'.repeat(30)}\n`);
            
            // ⭐ 여러 번 전송 (안전성 확보)
            const sendJoinReady = async () => {
              try {
                await sendSignal(room.host_username, 'join_ready', {
                  username: user.username,
                  timestamp: Date.now()
                });
                console.log('✅ Join Ready 전송 완료');
              } catch (e) {
                console.error('❌ Join Ready 전송 실패:', e);
              }
            };
            
            // 1초, 3초, 5초에 전송 (재시도)
            setTimeout(sendJoinReady, 1000);
            setTimeout(sendJoinReady, 3000);
            setTimeout(sendJoinReady, 5000);
          }
        }
      } catch (error) {
        console.error('❌ 미디어 초기화 실패:', error);
        alert('카메라/마이크 접근에 실패했습니다.');
      }
    };
    
    initializeMedia();
    
    return () => {
      if (signalPollingIntervalRef.current) {
        clearInterval(signalPollingIntervalRef.current);
      }
      if (pendingPollingIntervalRef.current) {
        clearInterval(pendingPollingIntervalRef.current);
      }
    };
  }, [room, user, isHost, mediaReady]);

  // =========================================================================
  // Render
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

  // ⭐ 승인 대기 중 화면
  if (!isHost && room.participant_status === 'pending') {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-gray-900 text-white">
        <Loader className="animate-spin w-12 h-12 mb-6" />
        <h2 className="text-2xl font-bold mb-2">참가 승인 대기 중...</h2>
        <p className="text-gray-400">방장의 승인을 기다리고 있습니다.</p>
        <button
          onClick={() => navigate('/video-meetings')}
          className="mt-6 px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition"
        >
          뒤로 가기
        </button>
      </div>
    );
  }

  const allVideos = [
    {
      peerId: user?.username,
      username: `${user?.username} (나)`,
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
      
      {/* 헤더 */}
      <RoomHeader
        title={room.title}
        participantCount={allVideos.length}
        connectionStatus={connectionStatus}
        isHost={isHost}
        pendingCount={pendingRequests.length}
        onTogglePendingPanel={() => setShowPendingPanel(!showPendingPanel)}
      />

      {/* 대기 요청 패널 */}
      {isHost && showPendingPanel && (
        <PendingRequestsPanel
          requests={pendingRequests}
          onApprove={handleApprove}
          onReject={handleReject}
          onClose={() => setShowPendingPanel(false)}
        />
      )}

      {/* 비디오 그리드 */}
      <VideoGrid videos={allVideos} />
      
      {/* 컨트롤 바 */}
      <ControlBar
        isMicOn={isMicOn}
        isVideoOn={isVideoOn}
        onToggleMic={toggleMic}
        onToggleVideo={toggleVideo}
        onLeave={handleLeaveClick} // ⭐ 변경
      />

      {/* ⭐ 방장 퇴장 모달 */}
      <HostLeaveModal
        isOpen={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        onLeaveOnly={handleLeaveOnly}
        onEndMeeting={handleEndMeeting}
      />
    </div>
  );
}

export default VideoMeetingRoom;