// ============================================================
// frontend/src/pages/SayingListPage.jsx
//
// 말씀 목록 페이지 — UX 개선
// 그리드 카드 → 집중형 리스트, 필터 UX 개선
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, X, ChevronRight, Filter } from 'lucide-react';
import SectionBar from '../components/JesusSayings/SectionBar';
import { getSayings, getThemes } from '../api/sayings';
import { THEME_COLORS, SIZE_LABELS } from '../constants/themes';
import { getThemeColor } from '../constants/themes';

const BOOKS = [
  { value: '',    label: '전체 복음서' },
  { value: 'MAT', label: '마태복음' },
  { value: 'MRK', label: '마가복음' },
  { value: 'LUK', label: '누가복음' },
  { value: 'JHN', label: '요한복음' },
];


// ── 말씀 리스트 아이템 ────────────────────────────────────
function SayingListItem({ saying }) {
  const [hovered, setHovered] = useState(false);
  const { id, reference, text_ko_krv, themes = [], size, occasion } = saying;
  const firstTheme = themes[0];
  const c = getThemeColor(firstTheme?.key);
  const preview = text_ko_krv?.length > 90 ? text_ko_krv.slice(0, 90) + '…' : text_ko_krv;

  return (
    <Link
      to={`/sayings/${id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'stretch', gap: 0,
        textDecoration: 'none',
        border: '1px solid',
        borderColor: hovered ? '#AFA9EC' : '#e9e4dc',
        borderRadius: '12px',
        overflow: 'hidden',
        background: hovered ? '#FDFBF7' : '#fff',
        transition: 'border-color 0.2s, background 0.2s',
      }}
    >
      {/* 좌측 컬러 악센트 바 */}
      <div style={{
        width: '4px', flexShrink: 0,
        background: hovered ? c.border : '#e9e4dc',
        transition: 'background 0.2s',
      }} />

      {/* 본문 */}
      <div style={{ flex: 1, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#3C3489' }}>
            {reference}
          </span>
          {occasion && (
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>— {occasion}</span>
          )}
          {size && (
            <span style={{
              fontSize: '11px', padding: '2px 7px', borderRadius: '999px',
              background: '#F1EFE8', color: '#888780', border: '1px solid #D3D1C7',
              marginLeft: 'auto',
            }}>
              {SIZE_LABELS[size] || size}
            </span>
          )}
        </div>
        <p style={{
          fontSize: '14px',
          fontFamily: "'Gowun Batang', serif",
          lineHeight: 1.85,
          color: '#1f2937',
          margin: '0 0 10px',
        }}>
          {preview}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {themes.slice(0, 3).map(t => {
            const tc = THEME_COLORS[t.key] ?? { bg: '#F1EFE8', text: '#444441' };
            return (
              <span key={t.key} style={{
                fontSize: '12px', fontWeight: 500,
                padding: '2px 8px', borderRadius: '999px',
                background: tc.bg, color: tc.text,
              }}>
                {t.name_ko}
              </span>
            );
          })}
        </div>
      </div>

      {/* 우측 화살표 */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '0 14px',
        color: hovered ? '#7F77DD' : '#d1d5db',
        transition: 'color 0.2s',
      }}>
        <ChevronRight size={16} />
      </div>
    </Link>
  );
}

// ── 메인 페이지 컴포넌트 ──────────────────────────────────
export default function SayingListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [book,     setBook]     = useState(searchParams.get('book')  ?? '');
  const [themeKey, setThemeKey] = useState(searchParams.get('theme') ?? '');
  const [search,   setSearch]   = useState(searchParams.get('q')     ?? '');
  const [inputVal, setInputVal] = useState(searchParams.get('q')     ?? '');
  const [sayings,  setSayings]  = useState([]);
  const [themes,   setThemes]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showMobileFilter, setShowMobileFilter] = useState(false);

  useEffect(() => {
    getThemes().then(d => setThemes(Array.isArray(d) ? d : []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (book)     params.book           = book;
    if (themeKey) params['themes__key'] = themeKey;
    if (search)   params.search         = search;
    const data = await getSayings(params);
    setSayings(Array.isArray(data) ? data : (data?.results ?? []));
    setLoading(false);
  }, [book, themeKey, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const p = {};
    if (book)     p.book  = book;
    if (themeKey) p.theme = themeKey;
    if (search)   p.q     = search;
    setSearchParams(p, { replace: true });
  }, [book, themeKey, search]);

  const hasFilter = book || themeKey || search;

  const resetFilters = () => {
    setBook(''); setThemeKey(''); setSearch(''); setInputVal('');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(inputVal);
  };

  // 활성 필터 레이블
  const activeFilterLabel = [
    book     ? BOOKS.find(b => b.value === book)?.label : null,
    themeKey ? themes.find(t => t.key === themeKey)?.name_ko : null,
    search   ? `"${search}"` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div style={{ minHeight: '100vh', background: '#FDFBF7' }}>
      <SectionBar />

      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', minHeight: 'calc(100vh - 108px)' }}>

        {/* ── 사이드바 (데스크탑) ── */}
        <aside style={{
          display: 'none',
          width: '220px',
          flexShrink: 0,
          borderRight: '1px solid #e9e4dc',
          padding: '28px 20px',
          background: '#fff',
        }}
          className="md-sidebar"
        >
          <style>{`
            @media (min-width: 768px) {
              .md-sidebar { display: block !important; }
              .mobile-filter-bar { display: none !important; }
            }
          `}</style>

          {/* 복음서 */}
          <div style={{ marginBottom: '28px' }}>
            <p style={{
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: '#9ca3af', marginBottom: '10px',
            }}>
              복음서
            </p>
            {BOOKS.map(b => (
              <button
                key={b.value}
                onClick={() => setBook(b.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  width: '100%', padding: '8px 10px', borderRadius: '8px',
                  fontSize: '13px', textAlign: 'left',
                  background: book === b.value ? '#EEEDFE' : 'transparent',
                  color: book === b.value ? '#3C3489' : '#6b7280',
                  fontWeight: book === b.value ? 600 : 400,
                  border: 'none', cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                  background: book === b.value ? '#3C3489' : '#d1d5db',
                }} />
                {b.label}
              </button>
            ))}
          </div>

          {/* 주제 */}
          <div>
            <p style={{
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: '#9ca3af', marginBottom: '10px',
            }}>
              주제
            </p>
            <button
              onClick={() => setThemeKey('')}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                width: '100%', padding: '8px 10px', borderRadius: '8px',
                fontSize: '13px', textAlign: 'left',
                background: themeKey === '' ? '#EEEDFE' : 'transparent',
                color: themeKey === '' ? '#3C3489' : '#6b7280',
                fontWeight: themeKey === '' ? 600 : 400,
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                background: themeKey === '' ? '#3C3489' : '#d1d5db',
              }} />
              전체 주제
            </button>
            {themes.map(t => {
              const c = THEME_COLORS[t.key] ?? { bg: '#F1EFE8', text: '#444441' };
              return (
                <button
                  key={t.key}
                  onClick={() => setThemeKey(t.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    width: '100%', padding: '8px 10px', borderRadius: '8px',
                    fontSize: '13px', textAlign: 'left',
                    background: themeKey === t.key ? c.bg : 'transparent',
                    color: themeKey === t.key ? c.text : '#6b7280',
                    fontWeight: themeKey === t.key ? 600 : 400,
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  <span style={{
                    width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                    background: themeKey === t.key ? c.text : '#d1d5db',
                  }} />
                  <span style={{ flex: 1 }}>{t.name_ko}</span>
                  <span style={{ fontSize: '11px', color: '#d1d5db', fontVariantNumeric: 'tabular-nums' }}>
                    {t.saying_count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 필터 초기화 */}
          {hasFilter && (
            <button
              onClick={resetFilters}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                marginTop: '20px', fontSize: '12px', color: '#9ca3af',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                fontFamily: 'inherit',
              }}
            >
              <X size={12} />
              필터 초기화
            </button>
          )}
        </aside>

        {/* ── 메인 콘텐츠 ── */}
        <main style={{ flex: 1, padding: '24px 24px 60px' }}>

          {/* 모바일 필터 바 */}
          <div className="mobile-filter-bar" style={{
            display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap',
          }}>
            <button
              onClick={() => setShowMobileFilter(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', borderRadius: '8px', fontSize: '13px',
                border: '1px solid #e9e4dc', background: '#fff', cursor: 'pointer',
                color: '#6b7280', fontFamily: 'inherit',
              }}
            >
              <Filter size={13} />
              필터
              {hasFilter && (
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: '#7F77DD', display: 'inline-block',
                }} />
              )}
            </button>
            {hasFilter && (
              <button
                onClick={resetFilters}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
                  border: '1px solid #e9e4dc', background: '#fff', cursor: 'pointer',
                  color: '#9ca3af', fontFamily: 'inherit',
                }}
              >
                <X size={12} />
                초기화
              </button>
            )}
          </div>

          {/* 모바일 필터 패널 */}
          {showMobileFilter && (
            <div style={{
              background: '#fff', border: '1px solid #e9e4dc', borderRadius: '12px',
              padding: '16px', marginBottom: '16px',
            }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', marginBottom: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>복음서</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                {BOOKS.map(b => (
                  <button key={b.value} onClick={() => setBook(b.value)} style={{
                    padding: '6px 14px', borderRadius: '999px', fontSize: '12px',
                    background: book === b.value ? '#EEEDFE' : '#f9fafb',
                    color: book === b.value ? '#3C3489' : '#6b7280',
                    border: book === b.value ? '1px solid #AFA9EC' : '1px solid #e5e7eb',
                    cursor: 'pointer', fontWeight: book === b.value ? 600 : 400,
                    fontFamily: 'inherit',
                  }}>{b.label}</button>
                ))}
              </div>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', marginBottom: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>주제</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <button onClick={() => setThemeKey('')} style={{
                  padding: '6px 14px', borderRadius: '999px', fontSize: '12px',
                  background: themeKey === '' ? '#EEEDFE' : '#f9fafb',
                  color: themeKey === '' ? '#3C3489' : '#6b7280',
                  border: themeKey === '' ? '1px solid #AFA9EC' : '1px solid #e5e7eb',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>전체</button>
                {themes.map(t => {
                  const c = THEME_COLORS[t.key] ?? { bg: '#F1EFE8', text: '#444441', border: '#D3D1C7' };
                  return (
                    <button key={t.key} onClick={() => setThemeKey(t.key)} style={{
                      padding: '6px 14px', borderRadius: '999px', fontSize: '12px',
                      background: themeKey === t.key ? c.bg : '#f9fafb',
                      color: themeKey === t.key ? c.text : '#6b7280',
                      border: themeKey === t.key ? `1px solid ${c.border}` : '1px solid #e5e7eb',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>{t.name_ko}</button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 검색 */}
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{
                position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                color: '#9ca3af',
              }} />
              <input
                type="text"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                placeholder="말씀 검색... 예) 생명, 포도나무, 담대"
                style={{
                  width: '100%', paddingLeft: '36px', paddingRight: '16px',
                  height: '40px', borderRadius: '10px',
                  border: '1px solid #e9e4dc', background: '#fff',
                  fontSize: '13px', color: '#1f2937',
                  fontFamily: "'Gowun Batang', serif",
                  outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#AFA9EC'}
                onBlur={e => e.target.style.borderColor = '#e9e4dc'}
              />
              {inputVal && (
                <button
                  type="button"
                  onClick={() => { setInputVal(''); setSearch(''); }}
                  style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af',
                    display: 'flex', padding: 0,
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              type="submit"
              style={{
                padding: '0 20px', height: '40px', borderRadius: '10px',
                fontSize: '13px', fontWeight: 600, color: '#fff',
                background: '#3C3489', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >
              검색
            </button>
          </form>

          {/* 현재 필터 상태 */}
          {hasFilter && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              marginBottom: '16px', padding: '10px 14px',
              background: '#EEEDFE', borderRadius: '8px',
              border: '1px solid #AFA9EC',
            }}>
              <span style={{ fontSize: '12px', color: '#534AB7', fontWeight: 500 }}>
                필터: {activeFilterLabel}
              </span>
              <button
                onClick={resetFilters}
                style={{
                  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '3px',
                  fontSize: '11px', color: '#7F77DD',
                  background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <X size={11} />
                지우기
              </button>
            </div>
          )}

          {/* 결과 수 */}
          <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '12px' }}>
            {loading ? '불러오는 중...' : `${sayings.length}개 말씀`}
          </p>

          {/* 말씀 목록 */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '60px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                border: '2px solid #e5e7eb', borderTopColor: '#7F77DD',
                animation: 'spin 0.7s linear infinite',
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : sayings.length === 0 ? (
            <div style={{
              textAlign: 'center', paddingTop: '60px',
              color: '#9ca3af', fontSize: '14px',
              fontFamily: "'Gowun Batang', serif",
            }}>
              <p style={{ marginBottom: '8px' }}>검색 결과가 없습니다.</p>
              <button
                onClick={resetFilters}
                style={{
                  fontSize: '13px', color: '#534AB7',
                  background: 'none', border: 'none', cursor: 'pointer',
                  textDecoration: 'underline', fontFamily: 'inherit',
                }}
              >
                필터 초기화
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {sayings.map(s => (
                <SayingListItem key={s.id} saying={s} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}