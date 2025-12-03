import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import { Video, Plus, Users, Clock, User } from 'lucide-react';

function VideoMeetingList() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchRooms();
    
    // 3초마다 자동 새로고침
    const interval = setInterval(fetchRooms, 3000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchRooms = async () => {
    try {
      const response = await axios.get('/video-meetings/');
      console.log('📦 API Response:', response.data);
      
      const roomsData = response.data.results || response.data;
      
      if (Array.isArray(roomsData)) {
        setRooms(roomsData);
      } else {
        console.error('❌ Unexpected response format:', roomsData);
        setRooms([]);
      }
    } catch (error) {
      console.error('회의실 목록 로딩 실패:', error);
      setRooms([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = () => {
    setShowCreateModal(true);
  };

  const handleJoinRoom = async (room) => {
    console.log('🚪 입장 시도:', room.title, '방장 여부:', room.is_host);
    console.log('🔍 방 정보:', {
      id: room.id,
      is_host: room.is_host,
      participant_status: room.participant_status,
      participant_count: room.participant_count
    });
    
    if (room.is_host) {
      // 방장이면 바로 입장
      navigate(`/video-meetings/${room.id}`);
    } else {
      // 이미 참가 요청이 있거나 승인된 상태면 바로 입장
      if (room.participant_status === 'approved') {
        console.log('✅ 이미 승인됨 - 바로 입장');
        navigate(`/video-meetings/${room.id}`);
        return;
      }
      
      if (room.participant_status === 'pending') {
        console.log('⏳ 이미 대기중 - 대기 페이지로');
        navigate(`/video-meetings/${room.id}`);
        return;
      }
      
      // 참가자면 참가 요청
      try {
        console.log('📤 참가 요청 전송 중...', room.id);
        const response = await axios.post(`/video-meetings/${room.id}/join_request/`);
        console.log('✅ 참가 요청 성공:', response.data);
        console.log('📋 생성된 참가자 정보:', {
          id: response.data.id,
          status: response.data.status,
          user: response.data.user,
          username: response.data.username
        });
        
        alert('참가 요청이 전송되었습니다. 방장의 승인을 기다려주세요.');
        
        // 대기 페이지로 이동
        navigate(`/video-meetings/${room.id}`);
      } catch (error) {
        console.error('❌ 참가 요청 실패:', error);
        console.error('❌ 에러 상세:', error.response?.data);
        
        if (error.response?.status === 400) {
          const message = error.response.data?.detail || '참가 요청 실패';
          alert(message);
          
          // 이미 승인됐거나 대기중이면 입장 페이지로 이동
          if (message.includes('승인') || message.includes('대기')) {
            navigate(`/video-meetings/${room.id}`);
          }
        } else {
          alert('참가 요청에 실패했습니다: ' + (error.response?.data?.detail || error.message));
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl text-white font-bold mb-1 flex items-center">
                <Video className="w-8 h-8 mr-3" />
                화상회의
              </h1>
              <p className="text-slate-300 text-sm">
                회원님과 함께하는 온라인 화상회의
              </p>
            </div>
            
            <button
              onClick={handleCreateRoom}
              className="inline-flex items-center px-4 py-2 bg-white text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition text-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              새 회의 만들기
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 회의실 목록 */}
        {rooms.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-lg border border-gray-200">
            <Video className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-500 text-lg">진행 중인 회의가 없습니다</p>
            <p className="text-gray-400 text-sm mt-2">새 회의를 만들어보세요</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="bg-white rounded-lg shadow-sm hover:shadow-md transition overflow-hidden border border-gray-200"
              >
                {/* 카드 헤더 */}
                <div className={`p-4 ${
                  room.status === 'active' 
                    ? 'bg-gradient-to-r from-green-50 to-emerald-50' 
                    : room.status === 'waiting'
                    ? 'bg-gradient-to-r from-blue-50 to-indigo-50'
                    : 'bg-gray-50'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                      room.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : room.status === 'waiting'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-200 text-gray-700'
                    }`}>
                      {room.status === 'active' ? '진행중' : room.status === 'waiting' ? '대기중' : '종료됨'}
                    </span>
                    
                    {room.is_host && (
                      <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs font-medium">
                        방장
                      </span>
                    )}
                  </div>
                  
                  <h3 className="text-lg font-bold text-gray-900 line-clamp-2">
                    {room.title}
                  </h3>
                </div>

                {/* 카드 본문 */}
                <div className="p-4 space-y-3">
                  {room.description && (
                    <p className="text-gray-600 text-sm line-clamp-2">
                      {room.description}
                    </p>
                  )}
                  
                  <div className="space-y-2">
                    <div className="flex items-center text-gray-600 text-sm">
                      <User className="w-4 h-4 mr-2 text-gray-400" />
                      <span>방장: {room.host_username}</span>
                    </div>
                    
                    <div className="flex items-center text-gray-600 text-sm">
                      <Users className="w-4 h-4 mr-2 text-gray-400" />
                      <span>참가자: {room.participant_count} / {room.max_participants}</span>
                    </div>
                    
                    {room.scheduled_time && (
                      <div className="flex items-center text-gray-600 text-sm">
                        <Clock className="w-4 h-4 mr-2 text-gray-400" />
                        <span>
                          {new Date(room.scheduled_time).toLocaleString('ko-KR')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 카드 하단 */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                  <button
                    onClick={() => handleJoinRoom(room)}
                    className={`w-full py-2 rounded-lg font-medium text-sm transition ${
                      room.status === 'active'
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : room.status === 'waiting'
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-300 text-gray-600 cursor-not-allowed'
                    }`}
                    disabled={room.status === 'ended'}
                  >
                    {room.is_host 
                      ? '입장하기' 
                      : room.participant_status === 'approved'
                      ? '입장하기'
                      : room.participant_status === 'pending'
                      ? '승인 대기중'
                      : '참가 요청'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 회의 생성 모달 */}
      {showCreateModal && (
        <CreateRoomModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchRooms();
          }}
        />
      )}
    </div>
  );
}

function CreateRoomModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    max_participants: 10,
    password: '',
    scheduled_time: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      setError('회의 제목을 입력해주세요.');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      
      await axios.post('/video-meetings/', {
        title: formData.title.trim(),
        description: formData.description.trim(),
        max_participants: formData.max_participants,
        password: formData.password.trim(),
        scheduled_time: formData.scheduled_time || null
      });
      
      onSuccess();
    } catch (error) {
      console.error('회의 생성 실패:', error);
      setError(error.response?.data?.detail || '회의 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-xl font-bold mb-4">새 회의 만들기</h2>
        
        {error && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-3 rounded">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              회의 제목 *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent"
              placeholder="회의 제목을 입력하세요"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              설명
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent"
              placeholder="회의에 대한 설명 (선택사항)"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              최대 참가자 수
            </label>
            <input
              type="number"
              value={formData.max_participants}
              onChange={(e) => setFormData({...formData, max_participants: parseInt(e.target.value)})}
              min="2"
              max="50"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition"
            >
              {loading ? '생성 중...' : '회의 만들기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default VideoMeetingList;