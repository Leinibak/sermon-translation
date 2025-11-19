// frontend/src/components/SermonList.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import { Search, Filter, Calendar, User, BookOpen, Play } from 'lucide-react';

function SermonList() {
  const [sermons, setSermons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.is_staff || user?.is_superuser;

  useEffect(() => {
    fetchSermons();
    fetchCategories();
  }, [selectedCategory]);

  const fetchSermons = async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedCategory) params.category = selectedCategory;
      if (searchTerm) params.search = searchTerm;
      
      const response = await axios.get('/sermons/', { params });
      setSermons(response.data.results || response.data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('설교를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await axios.get('/sermons/categories/');
      setCategories(response.data);
    } catch (err) {
      console.error('카테고리 로딩 실패:', err);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchSermons();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 헤더 */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">설교 통역/번역</h3>
            <p className="mt-2 text-gray-600">
              이 페이지는 독일 함부르크 Arche 교회의 설교를 한국어로 통역·번역하여 제공합니다.
            </p>
          </div>
          
          {isAdmin && (
            <button
              onClick={() => navigate('/sermons/upload')}
              className="inline-flex items-center px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              설교 업로드
            </button>
          )}
        </div>

        {/* 검색 및 필터 */}
        <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-lg shadow-sm">
          {/* 검색 */}
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="성경책, 설교 제목, 설교자로 검색..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </form>

          {/* 카테고리 필터 */}
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">전체 카테고리</option>
              {categories.map(cat => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSearch}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            검색
          </button>
        </div>
      </div>

      {/* 설교 목록 */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <p className="text-red-500 text-lg">{error}</p>
        </div>
      ) : sermons.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-lg">
          <BookOpen className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-500 text-lg">등록된 설교가 없습니다</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sermons.map((sermon) => (
            <div
              key={sermon.id}
              onClick={() => navigate(`/sermons/${sermon.id}`)}
              className="bg-white rounded-lg shadow-sm hover:shadow-md transition cursor-pointer overflow-hidden"
            >
              {/* 카드 헤더 */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-4">
                <div className="flex items-center justify-between text-white text-sm mb-2">
                  <span className="bg-white bg-opacity-20 px-3 py-1 rounded-full">
                    {sermon.category_display}
                  </span>
                  <span className="flex items-center">
                    <Play className="w-4 h-4 mr-1" />
                    {sermon.view_count}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white line-clamp-2">
                  {sermon.title}
                </h3>
              </div>

              {/* 카드 본문 */}
              <div className="p-4 space-y-3">
                <div className="flex items-center text-gray-600 text-sm">
                  <User className="w-4 h-4 mr-2 text-gray-400" />
                  <span>{sermon.preacher}</span>
                </div>

                <div className="flex items-center text-gray-600 text-sm">
                  <BookOpen className="w-4 h-4 mr-2 text-gray-400" />
                  <span className="font-medium text-blue-600">
                    {sermon.bible_reference}
                  </span>
                </div>

                <div className="flex items-center text-gray-600 text-sm">
                  <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                  <span>
                    {new Date(sermon.sermon_date).toLocaleDateString('ko-KR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </span>
                </div>
              </div>

              {/* 카드 푸터 */}
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                <button className="w-full text-center text-blue-600 hover:text-blue-700 font-medium text-sm">
                  설교 보기 →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SermonList;