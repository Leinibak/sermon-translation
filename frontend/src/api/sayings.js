// frontend/src/api/sayings.js
import axiosInstance from './axios';

// ── 말씀 목록 ─────────────────────────────────────────────
// params: { book, chapter, size, themes__key, season, audience, search, ordering }
export const getSayings = async (params = {}) => {
  try {
    const res = await axiosInstance.get('/sayings/', { params });
    return res.data;
  } catch (e) {
    console.error('getSayings error:', e);
    return null;
  }
};

// ── 말씀 상세 (병행구절·관련말씀·키워드 포함) ──────────────
export const getSaying = async (id) => {
  try {
    const res = await axiosInstance.get(`/sayings/${id}/`);
    return res.data;
  } catch (e) {
    console.error('getSaying error:', e);
    return null;
  }
};

// ── 홈 슬라이드용 오늘의 3개 말씀 ─────────────────────────
export const getSlideSayings = async () => {
  try {
    const res = await axiosInstance.get('/sayings/slide/');
    return res.data;
  } catch (e) {
    console.error('getSlideSayings error:', e);
    return null;
  }
};

// ── 복음서별 말씀 수 통계 ──────────────────────────────────
export const getBookStats = async () => {
  try {
    const res = await axiosInstance.get('/sayings/books/');
    return res.data;
  } catch (e) {
    console.error('getBookStats error:', e);
    return null;
  }
};

// ── 주제 목록 ─────────────────────────────────────────────
export const getThemes = async () => {
  try {
    const res = await axiosInstance.get('/sayings/themes/');
    const data = res.data;
    return Array.isArray(data) ? data : (data?.results ?? []);
  } catch (e) {
    console.error('getThemes error:', e);
    return [];   // null 대신 빈 배열 반환
  }
};

// ── 주제별 말씀 목록 ───────────────────────────────────────
export const getSayingsByTheme = async (key) => {
  try {
    const res = await axiosInstance.get(`/sayings/themes/${key}/sayings/`);
    return res.data;
  } catch (e) {
    console.error('getSayingsByTheme error:', e);
    return null;
  }
};

// ── 병행구절 그룹 목록 ─────────────────────────────────────
export const getParallelGroups = async () => {
  try {
    const res = await axiosInstance.get('/sayings/parallels/');
    return res.data;
  } catch (e) {
    console.error('getParallelGroups error:', e);
    return null;
  }
};

// ── 병행구절 그룹 상세 ─────────────────────────────────────
export const getParallelGroup = async (id) => {
  try {
    const res = await axiosInstance.get(`/sayings/parallels/${id}/`);
    return res.data;
  } catch (e) {
    console.error('getParallelGroup error:', e);
    return null;
  }
};

// ── 묵상 노트 목록 (인증 필요) ─────────────────────────────
export const getMeditations = async () => {
  try {
    const res = await axiosInstance.get('/sayings/meditations/');
    return res.data;
  } catch (e) {
    console.error('getMeditations error:', e);
    return null;
  }
};

// ── 특정 말씀의 내 묵상 ────────────────────────────────────
export const getMeditationBySaying = async (sayingId) => {
  try {
    const res = await axiosInstance.get(`/sayings/meditations/by-saying/${sayingId}/`);
    return res.data;
  } catch (e) {
    console.error('getMeditationBySaying error:', e);
    return null;
  }
};

// ── 묵상 작성 ─────────────────────────────────────────────
export const createMeditation = async (data) => {
  try {
    const res = await axiosInstance.post('/sayings/meditations/', data);
    return res.data;
  } catch (e) {
    console.error('createMeditation error:', e);
    return null;
  }
};

// ── 묵상 수정 ─────────────────────────────────────────────
export const updateMeditation = async (id, data) => {
  try {
    const res = await axiosInstance.put(`/sayings/meditations/${id}/`, data);
    return res.data;
  } catch (e) {
    console.error('updateMeditation error:', e);
    return null;
  }
};

// ── 묵상 삭제 ─────────────────────────────────────────────
export const deleteMeditation = async (id) => {
  try {
    await axiosInstance.delete(`/sayings/meditations/${id}/`);
    return true;
  } catch (e) {
    console.error('deleteMeditation error:', e);
    return false;
  }
};