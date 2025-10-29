import { useEffect, useState } from "react";
import { getPost, deletePost } from "../api/posts";

export default function PostDetail({ id, onBack, onEdit }) {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);

  // 게시글 불러오기
  useEffect(() => {
    const fetchPost = async () => {
      try {
        const res = await getPost(id);
        // API 응답 구조에 따라 res.data 또는 res 사용
        const data = res.data || res;
        setPost(data);
        setLoading(false);
      } catch (err) {
        console.error(err);
        alert("게시글을 불러오는 중 오류가 발생했습니다.");
        onBack();
      }
    };
    fetchPost();
  }, [id, onBack]);

  // 삭제 처리
  const handleDelete = async () => {
    if (!post) return;
    if (window.confirm("정말 삭제하시겠습니까?")) {
      try {
        await deletePost(post.id);
        alert("게시글이 삭제되었습니다.");
        onBack();
      } catch (err) {
        console.error(err);
        alert("삭제 중 오류가 발생했습니다.");
      }
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto mt-8 p-6 bg-white rounded-lg shadow-md text-center text-gray-500">
        로딩 중...
      </div>
    );
  }

  // 실제 API 키 확인 후 필요 시 수정:
  const title = post.title || "제목 없음";
  const author = post.author || post.author_name || "작성자 없음";
  const createdAt = post.created_at
    ? new Date(post.created_at).toLocaleString()
    : "날짜 없음";
  const viewCount = post.view_count ?? 0;
  const content = post.content || post.body || "내용 없음";

  return (
    <div className="max-w-3xl mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      {/* 상단 헤더 */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
        <div className="flex space-x-2">
          <button
            className="bg-yellow-400 hover:bg-yellow-500 text-white px-4 py-1 rounded shadow"
            onClick={() => onEdit(post)}
          >
            수정
          </button>
          <button
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-1 rounded shadow"
            onClick={handleDelete}
          >
            삭제
          </button>
        </div>
      </div>

      {/* 메타 정보 */}
      <p className="text-sm text-gray-500 mb-4">
        작성자: <span className="font-medium">{author}</span> | 작성일:{" "}
        <span className="font-medium">{createdAt}</span> | 조회수:{" "}
        <span className="font-medium">{viewCount}</span>
      </p>

      {/* 본문 */}
      <div className="prose max-w-full mb-6 text-gray-700 whitespace-pre-wrap">
        {content}
      </div>

      {/* 뒤로가기 버튼 */}
      <div className="flex justify-end">
        <button
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow"
          onClick={onBack}
        >
          목록으로
        </button>
      </div>
    </div>
  );
}
