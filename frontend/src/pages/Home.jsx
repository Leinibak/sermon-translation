// ============================================================
// frontend/src/pages/Home.jsx  (기존 파일 완전 교체)
// ============================================================
// 기존 Home.jsx 의 최근설교·블로그 섹션을 제거하고
// SayingSlide 컴포넌트만 렌더링합니다.
// HeroSection 임포트도 제거합니다.

import React from 'react';
import SayingSlide from '../components/JesusSayings/SayingSlide';
import SectionBar  from '../components/JesusSayings/SectionBar';

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <SectionBar />
      <SayingSlide />
    </div>
  );
}
