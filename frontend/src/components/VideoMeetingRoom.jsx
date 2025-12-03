// frontend/src/components/VideoMeetingRoom.jsx (수정)
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Video, VideoOff, Mic, MicOff, PhoneOff, 
  Users, UserCheck, UserX, Bell, Loader 
} from 'lucide-react';
import axios from '../api/axios';
import { useAuth } from '../contexts/AuthContext';

function VideoMeetingRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [myStatus, setMyStatus] = useState(null);
  const [isHost, setIsHost] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showPendingPanel, setShowPendingPanel] = useState(false);
  
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  // ✅ 로컬 미디어 스트림
  const [localStream, setLocalStream] = useState(null);
  const localVideoRef = React.useRef(null);

  // ✅ 컴포넌트 언마운트 시 미디어 정리
  useEffect(() => {
    return () => {
      console.log('🧹 컴포넌트 언마운트: 미디어 스트림 정리');
      cleanupMediaStream();
    };
  }, []);

  // ✅ 미디어 스트림 정리 함수
  const cleanupMediaStream = () => {
    if (localStream) {
      console.log('🛑 미디어 스트림 종료 중...');
      localStream.getTracks().forEach(track => {
        track.stop();
        console.log(`✅ ${track.kind} 트랙 종료됨`);
      });
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      
      setLocalStream(null);
      console.log('✅ 미디어 정리 완료');
    }
  };

  // ✅ 회의실 데이터 로드
  useEffect(() => {
    fetchRoomData();
  }, [id]);

  // ✅ 미디어 스트림 초기화 (승인된 후에만)
  useEffect(() => {
    if (!room || (myStatus !== 'approved' && !isHost)) return;

    let mounted = true;

    const initMedia = async () => {
      try {
        console.log('🎥 미디어 스트림 요청 중...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        
        if (!mounted) {
          // 컴포넌트가 언마운트된 경우 즉시 종료
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        
        console.log('✅ 미디어 스트림 획득 성공');
        setLocalStream(stream);
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('❌ 미디어 스트림 오류:', error);
        if (mounted) {
          alert('카메라/마이크 접근 권한이 필요합니다.');
        }
      }
    };

    initMedia();

    // ✅ 클린업
    return () => {
      mounted = false;
      cleanupMediaStream();
    };
  }, [room, myStatus, isHost]);

  // ✅ 비디오 element에 스트림 연결
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // ✅ 방장: 대기 요청 폴링 (3초 간격으로 단축)
  useEffect(() => {
    if (!isHost || !room) return;

    const fetchPending = async () => {
      try {
        console.log('📋 대기 요청 조회 중...');
        const response = await axios.get(`/video-meetings/${id}/pending_requests/`);
        console.log('📋 대기 요청 응답:', response.data);
        setPendingRequests(response.data);
        
        if (response.data.length > 0 && !showPendingPanel) {
          setShowPendingPanel(true);
        }
      } catch (error) {
        console.error('❌ 대기 요청 조회 실패:', error);
      }
    };

    fetchPending();
    const interval = setInterval(fetchPending, 3000); // ✅ 30초 → 3초로 변경
    
    return () => clearInterval(interval);
  }, [id, isHost, room, showPendingPanel]);

  // ✅ 참가자: 승인 상태 폴링 (3초 간격)
  useEffect(() => {
    if (isHost || !room) return; // 방장은 체크 불필요

    const checkApprovalStatus = async () => {
      try {
        console.log('🔍 승인 상태 체크 중...');
        const response = await axios.get(`/video-meetings/${id}/`);
        const newStatus = response.data.participant_status;
        
        console.log('📊 현재 상태:', {
          old: myStatus,
          new: newStatus
        });

        if (newStatus !== myStatus) {
          console.log('✅ 상태 변경 감지:', myStatus, '→', newStatus);
          setMyStatus(newStatus);
          
          // 승인되면 자동으로 회의실 데이터 갱신
          if (newStatus === 'approved') {
            console.log('🎉 승인 완료! 회의실 입장');
            await fetchRoomData();
          }
        }
      } catch (error) {
        console.error('❌ 상태 체크 실패:', error);
      }
    };

    // pending 상태일 때만 폴링
    if (myStatus === 'pending') {
      const interval = setInterval(checkApprovalStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [id, isHost, myStatus, room]);

  const fetchRoomData = async () => {
    try {
      setLoading(true);
      console.log('🔄 회의실 데이터 로드:', id);
      
      const response = await axios.get(`/video-meetings/${id}/`);
      const roomData = response.data;
      
      console.log('✅ 회의실 데이터:', roomData);
      
      setRoom(roomData);
      setParticipants(roomData.participants || []);
      setIsHost(roomData.is_host);
      setMyStatus(roomData.participant_status);
      
      setError(null);
    } catch (err) {
      console.error('❌ 회의실 로드 실패:', err);
      setError('회의실을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (participantId) => {
    try {
      console.log('✅ 승인 시도:', participantId);
      
      await axios.post(`/video-meetings/${id}/approve_participant/`, {
        participant_id: participantId
      });
      
      console.log('✅ 승인 완료');
      
      // ✅ 즉시 데이터 갱신
      await fetchRoomData();
      
      // 대기 요청 목록에서 제거
      setPendingRequests(prev => prev.filter(p => p.id !== participantId));
      
      alert('참가자를 승인했습니다.');
    } catch (error) {
      console.error('❌ 승인 실패:', error);
      alert('승인에 실패했습니다.');
    }
  };

  const handleReject = async (participantId) => {
    try {
      console.log('❌ 거부 시도:', participantId);
      
      await axios.post(`/video-meetings/${id}/reject_participant/`, {
        participant_id: participantId
      });
      
      console.log('❌ 거부 완료');
      
      setPendingRequests(prev => prev.filter(p => p.id !== participantId));
      
      alert('참가 요청을 거부했습니다.');
    } catch (error) {
      console.error('❌ 거부 실패:', error);
      alert('거부에 실패했습니다.');
    }
  };

  const handleLeave = async () => {
    console.log('👋 회의 나가기 시작...');
    
    // ✅ 1. 먼저 미디어 스트림 완전히 종료
    cleanupMediaStream();

    // ✅ 2. 서버에 퇴장 알림
    if (isHost) {
      if (!window.confirm('회의를 종료하시겠습니까?')) {
        // 취소하면 다시 미디어 초기화하지 않음 (사용자가 나가기 취소)
        return;
      }
      
      try {
        await axios.post(`/video-meetings/${id}/end/`);
        console.log('✅ 회의 종료 요청 완료');
      } catch (error) {
        console.error('❌ 회의 종료 실패:', error);
      }
    } else {
      try {
        await axios.post(`/video-meetings/${id}/leave/`);
        console.log('✅ 퇴장 요청 완료');
      } catch (error) {
        console.error('❌ 퇴장 실패:', error);
      }
    }
    
    // ✅ 3. 페이지 이동
    navigate('/video-meetings');
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
        console.log('🎤 오디오:', !isAudioEnabled ? 'ON' : 'OFF');
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
        console.log('🎥 비디오:', !isVideoEnabled ? 'ON' : 'OFF');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-900">
        <div className="text-center">
          <Loader className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
          <p className="text-white">회의방 준비 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-900">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => navigate('/video-meetings')}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
          >
            목록으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // ✅ 참가자가 승인 대기 중
  if (!isHost && myStatus === 'pending') {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-900">
        <div className="text-center">
          <Loader className="w-12 h-12 text-yellow-400 animate-spin mx-auto mb-4" />
          <h2 className="text-white text-2xl font-bold mb-2">입장 대기 중</h2>
          <p className="text-gray-400 mb-4">방장의 승인을 기다리고 있습니다...</p>
          <p className="text-sm text-gray-500 mb-6">3초마다 자동으로 확인 중</p>
          <button
            onClick={handleLeave}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
          >
            나가기
          </button>
        </div>
      </div>
    );
  }

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
              className={`relative px-4 py-2 rounded-lg font-medium transition ${
                pendingRequests.length > 0
                  ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              <Bell className={`w-5 h-5 inline-block mr-2 ${
                pendingRequests.length > 0 ? 'animate-bounce' : ''
              }`} />
              참가 요청
              {pendingRequests.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-pulse">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 대기 요청 패널 */}
      {isHost && showPendingPanel && (
        <div className="bg-yellow-900 border-b border-yellow-700 px-6 py-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-white font-bold">참가 대기 중 ({pendingRequests.length})</h3>
            <button
              onClick={() => setShowPendingPanel(false)}
              className="text-yellow-300 hover:text-white"
            >
              ✕
            </button>
          </div>
          
          {pendingRequests.length === 0 ? (
            <p className="text-yellow-300 text-sm">대기 중인 요청이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="bg-yellow-800 rounded-lg p-3 flex justify-between items-center"
                >
                  <div className="text-white">
                    <p className="font-medium">{request.username}</p>
                    <p className="text-xs text-yellow-300">
                      {new Date(request.created_at).toLocaleString('ko-KR')}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleApprove(request.id)}
                      className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition text-sm flex items-center"
                    >
                      <UserCheck className="w-4 h-4 mr-1" />
                      승인
                    </button>
                    <button
                      onClick={() => handleReject(request.id)}
                      className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition text-sm flex items-center"
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

      {/* 비디오 그리드 */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 내 비디오 */}
          <div className="relative bg-gray-800 rounded-lg overflow-hidden border-2 border-blue-500 aspect-video">
            {isVideoEnabled && localStream ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover mirror"
              />
            ) : (
              <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                <VideoOff className="w-12 h-12 text-gray-400" />
              </div>
            )}
            <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 px-3 py-1 rounded">
              <span className="text-white text-sm font-medium">
                나 {isHost && "(방장)"}
              </span>
            </div>
            {/* 오디오 상태 표시 */}
            <div className="absolute top-4 right-4">
              {isAudioEnabled ? (
                <Mic className="w-5 h-5 text-white" />
              ) : (
                <MicOff className="w-5 h-5 text-red-500" />
              )}
            </div>
          </div>

          {/* 참가자 비디오 */}
          {participants
            .filter(p => p.status === 'approved')
            .map((participant) => (
              <div
                key={participant.id}
                className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video"
              >
                <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                  <Users className="w-16 h-16 text-gray-500 opacity-50" />
                </div>
                <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 px-3 py-1 rounded">
                  <span className="text-white text-sm">{participant.username}</span>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* 하단 컨트롤 바 */}
      <div className="bg-gray-800 border-t border-gray-700 px-6 py-4">
        <div className="flex justify-center items-center space-x-4">
          <button
            onClick={toggleAudio}
            className={`p-4 rounded-full transition ${
              isAudioEnabled 
                ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
            title={isAudioEnabled ? '음소거' : '음소거 해제'}
          >
            {isAudioEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </button>

          <button
            onClick={toggleVideo}
            className={`p-4 rounded-full transition ${
              isVideoEnabled 
                ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
            title={isVideoEnabled ? '비디오 끄기' : '비디오 켜기'}
          >
            {isVideoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
          </button>

          <button
            onClick={handleLeave}
            className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white transition"
            title={isHost ? "회의 종료" : "나가기"}
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default VideoMeetingRoom;

// CSS 스타일 (비디오 좌우 반전)
const styles = `
  <style>
    .mirror {
      transform: scaleX(-1);
    }
  </style>
`;

// 스타일을 head에 추가
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = '.mirror { transform: scaleX(-1); }';
  if (!document.querySelector('[data-video-mirror-style]')) {
    styleElement.setAttribute('data-video-mirror-style', 'true');
    document.head.appendChild(styleElement);
  }
}