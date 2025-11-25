// ============================================
// frontend/src/components/PostForm.jsx (Gowun Batang 폰트 적용)
// ============================================
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from '../api/axios';
import API_ENDPOINTS from '../config/api';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Save, AlertCircle, User, FileText, Upload, X, Image as ImageIcon } from 'lucide-react';

function PostForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const isEditMode = Boolean(id);
  
  const [formData, setFormData] = useState({
    title: '',
    content: '',
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [existingImage, setExistingImage] = useState(null);
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
      if (response.data.image_url) {
        setExistingImage(response.data.image_url);
      }
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

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // 파일 크기 체크 (5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('이미지 파일은 5MB 이하만 업로드 가능합니다.');
        return;
      }

      // 파일 형식 체크
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        alert('JPG, PNG, GIF, WebP 형식의 이미지만 업로드 가능합니다.');
        return;
      }

      setImageFile(file);
      
      // 미리보기 생성
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setExistingImage(null);
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

      const submitData = new FormData();
      submitData.append('title', formData.title);
      submitData.append('content', formData.content);
      
      // 이미지 파일이 있으면 추가
      if (imageFile) {
        submitData.append('image', imageFile);
      }

      if (isEditMode) {
        console.log('📝 수정 요청:', API_ENDPOINTS.board.detail(id));
        const response = await axios.put(API_ENDPOINTS.board.detail(id), submitData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        console.log('✅ 수정 성공:', response.data);
        alert('게시글이 수정되었습니다.');
        navigate(`/post/${id}`);
      } else {
        console.log('➕ 생성 요청:', API_ENDPOINTS.board.posts);
        const response = await axios.post(API_ENDPOINTS.board.posts, submitData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
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
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* 뒤로가기 */}
      <Link 
        to="/blog" 
        className="inline-flex items-center text-gray-600 hover:text-indigo-700 mb-4 transition-colors group text-sm"
      >
        <ArrowLeft className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" />
        <span className="font-medium">목록으로</span>
      </Link>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
        {/* 헤더 - Blog 전용 색상 */}
        <div className="bg-gradient-to-r from-cyan-700 to-neutral-800 p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <span className="inline-block bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium">
              {isEditMode ? '게시글 수정' : '새 글 작성'}
            </span>
          </div>
          
          <h1 className="text-xl font-bold text-gray-100 mb-4">
            {isEditMode ? '게시글 수정하기' : '새 게시글 작성'}
          </h1>
          
          {user && (
            <div className="flex items-center bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg w-fit text-xs">
              <User className="w-4 h-4 mr-1.5" />
              <span className="font-medium">{user.username}</span>
            </div>
          )}
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className={`px-6 py-4 ${approvalError ? 'bg-yellow-50 border-yellow-100' : 'bg-red-50 border-red-100'} border-b`}>
            <div className={`flex items-start ${approvalError ? 'text-yellow-800' : 'text-red-700'}`}>
              <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
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
          <div className="p-6 space-y-6">
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition text-sm"
              />
            </div>

            {/* 이미지 업로드 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                대표 이미지 (선택사항)
              </label>
              
              {!imagePreview && !existingImage ? (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-indigo-400 transition">
                  <input
                    type="file"
                    id="image"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  <label 
                    htmlFor="image" 
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <Upload className="w-12 h-12 text-gray-400 mb-3" />
                    <span className="text-sm text-gray-600 mb-1">
                      클릭하여 이미지 업로드
                    </span>
                    <span className="text-xs text-gray-500">
                      JPG, PNG, GIF, WebP (최대 5MB)
                    </span>
                  </label>
                </div>
              ) : (
                <div className="relative">
                  <img 
                    src={imagePreview || existingImage} 
                    alt="미리보기" 
                    className="w-full h-64 object-cover rounded-lg border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition shadow-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-600">
                      {imageFile ? imageFile.name : '기존 이미지'}
                    </span>
                    <label htmlFor="image" className="text-xs text-indigo-600 hover:text-indigo-700 cursor-pointer font-medium">
                      이미지 변경
                    </label>
                    <input
                      type="file"
                      id="image"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 내용 - ✅ Gowun Batang 폰트 적용 */}
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition text-sm blog-content"
                style={{ fontSize: '12pt' }}
              />
              <div className="mt-2 flex justify-between items-center">
                <p className="text-xs text-gray-500">
                  {formData.content.length} / 5000자
                </p>
                <p className="text-xs text-gray-500">
                  한글 폰트: Gowun Batang 12pt
                </p>
              </div>
            </div>
          </div>

          {/* 버튼 영역 */}
          <div className="px-6 py-5 bg-gradient-to-br from-gray-50 to-gray-100 border-t border-gray-200 flex justify-between items-center">
            <button
              type="button"
              onClick={handleCancel}
              className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition text-sm font-medium"
            >
              취소
            </button>
            
            <div className="flex space-x-3">
              {isEditMode && (
                <button
                  type="button"
                  onClick={() => navigate(`/post/${id}`)}
                  className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition text-sm font-medium"
                >
                  미리보기
                </button>
              )}
              <button
                type="submit"
                disabled={loading || !formData.title.trim() || !formData.content.trim()}
                className="px-5 py-2.5 bg-cyan-800 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center text-sm font-medium"
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
                    <Save className="w-4 h-4 mr-2" />
                    {isEditMode ? '수정 완료' : '게시글 작성'}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* 도움말 */}
      <div className="mt-6 bg-blue-50 rounded-lg p-5 border border-blue-100">
        <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center">
          <FileText className="w-4 h-4 mr-2" />
          작성 가이드
        </h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• 제목과 내용을 모두 입력해주세요.</li>
          <li>• 대표 이미지는 선택사항입니다 (JPG, PNG, GIF, WebP, 최대 5MB).</li>
          <li>• 본문은 <strong>Gowun Batang 12pt</strong> 폰트로 표시됩니다.</li>
          <li>• 작성자는 로그인한 계정으로 자동 설정됩니다.</li>
          <li>• <strong>관리자 승인 후</strong> 게시글 작성이 가능합니다.</li>
          <li>• 욕설이나 비방하는 내용은 삼가주세요.</li>
        </ul>
      </div>
    </div>
  );
}

export default PostForm;