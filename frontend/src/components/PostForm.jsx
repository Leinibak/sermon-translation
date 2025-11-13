// ============================================
// frontend/src/components/PostForm.jsx (수정)
// ============================================
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import API_ENDPOINTS from '../config/api';
import { useAuth } from '../contexts/AuthContext';

function PostForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const isEditMode = Boolean(id);
  
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    author: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) {
      alert('로그인이 필요합니다.');
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (isEditMode) {
      fetchPost();
    }
  }, [id]);

  const fetchPost = async () => {
    try {
      console.log('🔍 게시글 조회:', API_ENDPOINTS.board.detail(id));
      const response = await axios.get(API_ENDPOINTS.board.detail(id));
      console.log('✅ 게시글 조회 성공:', response.data);
      setFormData({
        title: response.data.title || '',
        content: response.data.content || '',
        author: response.data.author || '',
      });
    } catch (err) {
      console.error('❌ 게시글 조회 실패:', err);
      setError('게시글을 불러오는데 실패했습니다.');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    console.log('📤 폼 제출 시도');
    console.log('입력 데이터:', formData);

    if (!formData.title.trim() || !formData.content.trim() || !formData.author.trim()) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (isEditMode) {
        console.log('🔄 수정 요청:', API_ENDPOINTS.board.detail(id));
        const response = await axios.put(API_ENDPOINTS.board.detail(id), formData);
        console.log('✅ 수정 성공:', response.data);
        alert('게시글이 수정되었습니다.');
        navigate('/blog'); // ✅ 게시글 목록으로 이동
      } else {
        console.log('➕ 생성 요청:', API_ENDPOINTS.board.posts);
        const response = await axios.post(API_ENDPOINTS.board.posts, formData);
        console.log('✅ 생성 성공:', response.data);
        alert('게시글이 작성되었습니다.');
        navigate('/blog'); // ✅ 게시글 목록으로 이동
      }
    } catch (err) {
      console.error('❌ 요청 실패:', err);
      
      if (err.response?.status === 401) {
        setError('로그인이 필요합니다.');
        alert('로그인이 필요합니다.');
        navigate('/login');
      } else {
        const errorMessage = err.response?.data?.detail 
          || err.response?.data?.message
          || '저장에 실패했습니다.';
        setError(errorMessage);
        alert(`저장 실패: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate(-1);
  };

  return (
    <div className="max-w-3xl mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">
        {isEditMode ? "✏️ 게시글 수정" : "📝 게시글 작성"}
      </h2>

      <div className="space-y-4">
        <div>
          <label className="block text-gray-700 mb-1">제목</label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="제목을 입력하세요"
          />
        </div>

        <div>
          <label className="block text-gray-700 mb-1">내용</label>
          <textarea
            name="content"
            rows={6}
            value={formData.content}
            onChange={handleChange}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="내용을 입력하세요"
          />
        </div>

        <div>
          <label className="block text-gray-700 mb-1">작성자</label>
          <input
            type="text"
            name="author"
            value={formData.author}
            onChange={handleChange}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="작성자를 입력하세요"
          />
        </div>
      </div>

      <div className="flex justify-end space-x-2 mt-6">
        <button
          type="button"
          className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded shadow"
          onClick={handleCancel}
        >
          취소
        </button>
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow"
          onClick={handleSubmit}
        >
          {isEditMode ? "수정 완료" : "등록"}
        </button>
      </div>
    </div>
  );
}

export default PostForm;