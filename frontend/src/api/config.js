import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api",
  withCredentials: true, // CORS에서 쿠키/세션 필요 시
});

// --- ✅ 토큰 자동 설정 ---
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// --- ✅ 토큰 만료 시 자동 로그아웃 or 리프레시 토큰 처리 (선택사항) ---
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      console.warn("Access token expired or invalid");

      const refresh = localStorage.getItem("refresh_token");
      if (refresh) {
        try {
          // 새 토큰 발급
          const res = await axios.post(
            `${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api"}/token/refresh/`,
            { refresh }
          );

          const newAccess = res.data.access;
          localStorage.setItem("access_token", newAccess);
          error.config.headers.Authorization = `Bearer ${newAccess}`;

          // 요청 재시도
          return api.request(error.config);
        } catch (refreshError) {
          console.error("토큰 갱신 실패 → 로그아웃 처리");
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/login"; // 로그인 페이지로 이동
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;
