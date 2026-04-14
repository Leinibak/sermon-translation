// ============================================================
// frontend/src/pages/BibleExplorerPage.jsx  (신규)
//
// 4복음서 드릴다운 탐색기를 독립 페이지로 분리.
// Route: /sayings/bible-explorer
// ============================================================

import React from 'react';
import SectionBar from '../components/JesusSayings/SectionBar';
import BibleExplorer from '../components/JesusSayings/BibleExplorer';

export default function BibleExplorerPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#FDFBF7' }}>
      <SectionBar />

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px 60px' }}>
        {/* 헤더 */}
        <div style={{ marginBottom: '28px' }}>
          <p style={{
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#9ca3af',
            marginBottom: '4px',
          }}>
            주님의 음성
          </p>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937', marginBottom: '6px' }}>
            4복음서 탐색
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            fontFamily: "'Gowun Batang', serif",
            lineHeight: 1.7,
          }}>
            복음서 → 장 → 말씀으로 직접 찾아가는 드릴다운 탐색기입니다.
          </p>
        </div>

        {/* BibleExplorer 컴포넌트 */}
        <BibleExplorer />
      </div>
    </div>
  );
}