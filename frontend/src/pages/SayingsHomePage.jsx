// ============================================================
// frontend/src/pages/SayingsHomePage.jsx
//
// 변경사항:
// - 슬라이드(SayingSlide) 만 남김
// - 하단 "더 탐색하기 / 말씀 찾기 / 4복음서 탐색 / 오늘의 말씀들" 섹션 전부 제거
// - 탐색 기능은 SectionBar 아이콘 탭으로 이동
// ============================================================

import React from 'react';
import SectionBar from '../components/JesusSayings/SectionBar';
import SayingSlide from '../components/JesusSayings/SayingSlide';

export default function SayingsHomePage() {
  return (
    <div style={{ minHeight: '100vh', background: '#FDFBF7' }}>
      <SectionBar />
      <SayingSlide />
    </div>
  );
}