// ============================================
// frontend/src/config/api.js (댓글 API 추가)
// ============================================

const API_ENDPOINTS = {
  auth: {
    login: "/token/",
    refresh: "/token/refresh/",
    register: "/auth/register/",
  },
  board: {
    posts: "/board/posts/",
    detail: (id) => `/board/posts/${id}/`,
    comments: (postId) => `/board/posts/${postId}/comments/`,
    commentDetail: (postId, commentId) => `/board/posts/${postId}/comments/${commentId}/`,
  },
  user: {
    profile: "/user/profile/",
    update: "/user/update/",
  },
  translation: {
    list: "/translation/",
    detail: (id) => `/translation/${id}/`,
  },
};

export default API_ENDPOINTS;