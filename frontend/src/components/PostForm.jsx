// frontend/src/components/PostForm.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from '../api/axios';
import API_ENDPOINTS from '../config/api';
import { useAuth } from '../contexts/AuthContext';

function PostForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const isEditMode = Boolean(id);
  
  const [formData, setFormData] = useState({
    title: '',
    content: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [approvalError, setApprovalError] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (isEditMode) {
      fetchPost();
    }
  }, [id]);

  const fetchPost = async () => {
    try {
      console.log('📖 게시글 조회:', API_ENDPOINTS.board.detail(id));
      const response = await axios.get(API_ENDPOINTS.board.detail(id));
      console.log('✅ 게시글 조회 성공:', response.data);
      setFormData({
        title: response.data.title || '',
        content: response.data.content || '',
      });
    } catch (err) {
      console.error('❌ 게시글 조회 실패:', err);
      setError('게시글을 불러오는데 실패했습니다.');
      alert('게시글을 불러오는데 실패했습니다.');
      navigate('/blog');
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

    if (!formData.title.trim() || !formData.content.trim()) {
      alert('제목과 내용을 입력해주세요.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setApprovalError(false);

      const submitData = {
        ...formData,
        author: user?.username
      };

      if (isEditMode) {
        console.log('🔄 수정 요청:', API_ENDPOINTS.board.detail(id));
        const response = await axios.put(API_ENDPOINTS.board.detail(id), submitData);
        console.log('✅ 수정 성공:', response.data);
        alert('게시글이 수정되었습니다.');
        navigate(`/post/${id}`);
      } else {
        console.log('➕ 생성 요청:', API_ENDPOINTS.board.posts);
        const response = await axios.post(API_ENDPOINTS.board.posts, submitData);
        console.log('✅ 생성 성공:', response.data);
        alert('게시글이 작성되었습니다.');
        navigate(`/post/${response.data.id}`);
      }
    } catch (err) {
      console.error('❌ 요청 실패:', err);
      
      if (err.response?.status === 401) {
        setError('로그인이 필요합니다.');
        alert('로그인이 필요합니다.');
        navigate('/login');
      } else if (err.response?.status === 403) {
        // 승인 대기 상태 에러
        const errorMessage = err.response?.data?.detail || '권한이 없습니다.';
        setError(errorMessage);
        setApprovalError(true);
        
        if (errorMessage.includes('승인')) {
          alert('⚠️ ' + errorMessage);
        } else {
          alert('권한이 없습니다: ' + errorMessage);
        }
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
    if (window.confirm('작성을 취소하시겠습니까?')) {
      navigate(-1);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {/* 헤더 */}
        <div className="px-8 py-6 border-b border-gray-200">
          <div className="mb-4">
            <Link 
              to="/blog" 
              className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 transition"
            >
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              목록으로
            </Link>
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900">
            {isEditMode ? '게시글 수정' : '새 게시글 작성'}
          </h1>
          
          {user && (
            <div className="mt-4 flex items-center text-sm text-gray-600">
              <svg className="w-5 h-5 mr-1.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>작성자: <strong>{user.username}</strong></span>
            </div>
          )}
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className={`px-8 py-4 ${approvalError ? 'bg-yellow-50 border-yellow-100' : 'bg-red-50 border-red-100'} border-b`}>
            <div className={`flex items-start ${approvalError ? 'text-yellow-800' : 'text-red-700'}`}>
              <svg className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-sm font-medium">{error}</p>
                {approvalError && (
                  <p className="text-xs mt-1">관리자에게 문의하여 계정 승인을 요청하세요.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 폼 */}
        <form onSubmit={handleSubmit}>
          <div className="px-8 py-6 space-y-6">
            {/* 제목 */}
            <div>
              <label htmlFor="title" className="block text-sm font-semibold text-gray-700 mb-2">
                제목 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="게시글 제목을 입력하세요"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            {/* 내용 */}
            <div>
              <label htmlFor="content" className="block text-sm font-semibold text-gray-700 mb-2">
                내용 <span className="text-red-500">*</span>
              </label>
              <textarea
                id="content"
                name="content"
                value={formData.content}
                onChange={handleChange}
                placeholder="게시글 내용을 입력하세요"
                rows={12}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition"
              />
              <p className="mt-2 text-sm text-gray-500">
                {formData.content.length} / 5000자
              </p>
            </div>
          </div>

          {/* 버튼 영역 */}
          <div className="px-8 py-6 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition"
            >
              취소
            </button>
            
            <div className="flex space-x-3">
              {isEditMode && (
                <button
                  type="button"
                  onClick={() => navigate(`/post/${id}`)}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition"
                >
                  미리보기
                </button>
              )}
              <button
                type="submit"
                disabled={loading || !formData.title.trim() || !formData.content.trim()}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    저장 중...
                  </>
                ) : (
                  <>
                    <svg className="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {isEditMode ? '수정 완료' : '게시글 작성'}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* 도움말 */}
      <div className="mt-6 bg-blue-50 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">📝 작성 가이드</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• 제목과 내용을 모두 입력해주세요.</li>
          <li>• 작성자는 로그인한 계정으로 자동 설정됩니다.</li>
          <li>• <strong>관리자 승인 후</strong> 게시글 작성이 가능합니다.</li>
          <li>• 욕설이나 비방하는 내용은 삼가주세요.</li>
        </ul>
      </div>
    </div>
  );
}

export default PostForm;