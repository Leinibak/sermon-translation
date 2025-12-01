// frontend/src/components/SermonDetail.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import { 
  Play, Pause, Volume2, VolumeX, Download, 
  Calendar, User, BookOpen, Eye, ArrowLeft,
  Edit, Trash2, SkipBack, SkipForward,
  ExternalLink, Music, Languages
} from 'lucide-react';

function SermonDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.is_staff || user?.is_superuser;

  const [sermon, setSermon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ✅ 현재 재생 중인 오디오 타입 상태 추가 ('original' 또는 'translation')
  const [currentAudioType, setCurrentAudioType] = useState('translation');

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

  // ✅ 오디오 소스가 변경될 때 처리
  useEffect(() => {
    if (audioRef.current && sermon) {
      const audioUrl = currentAudioType === 'original' 
        ? sermon.original_audio_url 
        : sermon.audio_url;
      
      if (audioUrl) {
        audioRef.current.src = audioUrl;
        audioRef.current.load();
        if (isPlaying) {
          audioRef.current.play();
        }
      }
    }
  }, [currentAudioType, sermon]);

  // 키보드 이벤트 리스너
  useEffect(() => {
    const handleKeyPress = (e) => {
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

  const handlePdfView = (url, type) => {
    if (!url) {
      alert(`${type} PDF 파일이 없습니다.`);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
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

  // ✅ 오디오 타입 전환
  const switchAudioType = (type) => {
    if (currentAudioType !== type) {
      const wasPlaying = isPlaying;
      setIsPlaying(false);
      setCurrentTime(0);
      setCurrentAudioType(type);
      
      // 잠시 후 자동 재생 (선택사항)
      if (wasPlaying) {
        setTimeout(() => {
          audioRef.current?.play();
          setIsPlaying(true);
        }, 100);
      }
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600"></div>
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

  // ✅ 현재 재생 중인 오디오 URL
  const currentAudioUrl = currentAudioType === 'original' 
    ? sermon.original_audio_url 
    : sermon.audio_url;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* 뒤로가기 */}
      <Link 
        to="/sermons" 
        className="inline-flex items-center text-gray-600 hover:text-slate-700 mb-4 transition-colors group text-sm"
      >
        <ArrowLeft className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" />
        <span className="font-medium">목록으로</span>
      </Link>

      {/* 설교 정보 */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 p-5 text-white">
          <div className="flex justify-between items-start mb-3">
            <span className="inline-block bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium">
              {sermon.category_display}
            </span>
            
            {isAdmin && (
              <div className="flex space-x-2">
                <button
                  onClick={() => navigate(`/sermons/edit/${id}`)}
                  className="p-1.5 bg-white/10 backdrop-blur-sm rounded-lg hover:bg-white/20 transition-all"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-1.5 bg-red-500/80 backdrop-blur-sm rounded-lg hover:bg-red-600 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <h3 className="text-xl font-bold mb-4 leading-tight">{sermon.title}</h3>

          <div className="flex flex-wrap gap-3 text-xs">
            <div className="flex items-center bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <User className="w-4 h-4 mr-1.5" />
              <span className="font-medium">{sermon.preacher}</span>
            </div>
            <div className="flex items-center bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <BookOpen className="w-4 h-4 mr-1.5" />
              <span className="font-semibold">{sermon.bible_reference}</span>
            </div>
            <div className="flex items-center bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <Calendar className="w-4 h-4 mr-1.5" />
              <span>
                {new Date(sermon.sermon_date).toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </span>
            </div>
            <div className="flex items-center bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <Eye className="w-4 h-4 mr-1.5" />
              <span>{sermon.view_count} 조회</span>
            </div>
          </div>
        </div>

        {/* ✅ 오디오 플레이어 - 원본/통역 선택 추가 */}
        {(sermon.original_audio_url || sermon.audio_url) && (
          <div className="p-5 bg-gradient-to-br from-gray-50 to-gray-100 border-b border-gray-200">
            <audio
              ref={audioRef}
              src={currentAudioUrl}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={() => setIsPlaying(false)}
            />

            {/* ✅ 오디오 타입 선택 버튼 */}
            {sermon.original_audio_url && sermon.audio_url && (
              <div className="flex justify-center space-x-3 mb-4">
                <button
                  onClick={() => switchAudioType('original')}
                  className={`flex items-center px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    currentAudioType === 'original'
                      ? 'bg-slate-700 text-white shadow-md'
                      : 'bg-white text-slate-700 border border-slate-300 hover:border-slate-400'
                  }`}
                >
                  <Music className="w-4 h-4 mr-2" />
                  원본 설교 (독일어)
                </button>
                <button
                  onClick={() => switchAudioType('translation')}
                  className={`flex items-center px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    currentAudioType === 'translation'
                      ? 'bg-slate-700 text-white shadow-md'
                      : 'bg-white text-slate-700 border border-slate-300 hover:border-slate-400'
                  }`}
                >
                  <Languages className="w-4 h-4 mr-2" />
                  통역 설교 (한국어)
                </button>
              </div>
            )}

            <div className="space-y-4">
              {/* 재생 컨트롤 */}
              <div className="flex items-center justify-center space-x-4">
                <button
                  onClick={() => skipTime(-5)}
                  className="p-2 bg-white rounded-full shadow-sm hover:shadow-md hover:scale-105 transition-all text-gray-700"
                  title="5초 뒤로 (←)"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  onClick={togglePlay}
                  className="w-14 h-14 bg-gradient-to-br from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 rounded-full flex items-center justify-center text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                  title="재생/일시정지 (Space)"
                >
                  {isPlaying ? (
                    <Pause className="w-7 h-7" />
                  ) : (
                    <Play className="w-7 h-7 ml-0.5" />
                  )}
                </button>

                <button
                  onClick={() => skipTime(5)}
                  className="p-2 bg-white rounded-full shadow-sm hover:shadow-md hover:scale-105 transition-all text-gray-700"
                  title="5초 앞으로 (→)"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              {/* 진행 바 */}
              <div className="space-y-2">
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
                    className="w-full h-2 bg-gray-300 rounded-full appearance-none cursor-pointer slider"
                    style={{
                      background: `linear-gradient(to right, #475569 0%, #475569 ${(currentTime / duration) * 100}%, #d1d5db ${(currentTime / duration) * 100}%, #d1d5db 100%)`
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-600 font-medium">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* 볼륨 컨트롤 */}
              <div className="flex items-center justify-center space-x-3 bg-white rounded-lg p-3 shadow-sm">
                <button onClick={toggleMute} className="text-gray-600 hover:text-slate-700 transition-colors">
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume * 100}
                  onChange={handleVolumeChange}
                  className="w-24 h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer"
                />
              </div>

              {/* 키보드 단축키 안내 */}
              <div className="text-center text-xs text-gray-500 bg-white/50 rounded-lg p-2">
                <span className="font-medium">키보드 단축키:</span> 
                <span className="mx-1">Space (재생/정지)</span>
                <span className="mx-1">← (5초 뒤로)</span>
                <span className="mx-1">→ (5초 앞으로)</span>
              </div>
            </div>
          </div>
        )}

        {/* 설교 내용 */}
        <div className="p-6">
          {sermon.description && (
            <div className="mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
                <span className="w-1 h-5 bg-slate-600 rounded-full mr-2"></span>
                설교 요약
              </h2>
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed text-sm">
                {sermon.description}
              </p>
            </div>
          )}

          {/* ✅ 다운로드 섹션 - 버튼 이름 개선 */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
              <span className="w-1 h-5 bg-slate-600 rounded-full mr-2"></span>
              자료 다운로드
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* ✅ 원본 설교 오디오 */}
              {sermon.original_audio_url && (
                <a
                  href={sermon.original_audio_url}
                  download
                  className="group flex items-center justify-center px-4 py-3 bg-gradient-to-br from-amber-50 to-amber-100 text-amber-800 rounded-lg hover:from-amber-100 hover:to-amber-200 transition-all shadow-sm hover:shadow-md text-sm border border-amber-200"
                >
                  <Download className="w-4 h-4 mr-2 group-hover:animate-bounce" />
                  <div className="text-left">
                    <div className="font-semibold">원본 설교 오디오</div>
                    <div className="text-xs opacity-75">(독일어)</div>
                  </div>
                </a>
              )}
              
              {/* ✅ 통역 설교 오디오 */}
              {sermon.audio_url && (
                <a
                  href={sermon.audio_url}
                  download
                  className="group flex items-center justify-center px-4 py-3 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-700 rounded-lg hover:from-slate-100 hover:to-slate-200 transition-all shadow-sm hover:shadow-md text-sm border border-slate-200"
                >
                  <Download className="w-4 h-4 mr-2 group-hover:animate-bounce" />
                  <div className="text-left">
                    <div className="font-semibold">통역 설교 오디오</div>
                    <div className="text-xs opacity-75">(한국어)</div>
                  </div>
                </a>
              )}
              
              {/* ✅ 원본 PDF */}
              {sermon.original_pdf_url && (
                <button
                  onClick={() => handlePdfView(sermon.original_pdf_url, '원본')}
                  className="group flex items-center justify-center px-4 py-3 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 rounded-lg hover:from-blue-100 hover:to-blue-200 transition-all shadow-sm hover:shadow-md text-sm border border-blue-200"
                >
                  <ExternalLink className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
                  <div className="text-left">
                    <div className="font-semibold">원본 설교자료</div>
                    <div className="text-xs opacity-75">(독일어 PDF)</div>
                  </div>
                </button>
              )}
              
              {/* ✅ 번역 PDF */}
              {sermon.translated_pdf_url && (
                <button
                  onClick={() => handlePdfView(sermon.translated_pdf_url, '번역')}
                  className="group flex items-center justify-center px-4 py-3 bg-gradient-to-br from-green-50 to-green-100 text-green-700 rounded-lg hover:from-green-100 hover:to-green-200 transition-all shadow-sm hover:shadow-md text-sm border border-green-200"
                >
                  <ExternalLink className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
                  <div className="text-left">
                    <div className="font-semibold">번역 설교자료</div>
                    <div className="text-xs opacity-75">(한국어 PDF)</div>
                  </div>
                </button>
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
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #475569;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: all 0.2s ease;
        }

        .slider::-webkit-slider-thumb:hover {
          width: 18px;
          height: 18px;
          background: #334155;
          box-shadow: 0 4px 8px rgba(71, 85, 105, 0.4);
        }

        .slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border: none;
          border-radius: 50%;
          background: #475569;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: all 0.2s ease;
        }

        .slider::-moz-range-thumb:hover {
          width: 18px;
          height: 18px;
          background: #334155;
          box-shadow: 0 4px 8px rgba(71, 85, 105, 0.4);
        }
      `}</style>
    </div>
  );
}

export default SermonDetail;