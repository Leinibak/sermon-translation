// ============================================
// frontend/src/components/PostDetail.jsx (개선 버전)
// ============================================
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from '../api/axios';
import API_ENDPOINTS from '../config/api';
import { useAuth } from '../contexts/AuthContext';

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

   // 게시글 조회
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

  // 댓글 조회
  const fetchComments = async () => {
    try {
      const response = await axios.get(`/board/posts/${id}/comments/`);
      setComments(response.data.results || response.data);
    } catch (err) {
      console.error('댓글 로딩 실패:', err);
    }
  };

  // 댓글 작성
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
      alert('댓글 작성에 실패했습니다.');
    } finally {
      setCommentLoading(false);
    }
  };

  // 댓글 삭제
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

  // 게시글 삭제
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 게시글 본문 */}
      <article className="bg-white rounded-lg shadow-sm overflow-hidden mb-8">
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
          
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{post.title}</h1>
          
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-1.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>{post.author}</span>
              </div>
              
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-1.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{new Date(post.created_at).toLocaleDateString('ko-KR', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}</span>
              </div>
              
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-1.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>{post.view_count}</span>
              </div>
            </div>

            {/* 🔥 수정/삭제 버튼 — 오직 작성자에게만 보여줌 */}
            {isAuthenticated && user?.username === post.author && (
              <div className="flex space-x-2">
                <Link
                  to={`/edit/${post.id}`}
                  className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition"
                >
                  수정
                </Link>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded transition"
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 본문 */}
        <div className="px-8 py-8">
          <div className="prose max-w-none">
            <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-base">
              {post.content}
            </p>
          </div>
        </div>
      </article>

      {/* 댓글 섹션 */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            댓글 <span className="text-blue-600">{comments.length}</span>
          </h2>
        </div>

        {/* 댓글 작성 폼 */}
        {isAuthenticated ? (
          <form onSubmit={handleCommentSubmit} className="px-8 py-6 border-b border-gray-200 bg-gray-50">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-600 font-semibold text-sm">
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={commentLoading || !commentContent.trim()}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {commentLoading ? '작성 중...' : '댓글 작성'}
                  </button>
                </div>
              </div>
            </div>
          </form>
        ) : (
          <div className="px-8 py-6 border-b border-gray-200 bg-gray-50">
            <p className="text-center text-gray-600">
              댓글을 작성하려면{' '}
              <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
                로그인
              </Link>
              해주세요.
            </p>
          </div>
        )}

        {/* 댓글 목록 */}
        <div className="divide-y divide-gray-200">
          {comments.length === 0 ? (
            <div className="px-8 py-12 text-center">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-gray-500">첫 번째 댓글을 작성해보세요.</p>
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="px-8 py-6 hover:bg-gray-50 transition">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                      <span className="text-gray-600 font-semibold text-sm">
                        {comment.author?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-gray-900">{comment.author}</span>
                        <span className="text-sm text-gray-500">
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
                          className="text-sm text-red-600 hover:text-red-700"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                    <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
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