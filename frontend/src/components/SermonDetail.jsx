// frontend/src/components/SermonDetail.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import { 
  Play, Pause, Volume2, VolumeX, Download, 
  Calendar, User, BookOpen, Eye, ArrowLeft,
  FileText, Edit, Trash2, SkipBack, SkipForward
} from 'lucide-react';

function SermonDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.is_staff || user?.is_superuser;

  const [sermon, setSermon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 오디오 플레이어 상태
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);

  useEffect(() => {
    fetchSermon();
  }, [id]);

  // 키보드 이벤트 리스너
  useEffect(() => {
    const handleKeyPress = (e) => {
      // input이나 textarea에서는 동작하지 않도록
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      switch(e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skipTime(-5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          skipTime(5);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isPlaying, currentTime]);

  const fetchSermon = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/sermons/${id}/`);
      setSermon(response.data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('설교를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;

    try {
      await axios.delete(`/sermons/${id}/`);
      alert('설교가 삭제되었습니다.');
      navigate('/sermons');
    } catch (err) {
      console.error(err);
      alert('삭제에 실패했습니다.');
    }
  };

  // 오디오 플레이어 핸들러
  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!isSeeking) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    setDuration(audioRef.current.duration);
  };

  const handleSeek = (e) => {
    const seekTime = (e.target.value / 100) * duration;
    if (!isNaN(seekTime) && isFinite(seekTime)) {
      audioRef.current.currentTime = seekTime;
      setCurrentTime(seekTime);
    }
  };

  const handleSeekStart = () => {
    setIsSeeking(true);
  };

  const handleSeekEnd = (e) => {
    setIsSeeking(false);
    handleSeek(e);
  };

  const skipTime = (seconds) => {
    if (audioRef.current) {
      const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleVolumeChange = (e) => {
    const newVolume = e.target.value / 100;
    audioRef.current.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    if (isMuted) {
      audioRef.current.volume = volume;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !sermon) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
          <p className="text-red-700">{error || '설교를 찾을 수 없습니다.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* 뒤로가기 */}
      <Link 
        to="/sermons" 
        className="inline-flex items-center text-gray-600 hover:text-indigo-600 mb-6 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
        <span className="font-medium">목록으로</span>
      </Link>

      {/* 설교 정보 */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
        {/* 헤더 */}
        <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-slate-700 p-8 text-white">
          <div className="flex justify-between items-start mb-6">
            <span className="inline-block bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full text-sm font-medium">
              {sermon.category_display}
            </span>
            
            {isAdmin && (
              <div className="flex space-x-2">
                <button
                  onClick={() => navigate(`/sermons/edit/${id}`)}
                  className="p-2.5 bg-white/10 backdrop-blur-sm rounded-lg hover:bg-white/20 transition-all"
                >
                  <Edit className="w-5 h-5" />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-2.5 bg-red-500/80 backdrop-blur-sm rounded-lg hover:bg-red-600 transition-all"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          <h3 className="text-2xl text-yellow-200 font-bold mb-6 leading-tight">{sermon.title}</h3>

          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg">
              <User className="w-5 h-5 mr-2" />
              <span className="font-medium">{sermon.preacher}</span>
            </div>
            <div className="flex items-center bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg">
              <BookOpen className="w-5 h-5 mr-2" />
              <span className="font-semibold">{sermon.bible_reference}</span>
            </div>
            <div className="flex items-center bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg">
              <Calendar className="w-5 h-5 mr-2" />
              <span>
                {new Date(sermon.sermon_date).toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </span>
            </div>
            <div className="flex items-center bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg">
              <Eye className="w-5 h-5 mr-2" />
              <span>{sermon.view_count} 조회</span>
            </div>
          </div>
        </div>

        {/* 오디오 플레이어 */}
        {sermon.audio_url && (
          <div className="p-8 bg-gradient-to-br from-gray-50 to-gray-100 border-b border-gray-200">
            <audio
              ref={audioRef}
              src={sermon.audio_url}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={() => setIsPlaying(false)}
            />

            <div className="space-y-6">
              {/* 재생 컨트롤 */}
              <div className="flex items-center justify-center space-x-6">
                <button
                  onClick={() => skipTime(-5)}
                  className="p-3 bg-white rounded-full shadow-md hover:shadow-lg hover:scale-105 transition-all text-gray-700"
                  title="5초 뒤로 (←)"
                >
                  <SkipBack className="w-5 h-5" />
                </button>

                <button
                  onClick={togglePlay}
                  className="w-20 h-20 bg-gradient-to-br from-sky-700 to-cyan-800 hover:from-sky-800 hover:to-blue-800 rounded-full flex items-center justify-center text-white shadow-xl hover:shadow-2xl hover:scale-105 transition-all"
                  title="재생/일시정지 (Space)"
                >
                  {isPlaying ? (
                    <Pause className="w-10 h-10" />
                  ) : (
                    <Play className="w-10 h-10 ml-1" />
                  )}
                </button>

                <button
                  onClick={() => skipTime(5)}
                  className="p-3 bg-white rounded-full shadow-md hover:shadow-lg hover:scale-105 transition-all text-gray-700"
                  title="5초 앞으로 (→)"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

              {/* 진행 바 */}
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="0.1"
                    value={(currentTime / duration) * 100 || 0}
                    onChange={handleSeek}
                    onMouseDown={handleSeekStart}
                    onMouseUp={handleSeekEnd}
                    onTouchStart={handleSeekStart}
                    onTouchEnd={handleSeekEnd}
                    className="w-full h-3 bg-gray-300 rounded-full appearance-none cursor-pointer slider"
                    style={{
                      background: `linear-gradient(to right, #4f46e5 0%, #4f46e5 ${(currentTime / duration) * 100}%, #d1d5db ${(currentTime / duration) * 100}%, #d1d5db 100%)`
                    }}
                  />
                </div>
                <div className="flex justify-between text-sm text-gray-600 font-medium">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* 볼륨 컨트롤 */}
              <div className="flex items-center justify-center space-x-4 bg-white rounded-xl p-4 shadow-sm">
                <button onClick={toggleMute} className="text-gray-600 hover:text-indigo-600 transition-colors">
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume * 100}
                  onChange={handleVolumeChange}
                  className="w-32 h-2 bg-gray-200 rounded-full appearance-none cursor-pointer"
                />
              </div>

              {/* 키보드 단축키 안내 */}
              <div className="text-center text-sm text-gray-500 bg-white/50 rounded-lg p-3">
                <span className="font-medium">키보드 단축키:</span> 
                <span className="mx-2">Space (재생/정지)</span>
                <span className="mx-2">← (5초 뒤로)</span>
                <span className="mx-2">→ (5초 앞으로)</span>
              </div>
            </div>
          </div>
        )}

        {/* 설교 내용 */}
        <div className="p-8">
          {sermon.description && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                <span className="w-1 h-6 bg-indigo-600 rounded-full mr-3"></span>
                설교 요약
              </h2>
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed text-lg">
                {sermon.description}
              </p>
            </div>
          )}

          {/* 다운로드 섹션 */}
          <div className="border-t pt-8">
            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-1 h-6 bg-indigo-600 rounded-full mr-3"></span>
              자료 다운로드
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {sermon.audio_url && (
                <a
                  href={sermon.audio_url}
                  download
                  className="group flex items-center justify-center px-6 py-4 bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-700 rounded-xl hover:from-indigo-100 hover:to-indigo-200 transition-all shadow-sm hover:shadow-md"
                >
                  <Download className="w-5 h-5 mr-2 group-hover:animate-bounce" />
                  <span className="font-medium">오디오 다운로드</span>
                </a>
              )}
              
              {sermon.original_pdf_url && (
                <a
                  href={sermon.original_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-center px-6 py-4 bg-gradient-to-br from-gray-50 to-gray-100 text-gray-700 rounded-xl hover:from-gray-100 hover:to-gray-200 transition-all shadow-sm hover:shadow-md"
                >
                  <FileText className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                  <span className="font-medium">원본 PDF 보기</span>
                </a>
              )}
              
              {sermon.translated_pdf_url && (
                <a
                  href={sermon.translated_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-center px-6 py-4 bg-gradient-to-br from-green-50 to-green-100 text-green-700 rounded-xl hover:from-green-100 hover:to-green-200 transition-all shadow-sm hover:shadow-md"
                >
                  <FileText className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                  <span className="font-medium">번역 PDF 보기</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CSS 스타일 */}
      <style>{`
        .slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #4f46e5;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: all 0.2s ease;
        }

        .slider::-webkit-slider-thumb:hover {
          width: 24px;
          height: 24px;
          background: #4338ca;
          box-shadow: 0 4px 8px rgba(79, 70, 229, 0.4);
        }

        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border: none;
          border-radius: 50%;
          background: #4f46e5;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: all 0.2s ease;
        }

        .slider::-moz-range-thumb:hover {
          width: 24px;
          height: 24px;
          background: #4338ca;
          box-shadow: 0 4px 8px rgba(79, 70, 229, 0.4);
        }
      `}</style>
    </div>
  );
}

export default SermonDetail;



