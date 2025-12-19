// frontend/src/components/VideoMeetingList.jsx (네비게이션 버그 수정)
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Video, 
  Plus, 
  Users, 
  Clock, 
  Calendar,
  Loader,
  AlertCircle,
  LogIn,
  RefreshCw,
  XCircle,
  MoreVertical
} from 'lucide-react';
import axios from '../api/axios';
import { useAuth } from '../contexts/AuthContext';

function VideoMeetingList() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [newRoom, setNewRoom] = useState({
    title: '',
    description: '',
    max_participants: 10,
    password: '',
    scheduled_time: ''
  });

  // =========================================================================
  // API 함수들
  // =========================================================================

  const fetchRooms = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      
      setError(null);
      
      const response = await axios.get('/video-meetings/');
      console.log('📋 API 응답:', response.data);
      
      let roomsData;
      if (Array.isArray(response.data)) {
        roomsData = response.data;
      } else if (response.data.results && Array.isArray(response.data.results)) {
        roomsData = response.data.results;
      } else {
        console.error('❌ 예상치 못한 응답 형태:', response.data);
        roomsData = [];
      }
      
      console.log('📋 회의실 목록:', roomsData.length, '개');
      
      setRooms(prevRooms => {
        const isDifferent = JSON.stringify(prevRooms) !== JSON.stringify(roomsData);
        if (isDifferent) {
          console.log('🔄 회의실 목록 업데이트됨');
          return roomsData;
        }
        console.log('✅ 변경사항 없음 - 업데이트 생략');
        return prevRooms;
      });
    } catch (err) {
      console.error('❌ 회의실 목록 로딩 실패:', err);
      setError('회의실 목록을 불러올 수 없습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const createRoom = async () => {
    if (!newRoom.title.trim()) {
      alert('회의실 제목을 입력해주세요.');
      return;
    }

    try {
      setCreatingRoom(true);
      
      const requestData = {
        title: newRoom.title.trim(),
        max_participants: parseInt(newRoom.max_participants) || 10,
      };

      if (newRoom.description && newRoom.description.trim()) {
        requestData.description = newRoom.description.trim();
      }

      if (newRoom.password && newRoom.password.trim()) {
        requestData.password = newRoom.password.trim();
      }

      if (newRoom.scheduled_time) {
        requestData.scheduled_time = newRoom.scheduled_time;
      }

      console.log('📤 회의실 생성 요청:', requestData);

      const response = await axios.post('/video-meetings/', requestData);

      console.log('✅ 회의실 생성 응답:', response.data);
      
      // ⭐⭐⭐ 버그 수정: response.data에서 id 추출
      const roomId = response.data.id;
      
      if (!roomId || roomId === 'undefined') {
        console.error('❌ 유효하지 않은 roomId:', roomId);
        alert('회의실이 생성되었지만 입장할 수 없습니다. 목록에서 다시 시도해주세요.');
        setShowCreateModal(false);
        await fetchRooms(true);
        return;
      }
      
      console.log(`✅ 회의실 생성 완료: ${roomId}`);
      console.log(`🚀 이동: /video-meetings/${roomId}`);
      
      // 모달 닫기
      setShowCreateModal(false);
      
      // 회의실로 이동
      navigate(`/video-meetings/${roomId}`);
      
    } catch (err) {
      console.error('❌ 회의실 생성 실패:', err);
      
      if (err.response?.data) {
        const errorMessages = Object.entries(err.response.data)
          .map(([field, messages]) => {
            if (Array.isArray(messages)) {
              return `${field}: ${messages.join(', ')}`;
            }
            return `${field}: ${messages}`;
          })
          .join('\n');
        
        console.error('📋 에러 상세:', err.response.data);
        alert(`회의실 생성 실패:\n${errorMessages}`);
      } else {
        alert('회의실 생성에 실패했습니다.');
      }
    } finally {
      setCreatingRoom(false);
    }
  };

  const joinRoom = async (roomId, participantStatus) => {
    // ⭐⭐⭐ roomId 검증 추가
    if (!roomId || roomId === 'undefined') {
      console.error('❌ 유효하지 않은 roomId:', roomId);
      alert('회의실 정보가 올바르지 않습니다.');
      return;
    }

    try {
      if (participantStatus === 'approved') {
        console.log('✅ 승인된 상태 - 즉시 입장');
        navigate(`/video-meetings/${roomId}`);
        return;
      }

      if (participantStatus === 'pending') {
        console.log('⏳ 대기 중 - 대기 화면으로 이동');
        navigate(`/video-meetings/${roomId}`);
        return;
      }

      console.log('📢 참가 요청:', roomId);
      
      const response = await axios.post(`/video-meetings/${roomId}/join_request/`);
      console.log('✅ 참가 요청 완료:', response.data);
      
      console.log(`🚀 회의실 페이지로 이동: /video-meetings/${roomId}`);
      navigate(`/video-meetings/${roomId}`);
      
    } catch (err) {
      console.error('❌ 참가 요청 실패:', err);
      
      if (err.response?.data?.detail) {
        alert(err.response.data.detail);
      } else {
        alert('참가 요청에 실패했습니다.');
      }
    }
  };

  const endMeeting = async (roomId, roomTitle) => {
    const confirmEnd = window.confirm(
      `"${roomTitle}" 회의를 종료하시겠습니까?\n\n모든 참가자가 자동으로 퇴장됩니다.`
    );

    if (!confirmEnd) return;

    try {
      console.log('🛑 회의 종료 요청:', roomId);
      
      await axios.post(`/video-meetings/${roomId}/end/`);
      
      console.log('✅ 회의 종료 완료');
      alert('회의가 종료되었습니다.');
      
      await fetchRooms(true);
    } catch (err) {
      console.error('❌ 회의 종료 실패:', err);
      
      if (err.response?.data?.detail) {
        alert(err.response.data.detail);
      } else {
        alert('회의 종료에 실패했습니다.');
      }
    }
  };

  // =========================================================================
  // Effects
  // =========================================================================

  useEffect(() => {
    console.log('🚀 VideoMeetingList 마운트 - 초기 로딩');
    fetchRooms(false);
  }, []);

  // =========================================================================
  // Handlers
  // =========================================================================

  const handleCreateRoom = () => {
    setShowCreateModal(true);
    setNewRoom({
      title: '',
      description: '',
      max_participants: 10,
      password: '',
      scheduled_time: ''
    });
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setNewRoom({
      title: '',
      description: '',
      max_participants: 10,
      password: '',
      scheduled_time: ''
    });
  };

  const handleSubmitCreate = (e) => {
    e.preventDefault();
    createRoom();
  };

  const handleRefresh = () => {
    console.log('🔄 수동 새로고침 요청');
    fetchRooms(true);
  };

  // =========================================================================
  // Render
  // =========================================================================

  if (loading && rooms.length === 0) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <Loader className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <Video className="w-8 h-8 mr-3 text-blue-600" />
                화상 회의
              </h1>
              <p className="text-gray-600 mt-2">
                온라인 화상 회의를 생성하고 참가하세요
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                title="회의실 목록 새로고침"
              >
                <RefreshCw className={`w-5 h-5 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? '새로고침 중...' : '새로고침'}
              </button>

              <button
                onClick={handleCreateRoom}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center font-medium shadow-sm"
              >
                <Plus className="w-5 h-5 mr-2" />
                회의실 생성
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded flex items-start">
              <AlertCircle className="w-5 h-5 text-red-500 mr-3 mt-0.5" />
              <div>
                <p className="text-red-800 font-medium">오류</p>
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          )}
        </div>

        {!Array.isArray(rooms) || rooms.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Video className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              진행 중인 회의가 없습니다
            </h3>
            <p className="text-gray-600 mb-6">
              새로운 회의실을 생성하거나 초대받은 회의에 참가하세요
            </p>
            <button
              onClick={handleCreateRoom}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition inline-flex items-center font-medium"
            >
              <Plus className="w-5 h-5 mr-2" />
              첫 회의실 만들기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                currentUser={user}
                onJoin={joinRoom}
                onEnd={endMeeting}
              />
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateRoomModal
          newRoom={newRoom}
          setNewRoom={setNewRoom}
          onSubmit={handleSubmitCreate}
          onClose={handleCloseModal}
          creating={creatingRoom}
        />
      )}
    </div>
  );
}

function RoomCard({ room, currentUser, onJoin, onEnd }) {
  const [showMenu, setShowMenu] = useState(false);

  const getStatusBadge = () => {
    if (room.is_host) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
          방장
        </span>
      );
    }

    switch (room.participant_status) {
      case 'approved':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            참가 중
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            승인 대기
          </span>
        );
      default:
        return null;
    }
  };

  const getButtonText = () => {
    if (room.is_host || room.participant_status === 'approved') {
      return '입장하기';
    }
    if (room.participant_status === 'pending') {
      return '대기 화면';
    }
    return '참가 요청';
  };

  const getButtonIcon = () => {
    if (room.is_host || room.participant_status === 'approved') {
      return <LogIn className="w-4 h-4 mr-1.5" />;
    }
    return <Users className="w-4 h-4 mr-1.5" />;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm hover:shadow-md transition border border-gray-200 overflow-hidden">
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-1 line-clamp-1">
              {room.title}
            </h3>
            <p className="text-sm text-gray-600">
              방장: {room.host_username}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            
            {room.is_host && (
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>

                {showMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-10"
                      onClick={() => setShowMenu(false)}
                    />
                    
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          onEnd(room.id, room.title);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition flex items-center"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        회의 종료
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {room.description && (
          <p className="text-sm text-gray-600 mb-4 line-clamp-2">
            {room.description}
          </p>
        )}

        <div className="space-y-2 mb-4">
          <div className="flex items-center text-sm text-gray-600">
            <Users className="w-4 h-4 mr-2 text-gray-400" />
            <span>
              {room.participant_count} / {room.max_participants}명
            </span>
          </div>

          {room.scheduled_time && (
            <div className="flex items-center text-sm text-gray-600">
              <Calendar className="w-4 h-4 mr-2 text-gray-400" />
              <span>
                {new Date(room.scheduled_time).toLocaleString('ko-KR')}
              </span>
            </div>
          )}

          {room.started_at && (
            <div className="flex items-center text-sm text-gray-600">
              <Clock className="w-4 h-4 mr-2 text-gray-400" />
              <span>
                {new Date(room.started_at).toLocaleTimeString('ko-KR')} 시작
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => onJoin(room.id, room.participant_status)}
          className={`w-full py-2.5 rounded-lg font-medium transition flex items-center justify-center ${
            room.is_host || room.participant_status === 'approved'
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : room.participant_status === 'pending'
              ? 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          {getButtonIcon()}
          {getButtonText()}
        </button>
      </div>

      <div className={`px-6 py-2 text-xs font-medium ${
        room.status === 'active'
          ? 'bg-green-50 text-green-700'
          : room.status === 'ended'
          ? 'bg-gray-50 text-gray-500'
          : 'bg-gray-50 text-gray-600'
      }`}>
        {room.status === 'active' 
          ? '● 진행 중' 
          : room.status === 'ended'
          ? '○ 종료됨'
          : '○ 대기 중'
        }
      </div>
    </div>
  );
}

function CreateRoomModal({ newRoom, setNewRoom, onSubmit, onClose, creating }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          새 회의실 만들기
        </h2>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              회의실 제목 *
            </label>
            <input
              type="text"
              value={newRoom.title}
              onChange={(e) => setNewRoom({ ...newRoom, title: e.target.value })}
              placeholder="예: 주간 팀 회의"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              설명 (선택)
            </label>
            <textarea
              value={newRoom.description}
              onChange={(e) => setNewRoom({ ...newRoom, description: e.target.value })}
              placeholder="회의에 대한 간단한 설명을 입력하세요"
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              최대 참가자 수
            </label>
            <input
              type="number"
              value={newRoom.max_participants}
              onChange={(e) => setNewRoom({ ...newRoom, max_participants: parseInt(e.target.value) })}
              min={2}
              max={50}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              예약 시간 (선택)
            </label>
            <input
              type="datetime-local"
              value={newRoom.scheduled_time}
              onChange={(e) => setNewRoom({ ...newRoom, scheduled_time: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={creating}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={creating || !newRoom.title.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {creating ? (
                <>
                  <Loader className="w-5 h-5 mr-2 animate-spin" />
                  생성 중...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5 mr-2" />
                  생성하기
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default VideoMeetingList;