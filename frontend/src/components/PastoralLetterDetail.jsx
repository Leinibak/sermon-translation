// frontend/src/components/PastoralLetterDetail.jsx (수정 버전)
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Document, Page } from 'react-pdf';
import axios from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import { 
  ArrowLeft, Calendar, User, Eye, 
  ExternalLink, Edit, Trash2, FileText,
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Maximize2, Minimize2, AlertCircle
} from 'lucide-react';

// ⭐ PDF 설정은 main.jsx에서 전역 적용됨

function PastoralLetterDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.is_staff || user?.is_superuser;

  const [letter, setLetter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // PDF 뷰어 상태
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
      console.error('❌ 서신 로딩 실패:', err);
      if (err.response?.status === 403) {
        setError(err.response?.data?.detail || '접근 권한이 없습니다.');
      } else {
        setError('목회서신을 불러오는데 실패했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }) => {
    console.log('✅ PDF 로딩 성공:', numPages, '페이지');
    setNumPages(numPages);
    setPdfLoading(false);
    setPdfError(null);
  };

  const onDocumentLoadError = (error) => {
    console.error('❌ PDF 로딩 에러:', error);
    setPdfLoading(false);
    setPdfError('PDF를 불러올 수 없습니다. 새 창에서 열기를 시도해주세요.');
  };

  const goToPrevPage = () => {
    setPageNumber(prev => Math.max(prev - 1, 1));
  };

  const goToNextPage = () => {
    setPageNumber(prev => Math.min(prev + 1, numPages || prev));
  };

  const zoomIn = () => {
    setScale(prev => Math.min(prev + 0.2, 3.0));
  };

  const zoomOut = () => {
    setScale(prev => Math.max(prev - 0.2, 0.5));
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
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
      console.error('❌ 삭제 실패:', err);
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

          <h1 className="text-xl font-bold mb-4 leading-tight text-gray-100 drop-shadow">
            {letter.title}
          </h1>

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

          {/* PDF 뷰어 */}
          <div className="border-t pt-6">
            {letter.pdf_url && (
              <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white' : 'relative'}`}>
                {/* 컨트롤 바 */}
                <div className="bg-slate-700 text-white p-3 rounded-t-lg flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={goToPrevPage}
                      disabled={pageNumber <= 1}
                      className="p-2 bg-white/10 rounded hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-medium px-2">
                      {pageNumber} / {numPages || '?'}
                    </span>
                    <button
                      onClick={goToNextPage}
                      disabled={pageNumber >= (numPages || 1)}
                      className="p-2 bg-white/10 rounded hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={zoomOut}
                      className="p-2 bg-white/10 rounded hover:bg-white/20 transition"
                      title="축소"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-medium px-2">
                      {Math.round(scale * 100)}%
                    </span>
                    <button
                      onClick={zoomIn}
                      className="p-2 bg-white/10 rounded hover:bg-white/20 transition"
                      title="확대"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button
                      onClick={toggleFullscreen}
                      className="p-2 bg-white/10 rounded hover:bg-white/20 transition ml-2"
                      title={isFullscreen ? "전체화면 종료" : "전체화면"}
                    >
                      {isFullscreen ? (
                        <Minimize2 className="w-4 h-4" />
                      ) : (
                        <Maximize2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* PDF 뷰어 컨테이너 */}
                <div 
                  className={`bg-gray-100 ${
                    isFullscreen 
                      ? 'h-[calc(100vh-60px)] overflow-auto' 
                      : 'h-[600px] overflow-auto'
                  } flex items-start justify-center p-4`}
                >
                  {pdfError ? (
                    <div className="text-center p-8 bg-red-50 rounded-lg border border-red-200 max-w-md">
                      <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                      <p className="text-red-700 mb-4">{pdfError}</p>
                      <button
                        onClick={() => handlePdfView(letter.pdf_url)}
                        className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition text-sm"
                      >
                        새 창에서 열기
                      </button>
                    </div>
                  ) : (
                    <Document
                      file={letter.pdf_url}
                      onLoadSuccess={onDocumentLoadSuccess}
                      onLoadError={onDocumentLoadError}
                      loading={
                        <div className="flex flex-col items-center justify-center p-8">
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600 mb-4"></div>
                          <p className="text-gray-600 text-sm">PDF 로딩 중...</p>
                        </div>
                      }
                      error={
                        <div className="text-center p-8 bg-red-50 rounded-lg border border-red-200">
                          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                          <p className="text-red-700 mb-4">PDF를 불러올 수 없습니다.</p>
                          <button
                            onClick={() => handlePdfView(letter.pdf_url)}
                            className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition text-sm"
                          >
                            새 창에서 열기
                          </button>
                        </div>
                      }
                      options={{
                        cMapUrl: 'https://unpkg.com/pdfjs-dist@4.0.379/cmaps/',
                        cMapPacked: true,
                      }}
                    >
                      <Page
                        pageNumber={pageNumber}
                        scale={scale}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        className="shadow-lg"
                      />
                    </Document>
                  )}
                </div>
              </div>
            )}

            {/* 새 창에서 열기 버튼 */}
            <button
              onClick={() => handlePdfView(letter.pdf_url)}
              className="group w-full flex items-center justify-center px-6 py-4 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-700 rounded-lg hover:from-slate-100 hover:to-slate-200 transition-all shadow-sm hover:shadow-md border border-slate-200 mt-4"
            >
              <ExternalLink className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform" />
              <div className="text-left">
                <div className="font-semibold">새 창에서 PDF 열기</div>
                <div className="text-xs text-slate-600">전체 화면으로 보시려면 클릭하세요</div>
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
          <li>• 미리보기에서 페이지 이동, 확대/축소가 가능합니다.</li>
          <li>• 더 나은 열람을 위해 새 창에서 열기를 권장합니다.</li>
        </ul>
      </div>
    </div>
  );
}

export default PastoralLetterDetail;