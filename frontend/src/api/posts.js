// frontend/src/api/posts.js
import axiosInstance from "./axios";

export const getPosts = () => axiosInstance.get("/board/posts/");
export const getPostDetail = (id) => axiosInstance.get(`/board/posts/${id}/`);
export const createPost = (data) => axiosInstance.post("/board/posts/", data);
export const updatePost = (id, data) => axiosInstance.put(`/board/posts/${id}/`, data);
export const deletePost = (id) => axiosInstance.delete(`/board/posts/${id}/`);