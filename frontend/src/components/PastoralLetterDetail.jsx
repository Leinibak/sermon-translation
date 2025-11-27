import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import { 
  ArrowLeft, Calendar, User, Eye, 
  ExternalLink, Edit, Trash2, FileText, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';

// PDF.js 워커를 CDN으로 지정
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

function PastoralLetterDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.is_staff || user?.is_superuser;

  const [letter, setLetter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const containerRef = useRef(null);
  const [pageWidth, setPageWidth] = useState(600);

  useEffect(() => {
    fetchLetter();
  }, [id]);

  // 화면 크기에 따라 PDF 가로 폭 조절
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setPageWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

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

  const handlePdfDownload = (url) => {
    if (!url) {
      alert('PDF 파일이 없습니다.');
      return;
    }
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pastoral_letter.pdf';
    link.click();
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

  const onLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
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

          {/* PDF 미리보기 */}
          <div className="border-t pt-6 pb-16 relative" ref={containerRef}>
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
              <span className="w-1 h-5 bg-slate-600 rounded-full mr-2"></span>
              목회서신 미리보기
            </h3>

            {letter.pdf_url && (
              <div className="flex justify-center relative">
                <div className="w-full max-w-full max-h-[80vh] overflow-y-auto border border-gray-200 rounded-lg relative">
                  <Document file={letter.pdf_url} onLoadSuccess={onLoadSuccess}>
                    <Page
                      pageNumber={pageNumber}
                      scale={scale}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      className="-m-12" // 여백 줄임
                    />
                  </Document>

                  {/* 확대/축소 버튼: 오른쪽 상단 */}
                  <div className="absolute top-2 right-2 flex flex-col gap-2 z-20">
                    <button
                      onClick={() => setScale(prev => Math.min(prev + 0.1, 3))}
                      className="w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-100 transition text-lg font-bold"
                    >
                      +
                    </button>
                    <button
                      onClick={() => setScale(prev => Math.max(prev - 0.1, 0.5))}
                      className="w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-100 transition text-lg font-bold"
                    >
                      -
                    </button>
                  </div>
                </div>

                {/* 좌우 페이지 버튼 */}
                {numPages > 1 && (
                  <>
                    <button
                      onClick={() => setPageNumber(pageNumber - 1)}
                      disabled={pageNumber <= 1}
                      className="absolute top-1/2 left-2 -translate-y-1/2 px-3 py-3 bg-gray-200 rounded-full hover:bg-gray-300 disabled:opacity-50 transition-colors shadow-md z-10"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>

                    <button
                      onClick={() => setPageNumber(pageNumber + 1)}
                      disabled={pageNumber >= numPages}
                      className="absolute top-1/2 right-2 -translate-y-1/2 px-3 py-3 bg-gray-200 rounded-full hover:bg-gray-300 disabled:opacity-50 transition-colors shadow-md z-10"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>

                    <span className="absolute top-2 right-1/2 translate-x-1/2 bg-white/80 px-3 py-1 rounded-lg text-sm font-medium shadow">
                      {pageNumber} / {numPages}
                    </span>
                  </>
                )}
              </div>
            )}

            {/* PDF 다운로드 버튼 */}
            <button
              onClick={() => handlePdfDownload(letter.pdf_url)}
              className="group w-full flex items-center justify-center px-6 py-4 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-700 rounded-lg hover:from-slate-100 hover:to-slate-200 transition-all shadow-sm hover:shadow-md border border-slate-200 mt-4"
            >
              <ExternalLink className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform" />
              <div className="text-left">
                <div className="font-semibold">PDF 다운로드</div>
                <div className="text-xs text-slate-600">PDF 파일을 다운로드합니다</div>
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
