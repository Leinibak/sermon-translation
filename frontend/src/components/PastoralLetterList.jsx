// frontend/src/components/PastoralLetterList.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import { 
  Search, Upload, Calendar, User, Eye, 
  FileText, Lock, AlertCircle, ChevronRight 
} from 'lucide-react';

function PastoralLetterList() {
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [accessDenied, setAccessDenied] = useState(false);
  
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const isAdmin = user?.is_staff || user?.is_superuser;

  useEffect(() => {
    fetchLetters();
  }, []);

  const fetchLetters = async () => {
    try {
      setLoading(true);
      setAccessDenied(false);
      const response = await axios.get('/pastoral-letters/');
      setLetters(response.data.results || response.data);
      setError(null);
    } catch (err) {
      console.error('목회서신 로딩 실패:', err);
      
      if (err.response?.status === 403) {
        setAccessDenied(true);
        setError(err.response?.data?.detail || '목회서신은 Arche 공동체가 열람할 수 있습니다.');
      } else if (err.response?.status === 401) {
        setError('로그인이 필요합니다.');
      } else {
        setError('목회서신을 불러오는데 실패했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    
    if (!searchTerm.trim()) {
      fetchLetters();
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get('/pastoral-letters/', {
        params: { search: searchTerm }
      });
      setLetters(response.data.results || response.data);
      setError(null);
    } catch (err) {
      console.error('검색 실패:', err);
      if (err.response?.status === 403) {
        setAccessDenied(true);
        setError(err.response?.data?.detail || '접근 권한이 없습니다.');
      } else {
        setError('검색에 실패했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    fetchLetters();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600"></div>
      </div>
    );
  }

  // 접근 권한 없음
  if (accessDenied) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-2xl text-gray-200 font-bold mb-1">목회서신</h1>
            <p className="text-slate-300 text-sm">
              Arche 교회 교인을 위한 목회서신
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-12 text-center">
              <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Lock className="w-10 h-10 text-amber-600" />
              </div>
              
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                접근 권한이 필요합니다
              </h2>
              
              <p className="text-gray-600 mb-6 leading-relaxed">
                {error}
              </p>

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-6 mb-6">
                <h3 className="font-semibold text-blue-900 mb-3 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  접근 방법
                </h3>
                <ul className="text-sm text-blue-800 space-y-2 text-left max-w-md mx-auto">
                  <li className="flex items-start">
                    <span className="mr-2">1.</span>
                    <span>회원가입 시 "Arche 교회 등록 교인" 항목을 체크하세요</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">2.</span>
                    <span>관리자의 승인을 기다려주세요</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">3.</span>
                    <span>승인 후 목회서신을 열람하실 수 있습니다</span>
                  </li>
                </ul>
              </div>

              {!isAuthenticated && (
                <button
                  onClick={() => navigate('/login')}
                  className="px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition"
                >
                  로그인하기
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 섹션 */}
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl text-gray-200 font-bold mb-1">목회서신</h1>
              <p className="text-slate-300 text-sm">
                Arche 교회 교인을 위한 목회서신
              </p>
            </div>
            
            {isAdmin && (
              <button
                onClick={() => navigate('/pastoral-letters/upload')}
                className="inline-flex items-center px-4 py-2 bg-white text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition text-sm"
              >
                <Upload className="w-4 h-4 mr-2" />
                서신 업로드
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 검색바 */}
        <div className="mb-6">
          <form onSubmit={handleSearch} className="max-w-xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="제목으로 검색..."
                className="w-full pl-11 pr-32 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-24 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                >
                  초기화
                </button>
              )}
              <button
                type="submit"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 px-4 py-1.5 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition text-sm"
              >
                검색
              </button>
            </div>
          </form>
        </div>

        {/* 통계 정보 */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-900">
            {searchTerm ? (
              <>
                '<span className="text-slate-700">{searchTerm}</span>' 검색 결과{' '}
                <span className="text-slate-700">{letters.length}</span>건
              </>
            ) : (
              <>
                전체 목회서신 <span className="text-slate-700">{letters.length}</span>
              </>
            )}
          </h2>
        </div>

        {error && !accessDenied ? (
          <div className="text-center py-20">
            <p className="text-red-500 text-lg">{error}</p>
            <button
              onClick={fetchLetters}
              className="mt-4 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition text-sm"
            >
              다시 시도
            </button>
          </div>
        ) : letters.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-lg border border-gray-200">
            <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            {searchTerm ? (
              <>
                <p className="text-gray-500 text-lg mb-2">검색 결과가 없습니다</p>
                <p className="text-gray-400 text-sm mb-4">다른 검색어로 시도해보세요</p>
                <button
                  onClick={handleClearSearch}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
                >
                  전체 목록 보기
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-500 text-lg">등록된 목회서신이 없습니다</p>
                <p className="text-gray-400 text-sm mt-2">첫 번째 목회서신을 업로드해보세요</p>
              </>
            )}
          </div>
        ) : (
          /* 웹보드 포럼 리스트 스타일 */
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {/* 테이블 헤더 */}
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200 px-6 py-3">
              <div className="grid grid-cols-12 gap-4 text-sm font-semibold text-gray-700">
                <div className="col-span-1 text-center">번호</div>
                <div className="col-span-6">제목</div>
                <div className="col-span-2 text-center">작성일</div>
                <div className="col-span-2 text-center">작성자</div>
                <div className="col-span-1 text-center">조회</div>
              </div>
            </div>

            {/* 테이블 바디 */}
            <div className="divide-y divide-gray-200">
              {letters.map((letter, index) => (
                <div
                  key={letter.id}
                  onClick={() => navigate(`/pastoral-letters/${letter.id}`)}
                  className="px-6 py-4 hover:bg-gray-50 transition cursor-pointer group"
                >
                  <div className="grid grid-cols-12 gap-4 items-center">
                    {/* 번호 */}
                    <div className="col-span-1 text-center">
                      <span className="text-sm font-medium text-gray-600">
                        {letters.length - index}
                      </span>
                    </div>

                    {/* 제목 */}
                    <div className="col-span-6">
                      <div className="flex items-center">
                        <FileText className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-900 group-hover:text-slate-700 transition line-clamp-1">
                          {letter.title}
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-400 ml-2 opacity-0 group-hover:opacity-100 transition flex-shrink-0" />
                      </div>
                      {letter.description && (
                        <p className="text-xs text-gray-500 mt-1 ml-6 line-clamp-1">
                          {letter.description}
                        </p>
                      )}
                    </div>

                    {/* 작성일 */}
                    <div className="col-span-2 text-center">
                      <span className="text-sm text-gray-600 flex items-center justify-center">
                        <Calendar className="w-3 h-3 mr-1" />
                        {new Date(letter.letter_date).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit'
                        })}
                      </span>
                    </div>

                    {/* 작성자 */}
                    <div className="col-span-2 text-center">
                      <span className="text-sm text-gray-600 flex items-center justify-center">
                        <User className="w-3 h-3 mr-1" />
                        {letter.uploaded_by_username || '관리자'}
                      </span>
                    </div>

                    {/* 조회수 */}
                    <div className="col-span-1 text-center">
                      <span className="text-sm text-gray-500 flex items-center justify-center">
                        <Eye className="w-3 h-3 mr-1" />
                        {letter.view_count}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PastoralLetterList;