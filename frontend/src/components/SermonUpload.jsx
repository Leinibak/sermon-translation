// frontend/src/components/SermonUpload.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import { Upload, AlertCircle } from 'lucide-react';

function SermonUpload() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEditMode = Boolean(id);
  const isAdmin = user?.is_staff || user?.is_superuser;

  const [categories, setCategories] = useState([]);
  const [bibleBooks, setBibleBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    title: '',
    preacher: '',
    sermon_date: '',
    category: 'sunday',
    bible_book: '',
    chapter: '',
    verse_start: '',
    verse_end: '',
    description: '',
    duration: '',
  });

  const [files, setFiles] = useState({
    original_audio_file: null,  // ✅ 추가
    audio_file: null,
    original_pdf: null,
    translated_pdf: null,
  });

  useEffect(() => {
    if (!isAdmin) {
      alert('관리자만 접근 가능합니다.');
      navigate('/sermons');
      return;
    }

    fetchCategories();
    fetchBibleBooks();

    if (isEditMode) {
      fetchSermon();
    }
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await axios.get('/sermons/categories/');
      setCategories(response.data);
    } catch (err) {
      console.error('카테고리 로딩 실패:', err);
    }
  };

  const fetchBibleBooks = async () => {
    try {
      const response = await axios.get('/sermons/bible_books/');
      setBibleBooks(response.data);
    } catch (err) {
      console.error('성경 목록 로딩 실패:', err);
    }
  };

  const fetchSermon = async () => {
    try {
      const response = await axios.get(`/sermons/${id}/`);
      const sermon = response.data;
      
      setFormData({
        title: sermon.title || '',
        preacher: sermon.preacher || '',
        sermon_date: sermon.sermon_date || '',
        category: sermon.category || 'sunday',
        bible_book: sermon.bible_book || '',
        chapter: sermon.chapter || '',
        verse_start: sermon.verse_start || '',
        verse_end: sermon.verse_end || '',
        description: sermon.description || '',
        duration: sermon.duration || '',
      });
    } catch (err) {
      console.error('설교 로딩 실패:', err);
      alert('설교를 불러오는데 실패했습니다.');
      navigate('/sermons');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFileChange = (e) => {
    const { name, files: selectedFiles } = e.target;
    if (selectedFiles && selectedFiles[0]) {
      setFiles(prev => ({
        ...prev,
        [name]: selectedFiles[0]
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // ✅ 필수 파일 체크 수정 - 통역 오디오는 필수, 원본은 선택
    if (!isEditMode && !files.audio_file) {
      alert('통역 오디오 파일은 필수입니다.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const submitData = new FormData();
      
      // 텍스트 데이터 추가
      Object.keys(formData).forEach(key => {
        if (formData[key]) {
          submitData.append(key, formData[key]);
        }
      });

      // 파일 추가
      Object.keys(files).forEach(key => {
        if (files[key]) {
          submitData.append(key, files[key]);
        }
      });

      if (isEditMode) {
        await axios.put(`/sermons/${id}/`, submitData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        alert('설교가 수정되었습니다.');
        navigate(`/sermons/${id}`);
      } else {
        const response = await axios.post('/sermons/', submitData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        alert('설교가 업로드되었습니다.');
        navigate(`/sermons/${response.data.id}`);
      }
    } catch (err) {
      console.error('업로드 실패:', err);
      const errorMessage = err.response?.data?.detail 
        || err.response?.data?.message
        || '업로드에 실패했습니다.';
      setError(errorMessage);
      alert(`업로드 실패: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        {/* 헤더 */}
        <div className="px-8 py-6 bg-gradient-to-r from-blue-600 to-blue-800">
          <h1 className="text-3xl font-bold text-white">
            {isEditMode ? '설교 수정' : '설교 업로드'}
          </h1>
          <p className="mt-2 text-blue-100">
            {isEditMode ? '설교 정보를 수정합니다' : '새로운 설교를 업로드합니다'}
          </p>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="px-8 py-4 bg-red-50 border-b border-red-100">
            <div className="flex items-center text-red-700">
              <AlertCircle className="w-5 h-5 mr-2" />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {/* 기본 정보 */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 border-b pb-2">
              기본 정보
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  제목 *
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="설교 제목"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  설교자 *
                </label>
                <input
                  type="text"
                  name="preacher"
                  value={formData.preacher}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="설교자 이름"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  설교일 *
                </label>
                <input
                  type="date"
                  name="sermon_date"
                  value={formData.sermon_date}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  카테고리 *
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {categories.map(cat => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 성경 본문 */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 border-b pb-2">
              성경 본문
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  성경 *
                </label>
                <select
                  name="bible_book"
                  value={formData.bible_book}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">선택하세요</option>
                  {bibleBooks.map(book => (
                    <option key={book.value} value={book.value}>
                      {book.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  장 *
                </label>
                <input
                  type="number"
                  name="chapter"
                  value={formData.chapter}
                  onChange={handleChange}
                  required
                  min="1"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="장"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  시작 절 *
                </label>
                <input
                  type="number"
                  name="verse_start"
                  value={formData.verse_start}
                  onChange={handleChange}
                  required
                  min="1"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="절"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  마지막 절 *
                </label>
                <input
                  type="number"
                  name="verse_end"
                  value={formData.verse_end}
                  onChange={handleChange}
                  required
                  min="1"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="절"
                />
              </div>
            </div>
          </div>

          {/* ✅ 파일 업로드 - 원본 오디오 추가 */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 border-b pb-2">
              파일 업로드
            </h2>

            <div className="space-y-4">
              {/* ✅ 원본 설교 오디오 (선택사항) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  원본 설교 오디오 (독일어)
                </label>
                <div className="flex items-center space-x-3">
                  <label className="flex-1 cursor-pointer">
                    <div className="flex items-center justify-center px-4 py-3 border-2 border-dashed border-amber-300 bg-amber-50 rounded-lg hover:border-amber-500 transition">
                      <Upload className="w-5 h-5 mr-2 text-amber-600" />
                      <span className="text-gray-700">
                        {files.original_audio_file ? files.original_audio_file.name : '원본 오디오 파일 선택'}
                      </span>
                    </div>
                    <input
                      type="file"
                      name="original_audio_file"
                      onChange={handleFileChange}
                      accept="audio/mp3,audio/wav,audio/m4a"
                      className="hidden"
                    />
                  </label>
                </div>
                <p className="mt-1 text-sm text-gray-500">설교자의 원본 설교 음성 (MP3, WAV, M4A, 최대 100MB)</p>
              </div>

              {/* 통역 오디오 파일 (필수) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  통역 설교 오디오 (한국어) {!isEditMode && '*'}
                </label>
                <div className="flex items-center space-x-3">
                  <label className="flex-1 cursor-pointer">
                    <div className="flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition">
                      <Upload className="w-5 h-5 mr-2 text-gray-400" />
                      <span className="text-gray-600">
                        {files.audio_file ? files.audio_file.name : '통역 오디오 파일 선택'}
                      </span>
                    </div>
                    <input
                      type="file"
                      name="audio_file"
                      onChange={handleFileChange}
                      accept="audio/mp3,audio/wav,audio/m4a"
                      className="hidden"
                      required={!isEditMode}
                    />
                  </label>
                </div>
                <p className="mt-1 text-sm text-gray-500">통역된 설교 음성 (MP3, WAV, M4A, 최대 100MB)</p>
              </div>

              {/* 원본 PDF */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  원본 설교자료 (독일어 PDF)
                </label>
                <div className="flex items-center space-x-3">
                  <label className="flex-1 cursor-pointer">
                    <div className="flex items-center justify-center px-4 py-3 border-2 border-dashed border-blue-300 bg-blue-50 rounded-lg hover:border-blue-500 transition">
                      <Upload className="w-5 h-5 mr-2 text-blue-600" />
                      <span className="text-gray-700">
                        {files.original_pdf ? files.original_pdf.name : '원본 PDF 선택'}
                      </span>
                    </div>
                    <input
                      type="file"
                      name="original_pdf"
                      onChange={handleFileChange}
                      accept="application/pdf"
                      className="hidden"
                    />
                  </label>
                </div>
                <p className="mt-1 text-sm text-gray-500">PDF (최대 50MB)</p>
              </div>

              {/* 번역 PDF */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  번역 설교자료 (한국어 PDF)
                </label>
                <div className="flex items-center space-x-3">
                  <label className="flex-1 cursor-pointer">
                    <div className="flex items-center justify-center px-4 py-3 border-2 border-dashed border-green-300 bg-green-50 rounded-lg hover:border-green-500 transition">
                      <Upload className="w-5 h-5 mr-2 text-green-600" />
                      <span className="text-gray-700">
                        {files.translated_pdf ? files.translated_pdf.name : '번역 PDF 선택'}
                      </span>
                    </div>
                    <input
                      type="file"
                      name="translated_pdf"
                      onChange={handleFileChange}
                      accept="application/pdf"
                      className="hidden"
                    />
                  </label>
                </div>
                <p className="mt-1 text-sm text-gray-500">PDF (최대 50MB)</p>
              </div>
            </div>
          </div>

          {/* 추가 정보 */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 border-b pb-2">
              추가 정보
            </h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                설교 요약
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={5}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="설교 내용 요약 (선택사항)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                재생 시간 (초)
              </label>
              <input
                type="number"
                name="duration"
                value={formData.duration}
                onChange={handleChange}
                min="0"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="예: 3600 (1시간)"
              />
            </div>
          </div>

          {/* 버튼 */}
          <div className="flex justify-between items-center pt-6 border-t">
            <button
              type="button"
              onClick={() => navigate('/sermons')}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
            >
              취소
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  업로드 중...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 mr-2" />
                  {isEditMode ? '수정 완료' : '업로드'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SermonUpload;