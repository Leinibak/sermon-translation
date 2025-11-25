// ============================================
// frontend/src/components/PostList.jsx (검색 기능 수정)
// ============================================
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import API_ENDPOINTS from '../config/api';
import { useAuth } from '../contexts/AuthContext';
import { Search, Upload, Calendar, User, Eye, FileText, Image as ImageIcon } from 'lucide-react';

function PostList() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const response = await axios.get(API_ENDPOINTS.board.posts);
      console.log('📥 전체 게시글 응답:', response.data);
      
      // ✅ 응답 구조 확인 및 안전한 데이터 추출
      const postsData = response.data?.results || response.data || [];
      console.log('📋 게시글 데이터:', postsData);
      
      setPosts(postsData);
      setError(null);
    } catch (err) {
      console.error('❌ 게시글 로딩 실패:', err);
      setError('게시글을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    
    // ✅ 검색어가 비어있으면 전체 목록 다시 불러오기
    if (!searchTerm.trim()) {
      fetchPosts();
      return;
    }

    try {
      setLoading(true);
      console.log('🔍 검색어:', searchTerm);
      
      // ✅ search 파라미터 전달
      const response = await axios.get(API_ENDPOINTS.board.posts, {
        params: { search: searchTerm }
      });
      
      console.log('🔍 검색 결과 응답:', response.data);
      
      // ✅ 응답 구조 확인 및 안전한 데이터 추출
      const postsData = response.data?.results || response.data || [];
      console.log('📋 검색된 게시글:', postsData);
      
      setPosts(postsData);
      setError(null);
    } catch (err) {
      console.error('❌ 검색 실패:', err);
      console.error('응답 데이터:', err.response?.data);
      setError('검색에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // ✅ 검색어 초기화
  const handleClearSearch = () => {
    setSearchTerm('');
    fetchPosts();
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
      {/* 헤더 섹션 - Blog 전용 색상 */}
      <div className="bg-gradient-to-r from-cyan-700 to-neutral-800 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl text-gray-100 font-bold mb-1">블로그</h1>
              <p className="text-indigo-200 text-sm">
                다양한 이야기와 생각을 공유합니다
              </p>
            </div>
            
            {isAuthenticated && (
              <button
                onClick={() => navigate('/create')}
                className="inline-flex items-center px-4 py-2 bg-white text-neutral-700 font-medium rounded-lg hover:bg-indigo-50 transition text-sm"
              >
                <Upload className="w-4 h-4 mr-2" />
                새 글 작성
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 검색바 */}
        <div className="mb-8">
          <form onSubmit={handleSearch} className="max-w-xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="제목, 작성자로 검색..."
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
                className="absolute right-2 top-1/2 transform -translate-y-1/2 px-4 py-1.5 bg-cyan-700 text-white rounded-md hover:bg-indigo-700 transition text-sm"
              >
                검색
              </button>
            </div>
          </form>
        </div>

        {/* 통계 정보 */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">
              {searchTerm ? (
                <>
                  '<span className="text-sky-800">{searchTerm}</span>' 검색 결과{' '}
                  <span className="text-sky-800">{posts.length}</span>건
                </>
              ) : (
                <>
                  전체 게시글 <span className="text-sky-800">{posts.length}</span>
                </>
              )}
            </h2>
          </div>
        </div>

        {error ? (
          <div className="text-center py-20">
            <p className="text-red-500 text-lg">{error}</p>
            <button
              onClick={fetchPosts}
              className="mt-4 px-4 py-2 bg-cyan-700 text-white rounded-lg hover:bg-indigo-700 transition text-sm"
            >
              다시 시도
            </button>
          </div>
        ) : posts.length === 0 ? (
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
                <p className="text-gray-500 text-lg">게시글이 없습니다</p>
                <p className="text-gray-400 text-sm mt-2">첫 번째 게시글을 작성해보세요</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-16">
            {posts.map((post) => (
              <div
                key={post.id}
                onClick={() => navigate(`/post/${post.id}`)}
                className="bg-white rounded-lg shadow-sm hover:shadow-md transition cursor-pointer overflow-hidden border border-gray-200"
              >
                {/* 이미지 섹션 */}
                <div className="h-48 bg-gradient-to-r from-sky-100/40 to-cyan-100/40 overflow-hidden">
                  {post.image_url ? (
                    <img 
                      src={post.image_url} 
                      alt={post.title}
                      className="w-full h-full object-cover hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <FileText className="w-12 h-12 text-gray-400 opacity-40" />
                    </div>
                  )}
                </div>

                {/* 카드 본문 */}
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="bg-white border border-gray-200 text-gray-700 px-2 py-1 rounded-full text-xs font-medium shadow-sm">
                      게시글
                    </span>
                    <span className="flex items-center text-gray-600">
                      <Eye className="w-3 h-3 mr-1" />
                      {post.view_count}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-gray-900 line-clamp-2 min-h-[3rem]">
                    {post.title}
                  </h3>

                  <div className="flex items-center text-gray-600 text-xs">
                    <User className="w-3 h-3 mr-2 text-gray-400 flex-shrink-0" />
                    <span className="truncate">{post.author}</span>
                  </div>

                  <div className="flex items-center text-gray-600 text-xs">
                    <Calendar className="w-3 h-3 mr-2 text-gray-400 flex-shrink-0" />
                    <span className="truncate">
                      {new Date(post.created_at).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                  </div>

                  {post.content && (
                    <p className="text-gray-600 text-xs line-clamp-2 pt-2 border-t border-gray-100">
                      {post.content}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default PostList;