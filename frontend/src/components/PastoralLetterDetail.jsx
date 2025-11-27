// frontend/src/components/PastoralLetterDetail.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import { 
  ArrowLeft, Calendar, User, Eye, 
  ExternalLink, Edit, Trash2, FileText 
} from 'lucide-react';

function PastoralLetterDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.is_staff || user?.is_superuser;

  const [letter, setLetter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchLetter();
  }, [id]);

  const fetchLetter = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/pastoral-letters/${id}/`);
      setLetter(response.data);
      setError(null);
    } catch (err) {
      console.error(err);
      if (err.response?.status === 403) {
        setError(err.response?.data?.detail || '접근 권한이 없습니다.');
      } else {
        setError('목회서신을 불러오는데 실패했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePdfView = (url) => {
    if (!url) {
      alert('PDF 파일이 없습니다.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async () => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;

    try {
      await axios.delete(`/pastoral-letters/${id}/`);
      alert('목회서신이 삭제되었습니다.');
      navigate('/pastoral-letters');
    } catch (err) {
      console.error(err);
      alert('삭제에 실패했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600"></div>
      </div>
    );
  }

  if (error || !letter) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
          <p className="text-red-700">{error || '목회서신을 찾을 수 없습니다.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* 뒤로가기 */}
      <Link 
        to="/pastoral-letters" 
        className="inline-flex items-center text-gray-600 hover:text-slate-700 mb-4 transition-colors group text-sm"
      >
        <ArrowLeft className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" />
        <span className="font-medium">목록으로</span>
      </Link>

      {/* 목회서신 정보 */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 p-5 text-white">
          <div className="flex justify-between items-start mb-3">
            <span className="inline-block bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium">
              목회서신
            </span>
            
            {isAdmin && (
              <div className="flex space-x-2">
                <button
                  onClick={() => navigate(`/pastoral-letters/edit/${id}`)}
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

          <h1 className="text-xl font-bold mb-4 leading-tight">{letter.title}</h1>

          <div className="flex flex-wrap gap-3 text-xs">
            <div className="flex items-center bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <Calendar className="w-4 h-4 mr-1.5" />
              <span>
                {new Date(letter.letter_date).toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </span>
            </div>
            <div className="flex items-center bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <User className="w-4 h-4 mr-1.5" />
              <span className="font-medium">{letter.uploaded_by_username || '관리자'}</span>
            </div>
            <div className="flex items-center bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <Eye className="w-4 h-4 mr-1.5" />
              <span>{letter.view_count} 조회</span>
            </div>
          </div>
        </div>

        {/* 본문 */}
        <div className="p-6">
          {letter.description && (
            <div className="mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
                <span className="w-1 h-5 bg-slate-600 rounded-full mr-2"></span>
                내용 요약
              </h2>
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed text-sm">
                {letter.description}
              </p>
            </div>
          )}

          {/* PDF 보기 */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
              <span className="w-1 h-5 bg-slate-600 rounded-full mr-2"></span>
              목회서신 보기
            </h3>
            
            <button
              onClick={() => handlePdfView(letter.pdf_url)}
              className="group w-full flex items-center justify-center px-6 py-4 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-700 rounded-lg hover:from-slate-100 hover:to-slate-200 transition-all shadow-sm hover:shadow-md border border-slate-200"
            >
              <ExternalLink className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform" />
              <div className="text-left">
                <div className="font-semibold">PDF 열기</div>
                <div className="text-xs text-slate-600">새 창에서 목회서신 PDF를 확인하세요</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* 안내 메시지 */}
      <div className="mt-6 bg-blue-50 rounded-lg p-5 border border-blue-100">
        <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center">
          <FileText className="w-4 h-4 mr-2" />
          목회서신 안내
        </h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• 목회서신은 Arche 공동체에 속한 성도님들이 열람할 수 있습니다.</li>
        </ul>
      </div>
    </div>
  );
}

export default PastoralLetterDetail;