// ============================================
// frontend/src/components/PostDetail.jsx (개선)
// ============================================
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from '../api/axios';
import API_ENDPOINTS from '../config/api';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Calendar, User, Eye, Edit, Trash2, MessageSquare } from 'lucide-react';

function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentContent, setCommentContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [commentLoading, setCommentLoading] = useState(false);

  useEffect(() => {
    fetchPost();
    fetchComments();
  }, [id]);

  const fetchPost = async () => {
    try {
      setLoading(true);
      const response = await axios.get(API_ENDPOINTS.board.detail(id));
      setPost(response.data);
      setError(null);
    } catch (err) {
      setError('게시글을 불러오는데 실패했습니다.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    try {
      const response = await axios.get(`/board/posts/${id}/comments/`);
      setComments(response.data.results || response.data);
    } catch (err) {
      console.error('댓글 로딩 실패:', err);
    }
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    
    if (!isAuthenticated) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }

    if (!commentContent.trim()) {
      alert('댓글 내용을 입력해주세요.');
      return;
    }

    try {
      setCommentLoading(true);
      await axios.post(`/board/posts/${id}/comments/`, {
        content: commentContent,
      });
      
      setCommentContent('');
      fetchComments();
      alert('댓글이 작성되었습니다.');
    } catch (err) {
      console.error('댓글 작성 실패:', err);
      if (err.response?.status === 403) {
        alert('⚠️ 관리자 승인 대기 중입니다. 승인 후 댓글 작성이 가능합니다.');
      } else {
        alert('댓글 작성에 실패했습니다.');
      }
    } finally {
      setCommentLoading(false);
    }
  };

  const handleCommentDelete = async (commentId) => {
    if (!window.confirm('댓글을 삭제하시겠습니까?')) return;

    try {
      await axios.delete(`/board/posts/${id}/comments/${commentId}/`);
      fetchComments();
      alert('댓글이 삭제되었습니다.');
    } catch (err) {
      console.error('댓글 삭제 실패:', err);
      alert('댓글 삭제에 실패했습니다.');
    }
  };

  const handleDelete = async () => {
    if (!isAuthenticated) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }

    if (window.confirm('정말 삭제하시겠습니까?')) {
      try {
        await axios.delete(API_ENDPOINTS.board.detail(id));
        alert('게시글이 삭제되었습니다.');
        navigate('/blog');
      } catch (err) {
        if (err.response?.status === 401) {
          alert('로그인이 필요합니다.');
          navigate('/login');
        } else {
          alert('삭제에 실패했습니다.');
        }
        console.error(err);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-center text-gray-600">게시글이 존재하지 않습니다.</p>
      </div>
    );
  }
  
  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* 뒤로가기 */}
      <Link 
        to="/blog" 
        className="inline-flex items-center text-gray-600 hover:text-neutral-700 mb-4 transition-colors group text-sm"
      >
        <ArrowLeft className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" />
        <span className="font-medium">목록으로</span>
      </Link>

      {/* 게시글 본문 */}
      <article className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200 mb-6">
        {/* 헤더 - Blog 스타일 적용 */}
        <div className="bg-gradient-to-r  from-cyan-700 to-neutral-800 p-5 text-white">
          <div className="flex justify-between items-start mb-3">
            <span className="inline-block bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium">
              게시글
            </span>
            
            {isAuthenticated && user?.username === post.author && (
              <div className="flex space-x-2">
                <button
                  onClick={() => navigate(`/edit/${id}`)}
                  className="p-1.5 bg-sky-100/30 backdrop-blur-sm rounded-lg hover:bg-white/40 transition-all"
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

          <h1 className="text-xl font-bold mb-4 text-gray-100  leading-tight">{post.title}</h1>

          <div className="flex flex-wrap gap-3 text-xs">
            <div className="flex items-center bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <User className="w-4 h-4 mr-1.5" />
              <span className="font-medium">{post.author}</span>
            </div>
            <div className="flex items-center bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <Calendar className="w-4 h-4 mr-1.5" />
              <span>
                {new Date(post.created_at).toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </span>
            </div>
            <div className="flex items-center bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <Eye className="w-4 h-4 mr-1.5" />
              <span>{post.view_count} 조회</span>
            </div>
          </div>
        </div>

        {/* 본문 */}
        <div className="p-6">
          <div className="prose max-w-none">
            <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-sm">
              {post.content}
            </p>
          </div>
        </div>
      </article>

      {/* 댓글 섹션 - Sermon 스타일 적용 */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 flex items-center">
            <MessageSquare className="w-5 h-5 mr-2 text-neutral-800" />
            댓글 <span className=" text-neutral-800 ml-2">{comments.length}</span>
          </h2>
        </div>

        {/* 댓글 작성 폼 */}
        {isAuthenticated ? (
          <form onSubmit={handleCommentSubmit} className="px-6 py-5 border-b border-gray-200 bg-gradient-to-br from-indigo-50/30 to-purple-50/30">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-700 to-neutral-800 flex items-center justify-center shadow-sm">
                  <span className="text-white font-semibold text-sm">
                    {user?.username?.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="flex-1">
                <textarea
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  placeholder="댓글을 작성하세요..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm"
                />
                <div className="mt-3 flex justify-between items-center">
                  <span className="text-xs text-gray-500">
                    {commentContent.length} / 1000자
                  </span>
                  <button
                    type="submit"
                    disabled={commentLoading || !commentContent.trim()}
                    className="px-5 py-2 bg-cyan-800 text-white  rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                  >
                    {commentLoading ? '작성 중...' : '댓글 작성'}
                  </button>
                </div>
              </div>
            </div>
          </form>
        ) : (
          <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-br from-amber-50/30 to-orange-50/30">
            <div className="flex items-center justify-center py-3">
              <p className="text-sm text-gray-600">
                댓글을 작성하려면{' '}
                <Link to="/login" className=" text-neutral-600 hover:text-neutral-700 font-medium underline">
                  로그인
                </Link>
                해주세요.
              </p>
            </div>
          </div>
        )}

        {/* 댓글 목록 */}
        <div className="divide-y divide-gray-200">
          {comments.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <MessageSquare className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 text-sm">첫 번째 댓글을 작성해보세요.</p>
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="px-6 py-5 hover:bg-gray-50 transition">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center shadow-sm">
                      <span className="text-white font-semibold text-sm">
                        {comment.author?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-gray-900 text-sm">{comment.author}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(comment.created_at).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      {isAuthenticated && user?.username === comment.author && (
                        <button
                          onClick={() => handleCommentDelete(comment.id)}
                          className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 hover:bg-red-50 rounded transition"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                    <p className="text-gray-700 whitespace-pre-wrap leading-relaxed text-sm">
                      {comment.content}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default PostDetail;