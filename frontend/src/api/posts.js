// // frontend/src/api/posts.js
// import axiosInstance from "./axios";

// export const getPosts = () => axiosInstance.get("/board/posts/");
// export const getPostDetail = (id) => axiosInstance.get(`/board/posts/${id}/`);
// export const createPost = (data) => axiosInstance.post("/board/posts/", data);
// export const updatePost = (id, data) => axiosInstance.put(`/board/posts/${id}/`, data);
// export const deletePost = (id) => axiosInstance.delete(`/board/posts/${id}/`);

import axiosInstance from "./axios";

/**
 * 게시글 목록 가져오기
 * @param {object} params page, limit 등 서버 요구 쿼리
 */
export const getPosts = async (params = { page: 1, limit: 10 }) => {
  try {
    const response = await axiosInstance.get("/board/posts/", { params });
    return response.data;
  } catch (error) {
    console.error("❌ getPosts error:", error.response?.data || error.message);
    return null;
  }
};

/** 게시글 상세 */
export const getPostDetail = async (id) => {
  try {
    const response = await axiosInstance.get(`/board/posts/${id}/`);
    return response.data;
  } catch (error) {
    console.error("❌ getPostDetail error:", error.response?.data || error.message);
    return null;
  }
};

/** 게시글 생성 */
export const createPost = async (data) => {
  try {
    const response = await axiosInstance.post("/board/posts/", data);
    return response.data;
  } catch (error) {
    console.error("❌ createPost error:", error.response?.data || error.message);
    return null;
  }
};

/** 게시글 수정 */
export const updatePost = async (id, data) => {
  try {
    const response = await axiosInstance.put(`/board/posts/${id}/`, data);
    return response.data;
  } catch (error) {
    console.error("❌ updatePost error:", error.response?.data || error.message);
    return null;
  }
};

/** 게시글 삭제 */
export const deletePost = async (id) => {
  try {
    const response = await axiosInstance.delete(`/board/posts/${id}/`);
    return response.data;
  } catch (error) {
    console.error("❌ deletePost error:", error.response?.data || error.message);
    return null;
  }
};
