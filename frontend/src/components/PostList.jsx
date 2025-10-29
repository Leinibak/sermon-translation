import { useEffect, useState } from "react";
import { getPosts, deletePost } from "../api/posts";

export default function PostList({ onSelect, onCreate }) {
  const [posts, setPosts] = useState([]);

  const fetchPosts = async () => {
    const res = await getPosts();
    setPosts(res.data.results || res.data);
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleDelete = async (id) => {
    if (window.confirm("정말 삭제하시겠습니까?")) {
      await deletePost(id);
      fetchPosts();
    }
  };

  return (
    <div className="max-w-3xl mx-auto mt-8 p-6 bg-white rounded-lg shadow-md w-full">
      {/* 상단 헤더 */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">📜 게시글 목록</h2>

        {/* 새 글 작성 버튼 — 오른쪽 끝 */}
        <button
          onClick={onCreate}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded"
        >
          새 글 작성
        </button>
      </div>

      {/* 게시글 목록 */}
      <div className="space-y-4">
        {posts.map((post) => (
          <div
            key={post.id}
            className="border border-gray-200 p-4 rounded-lg hover:bg-gray-50 transition"
          >
            {/* 제목 + 삭제 버튼 한 줄 */}
            <div className="flex justify-between items-center">
              <h3
                className="text-lg font-semibold text-gray-900 cursor-pointer"
                onClick={() => onSelect(post.id)}
              >
                {post.title}
              </h3>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(post.id);
                }}
                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
              >
                삭제
              </button>
            </div>

            {/* 작성 정보 */}
            <div className="mt-2 text-sm text-gray-500">
              작성자: {post.author} | 조회수: {post.view_count} | 작성일:{" "}
              {new Date(post.created_at).toLocaleDateString()}
            </div>
          </div>
        ))}

        {/* 게시글 없을 때 */}
        {posts.length === 0 && (
          <p className="text-gray-400 text-center mt-6">
            게시글이 없습니다. 새 글을 작성해보세요.
          </p>
        )}
      </div>
    </div>
  );
}
