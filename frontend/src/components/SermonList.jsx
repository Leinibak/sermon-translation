// frontend/src/components/SermonList.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import { Search, ChevronLeft, ChevronRight, Calendar, User, BookOpen, Play, Upload } from 'lucide-react';

// 카테고리별 설교 캐러셀 컴포넌트
function SermonCarousel({ sermons, title, navigate }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    checkScroll();
  }, [sermons]);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = 400;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
      setTimeout(checkScroll, 300);
    }
  };

  if (!sermons || sermons.length === 0) return null;

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className={`p-1.5 rounded-full ${
              canScrollLeft 
                ? 'bg-slate-700 text-white hover:bg-slate-800' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            } transition`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className={`p-1.5 rounded-full ${
              canScrollRight 
                ? 'bg-slate-700 text-white hover:bg-slate-800' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            } transition`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div 
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex overflow-x-auto space-x-4 pb-4 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {sermons.map((sermon) => (
          <div
            key={sermon.id}
            onClick={() => navigate(`/sermons/${sermon.id}`)}
            className="flex-shrink-0 w-72 bg-white rounded-lg shadow-sm hover:shadow-md transition cursor-pointer overflow-hidden border border-gray-200"
          >
            {/* 카드 헤더 - 매우 연한 파스텔 톤 */}
            <div className="bg-gradient-to-r from-blue-100/30 to-gray-50 p-3 h-24 flex flex-col justify-between border-b border-gray-100">
              <div className="flex items-center justify-between text-xs">
                <span className="bg-white border border-gray-200 text-gray-700 px-2 py-1 rounded-full text-xs font-medium shadow-sm">
                  {sermon.category_display}
                </span>
                <span className="flex items-center text-gray-600">
                  <Play className="w-3 h-3 mr-1" />
                  {sermon.view_count}
                </span>
              </div>
              <h3 className="text-base font-bold text-gray-900 line-clamp-2">
                {sermon.title}
              </h3>
            </div>

            {/* 카드 본문 */}
            <div className="p-3 space-y-2">
              <div className="flex items-center text-gray-600 text-xs">
                <User className="w-3 h-3 mr-2 text-gray-400 flex-shrink-0" />
                <span className="truncate">{sermon.preacher}</span>
              </div>

              <div className="flex items-center text-gray-600 text-xs">
                <BookOpen className="w-3 h-3 mr-2 text-gray-400 flex-shrink-0" />
                <span className="font-medium text-slate-700 truncate">
                  {sermon.bible_reference}
                </span>
              </div>

              <div className="flex items-center text-gray-600 text-xs">
                <Calendar className="w-3 h-3 mr-2 text-gray-400 flex-shrink-0" />
                <span className="truncate">
                  {new Date(sermon.sermon_date).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SermonList() {
  const [allSermons, setAllSermons] = useState([]);
  const [latestSundaySermon, setLatestSundaySermon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.is_staff || user?.is_superuser;

  useEffect(() => {
    fetchSermons();
  }, []);

  const fetchSermons = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/sermons/');
      const sermons = response.data.results || response.data;
      setAllSermons(sermons);
      
      // 가장 최근 주일예배 설교 찾기
      const sundaySermons = sermons.filter(s => s.category === 'sunday');
      if (sundaySermons.length > 0) {
        setLatestSundaySermon(sundaySermons[0]);
      }
      
      setError(null);
    } catch (err) {
      console.error(err);
      setError('설교를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) {
      fetchSermons();
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get('/sermons/', {
        params: { search: searchTerm }
      });
      setAllSermons(response.data.results || response.data);
      setLatestSundaySermon(null); // 검색 시에는 최신 설교 숨김
    } catch (err) {
      console.error(err);
      setError('검색에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 카테고리별로 설교 그룹화
  const sundaySermons = allSermons.filter(s => s.category === 'sunday');
  const conferenceSermons = allSermons.filter(s => s.category === 'conference');
  const seminarSermons = allSermons.filter(s => s.category === 'seminar');

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 섹션 - 간소화 */}
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl  text-gray-200 font-bold mb-1">설교 통역/번역</h1>
              <p className="text-slate-300 text-sm">
                독일 함부르크 Arche 교회의 설교를 한국어로 통역·번역하여 제공합니다
              </p>
            </div>
            
            {isAdmin && (
              <button
                onClick={() => navigate('/sermons/upload')}
                className="inline-flex items-center px-4 py-2 bg-white text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition text-sm"
              >
                <Upload className="w-4 h-4 mr-2" />
                설교 업로드
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 최신 주일예배 설교 (Featured) - 크기 축소 */}
        {latestSundaySermon && !searchTerm && (
          <div className="mb-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4">최신 주일예배 설교</h2>
            <div
              onClick={() => navigate(`/sermons/${latestSundaySermon.id}`)}
              className="bg-white rounded-lg shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition group border border-gray-200"
            >
              <div className="md:flex">
                {/* 왼쪽: 설교 정보 */}
                <div className="md:w-2/3 p-6">
                  <div className="flex items-center space-x-3 mb-3">
                    <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
                      {latestSundaySermon.category_display}
                    </span>
                    <span className="flex items-center text-gray-500 text-xs">
                      <Play className="w-3 h-3 mr-1" />
                      {latestSundaySermon.view_count} 조회
                    </span>
                  </div>
                  
                  <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-slate-700 transition line-clamp-2">
                    {latestSundaySermon.title}
                  </h3>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center text-gray-600 text-sm">
                      <User className="w-4 h-4 mr-2 text-gray-400" />
                      <span>{latestSundaySermon.preacher}</span>
                    </div>
                    <div className="flex items-center text-gray-600 text-sm">
                      <BookOpen className="w-4 h-4 mr-2 text-gray-400" />
                      <span className="font-medium text-slate-700">
                        {latestSundaySermon.bible_reference}
                      </span>
                    </div>
                    <div className="flex items-center text-gray-600 text-sm">
                      <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                      <span>
                        {new Date(latestSundaySermon.sermon_date).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                  </div>

                  {latestSundaySermon.description && (
                    <p className="text-gray-600 text-sm line-clamp-2 mb-3">
                      {latestSundaySermon.description}
                    </p>
                  )}

                  <button className="inline-flex items-center px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition text-sm">
                    <Play className="w-4 h-4 mr-2" />
                    설교 듣기
                  </button>
                </div>

                {/* 오른쪽: 플레이스홀더 이미지 영역 */}
                <div className="md:w-1/3 bg-gradient-to-br from-blue-50 to-slate-50 flex items-center justify-center p-6 border-l border-gray-100">
                  <div className="text-center text-gray-600">
                    <Play className="w-16 h-16 mx-auto mb-3 opacity-40" />
                    <p className="text-sm font-medium">Latest Sermon</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 검색 바 - 크기 축소 */}
        <div className="mb-8">
          <form onSubmit={handleSearch} className="max-w-xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="성경책, 설교 제목, 설교자로 검색..."
                className="w-full pl-11 pr-20 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 px-4 py-1.5 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition text-sm"
              >
                검색
              </button>
            </div>
          </form>
        </div>

        {error ? (
          <div className="text-center py-20">
            <p className="text-red-500 text-lg">{error}</p>
          </div>
        ) : (
          <>
            {/* 주일예배 설교 캐러셀 */}
            <SermonCarousel 
              sermons={sundaySermons}
              title="주일예배"
              navigate={navigate}
            />

            {/* 컨퍼런스 설교 캐러셀 */}
            <SermonCarousel 
              sermons={conferenceSermons}
              title="컨퍼런스"
              navigate={navigate}
            />

            {/* 세미나 설교 캐러셀 */}
            <SermonCarousel 
              sermons={seminarSermons}
              title="세미나"
              navigate={navigate}
            />

            {allSermons.length === 0 && (
              <div className="text-center py-20 bg-white rounded-lg">
                <BookOpen className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-500 text-lg">등록된 설교가 없습니다</p>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}

export default SermonList;