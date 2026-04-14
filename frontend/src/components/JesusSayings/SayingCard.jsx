// frontend/src/components/JesusSayings/SayingCard.jsx

import React from 'react';
import { Link } from 'react-router-dom';

const THEME_COLORS = {
  i_am:         { bg: '#EEEDFE', text: '#3C3489' },
  salvation:    { bg: '#E1F5EE', text: '#085041' },
  kingdom:      { bg: '#FAEEDA', text: '#633806' },
  love:         { bg: '#FAECE7', text: '#712B13' },
  prayer:       { bg: '#FBEAF0', text: '#72243E' },
  faith:        { bg: '#E6F1FB', text: '#0C447C' },
  holy_spirit:  { bg: '#EAF3DE', text: '#27500A' },
  discipleship: { bg: '#F1EFE8', text: '#444441' },
  cross:        { bg: '#FAECE7', text: '#712B13' },
  resurrection: { bg: '#EEEDFE', text: '#3C3489' },
  judgment:     { bg: '#FCEBEB', text: '#791F1F' },
  forgiveness:  { bg: '#E1F5EE', text: '#085041' },
  healing:      { bg: '#EAF3DE', text: '#27500A' },
  identity:     { bg: '#FAEEDA', text: '#633806' },
};

const SIZE_LABELS = { S: '단문', M: '중문', L: '장문' };

export default function SayingCard({ saying }) {
  const { id, reference, text_ko_krv, themes = [], size, has_parallel } = saying;

  // 본문 미리보기 — 60자 초과 시 자름
  const preview = text_ko_krv?.length > 80
    ? text_ko_krv.slice(0, 80) + '…'
    : text_ko_krv;

  return (
    <Link
      to={`/sayings/${id}`}
      className="block rounded-xl border p-4 transition-colors"
      style={{ borderColor: '#e5e7eb', background: '#fff' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#AFA9EC'}
      onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e7eb'}
    >
      {/* 구절 참조 + 크기 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium" style={{ color: '#534AB7' }}>
          {reference}
        </span>
        {size && (
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: '#F1EFE8', color: '#5F5E5A' }}
          >
            {SIZE_LABELS[size] ?? size}
          </span>
        )}
      </div>

      {/* 본문 */}
      <p
        className="leading-relaxed text-gray-800 mb-3"
        style={{ fontFamily: "'Gowun Batang', serif", fontSize: '0.9rem', lineHeight: 1.75 }}
      >
        {preview}
      </p>

      {/* 하단: 태그 + 병행 여부 + 화살표 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {themes.slice(0, 3).map(t => {
            const c = THEME_COLORS[t.key] ?? { bg: '#F1EFE8', text: '#444441' };
            return (
              <span
                key={t.key}
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: c.bg, color: c.text }}
              >
                {t.name_ko}
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {has_parallel && (
            <span className="text-xs" style={{ color: '#9ca3af' }}>병행구절 있음</span>
          )}
          <span className="text-gray-300 text-sm">→</span>
        </div>
      </div>
    </Link>
  );
}