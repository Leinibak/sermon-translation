
// ============================================
// frontend/src/config/api.js (수정 버전)
// ============================================

const API_ENDPOINTS = {
  auth: {
    login: "/token/",
    refresh: "/token/refresh/",
    register: "/auth/register/", // 필요 시
  },
  board: {
    posts: "/board/posts/",
    detail: (id) => `/board/posts/${id}/`,
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
