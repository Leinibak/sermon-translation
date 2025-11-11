// ============================================
// frontend/src/components/PostList.jsx
// (onSelect 제거, navigate 사용 버전)
// ============================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import API_ENDPOINTS from '../config/api';
import { useAuth } from '../contexts/AuthContext';

function PostList({ onCreate }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const response = await axios.get(API_ENDPOINTS.board.posts);
      setPosts(response.data.results || response.data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('게시글을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;

    try {
      await axios.delete(API_ENDPOINTS.board.detail(id));
      alert('게시글이 삭제되었습니다.');
      setPosts(posts.filter((p) => p.id !== id));
    } catch (err) {
      console.error(err);
      alert('게시글 삭제에 실패했습니다.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto mt-8 p-6 bg-white rounded-lg shadow-md w-full">
      {/* 상단 헤더 */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">📜 게시글 목록</h2>

        {isAuthenticated && (
          <button
            onClick={() => navigate('/create')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded"
          >
            새 글 작성
          </button>
        )}
      </div>

      {/* 게시글 목록 */}
      <div className="space-y-4">
        {posts.map((post) => (
          <div
            key={post.id}
            className="border border-gray-200 p-4 rounded-lg hover:bg-gray-50 transition cursor-pointer"
            onClick={() => navigate(`/post/${post.id}`)}
          >
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">
                {post.title}
              </h3>

              {isAuthenticated && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(post.id);
                  }}
                  className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                >
                  삭제
                </button>
              )}
            </div>

            <div className="mt-2 text-sm text-gray-500">
              작성자: {post.author} | 조회수: {post.view_count} | 작성일:{' '}
              {new Date(post.created_at).toLocaleDateString()}
            </div>
          </div>
        ))}

        {posts.length === 0 && !loading && (
          <p className="text-gray-400 text-center mt-6">
            게시글이 없습니다. 새 글을 작성해보세요.
          </p>
        )}

        {loading && <p className="text-gray-500 text-center mt-6">로딩중...</p>}
        {error && <p className="text-red-500 text-center mt-6">{error}</p>}
      </div>
    </div>
  );
}

export default PostList;
