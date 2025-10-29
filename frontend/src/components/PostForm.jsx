import { useState, useEffect } from "react";
import { createPost, updatePost, getPost } from "../api/posts";

export default function PostForm({ post, onSuccess, onCancel }) {
  const [title, setTitle] = useState(post?.title || "");
  const [content, setContent] = useState(post?.content || "");
  const [author, setAuthor] = useState(post?.author || "");

  const handleSubmit = async () => {
    if (!title || !content || !author) {
      alert("모든 필드를 입력해주세요.");
      return;
    }

    if (post) {
      await updatePost(post.id, { title, content, author });
    } else {
      await createPost({ title, content, author });
    }

    onSuccess();
  };

  return (
    <div className="max-w-3xl mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      {/* 헤더 */}
      <h2 className="text-2xl font-bold text-gray-800 mb-6">
        {post ? "✏️ 게시글 수정" : "📝 게시글 작성"}
      </h2>

      {/* 입력 폼 */}
      <div className="space-y-4">
        <div>
          <label className="block text-gray-700 mb-1">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="제목을 입력하세요"
          />
        </div>

        <div>
          <label className="block text-gray-700 mb-1">내용</label>
          <textarea
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="내용을 입력하세요"
          />
        </div>

        <div>
          <label className="block text-gray-700 mb-1">작성자</label>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="작성자를 입력하세요"
          />
        </div>
      </div>

      {/* 버튼 그룹 */}
      <div className="flex justify-end space-x-2 mt-6">
        <button
          className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded shadow"
          onClick={onCancel}
        >
          취소
        </button>
        <button
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow"
          onClick={handleSubmit}
        >
          {post ? "수정 완료" : "등록"}
        </button>
      </div>
    </div>
  );
}
