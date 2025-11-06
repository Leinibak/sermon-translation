// import axios from "axios";

// const API_URL = import.meta.env.VITE_API_URL|| 'http://localhost:8000/api/board/posts/';

// export const getPosts = () => axios.get(API_URL);
// export const getPost = (id) => axios.get(`${API_URL}${id}/`);
// export const createPost = (data) => axios.post(API_URL, data);
// export const updatePost = (id, data) => axios.put(`${API_URL}${id}/`, data);
// export const deletePost = (id) => axios.delete(`${API_URL}${id}/`);

import api from "./config";
// 게시글 목록 조회
export const getPosts = () => api.get("/board/posts/");
// 게시글 단건 조회
export const getPost = (id) => api.get(`/board/posts/${id}/`);
// 게시글 작성
export const createPost = (data) => api.post("/board/posts/", data);
// 게시글 수정
export const updatePost = (id, data) => api.put(`/board/posts/${id}/`, data);
// 게시글 삭제
export const deletePost = (id) => api.delete(`/board/posts/${id}/`);