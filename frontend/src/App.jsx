import { useState } from "react";
import PostList from "./components/PostList";
import PostDetail from "./components/PostDetail";
import PostForm from "./components/PostForm";
import "./index.css";

export default function App() {
  const [page, setPage] = useState("list");
  const [selectedId, setSelectedId] = useState(null);
  const [editPost, setEditPost] = useState(null);

  const goList = () => {
    setPage("list");
    setSelectedId(null);
    setEditPost(null);
  };

  return (
    <div className="container">
      <h1>📝 웹 게시판</h1>

      {page === "create" || editPost ? (
        <PostForm post={editPost} onSuccess={goList} onCancel={goList} />
      ) : page === "detail" ? (
        <PostDetail
          id={selectedId}
          onBack={goList}
          onEdit={(p) => setEditPost(p)}
        />
      ) : (
        <PostList
          onSelect={(id) => {
            setSelectedId(id);
            setPage("detail");
          }}
          onCreate={() => setPage("create")}
        />
      )}
    </div>
  );
}
