// frontend/src/components/JesusSayings/BibleExplorer.jsx
//
// 수정 내용:
//   복음서 선택 시 장별 마킹을 /api/sayings/chapter-summary/?book=XXX 로 가져옴
//   (기존: getSayings({book}) → PAGE_SIZE=10 으로 10개만 반환되어 마킹 누락)

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link }            from 'react-router-dom';
import { ChevronRight, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { getSayings, getSaying }      from '../../api/sayings';
import {
  BOOK_COLORS, BOOK_LABELS, BOOK_ORDER, BOOK_CHAPTERS,
  THEME_COLORS, SIZE_LABELS, getBookColor,
} from '../../constants/themes';
import axiosInstance from '../../api/axios';

// ── 복음서 메타 ───────────────────────────────────────────────
const BOOKS = BOOK_ORDER.map(code => ({
  code,
  name:     BOOK_LABELS[code],
  chapters: BOOK_CHAPTERS[code],
  color:    BOOK_COLORS[code],
}));

// ── 장별 요약 전용 API (pagination 우회) ──────────────────────
async function getChapterSummary(book) {
  try {
    const res = await axiosInstance.get('/sayings/chapter-summary/', { params: { book } });
    // 응답: { "1": 2, "3": 3, ... }  — key가 문자열이므로 숫자로 변환
    const raw = res.data;
    const result = {};
    Object.entries(raw).forEach(([k, v]) => { result[Number(k)] = v; });
    return result;
  } catch (e) {
    console.error('getChapterSummary error:', e);
    return {};
  }
}

// ── 스크롤 후크 ───────────────────────────────────────────────
function useScrollTop(dep) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [dep]);
  return ref;
}

// ── 장 번호 그리드 ────────────────────────────────────────────
function ChapterGrid({ total, selected, hasSayings, onSelect, bookColor }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))',
      gap: '6px',
      padding: '14px',
    }}>
      {Array.from({ length: total }, (_, i) => i + 1).map(ch => {
        const active  = selected === ch;
        const hasMark = hasSayings[ch];
        return (
          <button
            key={ch}
            onClick={() => onSelect(ch)}
            style={{
              height: '40px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: active ? 600 : 400,
              border: '1px solid',
              borderColor: active ? bookColor.border : (hasMark ? `${bookColor.border}60` : '#e9e4dc'),
              background: active ? bookColor.bg : (hasMark ? `${bookColor.bg}50` : '#fff'),
              color: active ? bookColor.text : (hasMark ? bookColor.text : '#9ca3af'),
              cursor: 'pointer',
              transition: 'all 0.15s',
              position: 'relative',
              fontFamily: 'inherit',
            }}
          >
            {ch}
            {hasMark && !active && (
              <span style={{
                position: 'absolute', top: '4px', right: '4px',
                width: '4px', height: '4px', borderRadius: '50%',
                background: bookColor.border,
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── 말씀 리스트 아이템 ────────────────────────────────────────
function SayingItem({ saying, isSelected, onClick, bookColor }) {
  const [hov, setHov] = useState(false);
  const { reference, text_ko_krv, themes = [], size } = saying;
  const preview = text_ko_krv?.length > 70 ? text_ko_krv.slice(0, 70) + '…' : text_ko_krv;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '12px 14px',
        borderBottom: '1px solid #f3f4f6',
        cursor: 'pointer',
        background: isSelected ? bookColor.bg : (hov ? '#fafafa' : '#fff'),
        borderLeft: isSelected ? `3px solid ${bookColor.border}` : '3px solid transparent',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: bookColor.text }}>
          {reference}
        </span>
        {size && (
          <span style={{
            fontSize: '11px', padding: '1px 6px', borderRadius: '999px',
            background: '#F1EFE8', color: '#5F5E5A',
          }}>
            {SIZE_LABELS[size] ?? size}
          </span>
        )}
      </div>
      <p style={{
        fontSize: '13px', color: '#374151', lineHeight: 1.65, margin: '0 0 6px',
        fontFamily: "'Gowun Batang', serif",
      }}>
        {preview}
      </p>
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {themes.slice(0, 2).map(t => {
          const c = THEME_COLORS[t.key] ?? { bg: '#F1EFE8', text: '#444441' };
          return (
            <span
              key={t.key}
              style={{
                fontSize: '11px', padding: '1px 7px', borderRadius: '999px',
                background: c.bg, color: c.text, fontWeight: 500,
              }}
            >
              {t.name_ko}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── 말씀 상세 패널 ────────────────────────────────────────────
function DetailPanel({ saying, bookColor, onClose }) {
  const [trans,   setTrans]   = useState('krv');
  const [kwOpen,  setKwOpen]  = useState(true);
  const [parOpen, setParOpen] = useState(true);

  if (!saying) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column', gap: '10px',
        padding: '40px 20px', textAlign: 'center',
      }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%',
          border: '1px solid #e9e4dc',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <BookOpen size={16} style={{ color: '#d1d5db' }} />
        </div>
        <p style={{ fontSize: '14px', color: '#d1d5db', fontFamily: "'Gowun Batang', serif" }}>
          말씀을 선택하면 여기에 표시됩니다
        </p>
      </div>
    );
  }

  const bodyText = trans === 'krv'
    ? saying.text_ko_krv
    : (saying.text_ko_new || saying.text_ko_krv);

  const hasKeywords  = (saying.keywords ?? []).length > 0;
  const hasParallels = (saying.parallels ?? []).length > 0;
  const hasRelated   = (saying.related_sayings ?? []).length > 0;

  return (
    <div style={{ padding: '20px', overflowY: 'auto', height: '100%' }}>

      {/* 구절 참조 */}
      <p style={{ fontSize: '13px', fontWeight: 700, color: bookColor.text, marginBottom: '10px' }}>
        {saying.reference}
        {saying.occasion && (
          <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginLeft: '8px' }}>
            — {saying.occasion}
          </span>
        )}
      </p>

      {/* 번역 토글 */}
      <div style={{
        display: 'inline-flex', gap: '2px',
        background: '#f3f4f6', borderRadius: '8px', padding: '3px',
        marginBottom: '14px',
      }}>
        {['krv', 'new'].map(t => (
          <button
            key={t}
            onClick={() => setTrans(t)}
            style={{
              padding: '4px 11px', borderRadius: '6px', fontSize: '11px',
              fontWeight: trans === t ? 600 : 400,
              background: trans === t ? bookColor.bg : 'transparent',
              color: trans === t ? bookColor.text : '#9ca3af',
              border: trans === t ? `1px solid ${bookColor.border}` : '1px solid transparent',
              cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
            }}
          >
            {t === 'krv' ? '개역개정' : '새번역'}
          </button>
        ))}
      </div>

      {/* 본문 */}
      <div style={{
        borderTop: `2px solid ${bookColor.border}`,
        borderBottom: '1px solid #f3f4f6',
        padding: '14px 0 16px',
        marginBottom: '16px',
      }}>
        <p style={{
          fontFamily: "'Gowun Batang', serif",
          fontSize: 'clamp(15px, 2.0vw, 19px)',
          lineHeight: 1.95,
          color: '#1f2937',
          margin: 0,
        }}>
          "{bodyText}"
        </p>
      </div>

      {/* 배경 */}
      {saying.context_ko && (
        <div style={{ marginBottom: '16px' }}>
          <p style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#b0aaa0', marginBottom: '8px',
          }}>
            배경
          </p>
          <p style={{
            fontSize: '14px', color: '#4b5563', lineHeight: 1.85,
            fontFamily: "'Gowun Batang', serif", margin: 0,
          }}>
            {saying.context_ko}
          </p>
        </div>
      )}

      {/* 핵심 단어 */}
      {hasKeywords && (
        <div style={{ marginBottom: '16px' }}>
          <button
            onClick={() => setKwOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', background: 'none', border: 'none', cursor: 'pointer',
              padding: '0 0 8px', fontFamily: 'inherit',
            }}
          >
            <p style={{
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: '#b0aaa0', margin: 0,
            }}>
              핵심 단어
            </p>
            {kwOpen
              ? <ChevronUp size={12} style={{ color: '#d1d5db' }} />
              : <ChevronDown size={12} style={{ color: '#d1d5db' }} />}
          </button>
          {kwOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {saying.keywords.map((kw, i) => (
                <div
                  key={i}
                  style={{
                    padding: '10px 12px', borderRadius: '10px',
                    border: `1px solid ${bookColor.border}40`,
                    background: bookColor.bg,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: bookColor.text }}>
                      {kw.word}
                    </span>
                    <span style={{
                      fontSize: '12px', color: bookColor.text,
                      opacity: 0.7, fontStyle: 'italic', fontFamily: 'serif',
                    }}>
                      {kw.original}
                    </span>
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                      ({kw.transliteration})
                    </span>
                  </div>
                  <p style={{
                    fontSize: '12px', color: '#4b5563', lineHeight: 1.7,
                    fontFamily: "'Gowun Batang', serif", margin: 0,
                  }}>
                    {kw.meaning}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 병행구절 */}
      {hasParallels && (
        <div style={{ marginBottom: '16px' }}>
          <button
            onClick={() => setParOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', background: 'none', border: 'none', cursor: 'pointer',
              padding: '0 0 8px', fontFamily: 'inherit',
            }}
          >
            <p style={{
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: '#b0aaa0', margin: 0,
            }}>
              병행구절
            </p>
            {parOpen
              ? <ChevronUp size={12} style={{ color: '#d1d5db' }} />
              : <ChevronDown size={12} style={{ color: '#d1d5db' }} />}
          </button>
          {parOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {saying.parallels.map((p, i) => {
                const bc = BOOK_COLORS[p.book] ?? BOOK_COLORS.JHN;
                return (
                  <Link
                    key={i}
                    to={`/sayings/${p.id}`}
                    style={{
                      display: 'block', padding: '10px 12px', borderRadius: '10px',
                      border: `1px solid ${bc.border}60`,
                      background: '#fff', textDecoration: 'none',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: bc.text }}>
                        {BOOK_LABELS[p.book]}
                      </span>
                      <span style={{ fontSize: '10px', color: `${bc.text}80` }}>
                        {p.reference}
                      </span>
                    </div>
                    <p style={{
                      fontSize: '12px', color: '#4b5563', lineHeight: 1.65,
                      fontFamily: "'Gowun Batang', serif", margin: '0 0 4px',
                    }}>
                      {p.text_ko_krv?.slice(0, 80)}{p.text_ko_krv?.length > 80 ? '…' : ''}
                    </p>
                    <span style={{ fontSize: '11px', color: bc.text, display: 'flex', alignItems: 'center', gap: '2px' }}>
                      상세 보기 <ChevronRight size={10} />
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 관련 말씀 */}
      {hasRelated && (
        <div style={{ marginBottom: '16px' }}>
          <p style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#b0aaa0', marginBottom: '8px',
          }}>
            관련 말씀
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {saying.related_sayings.slice(0, 3).map((r, i) => (
              <Link
                key={i}
                to={`/sayings/${r.id}`}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  padding: '10px 12px', borderRadius: '10px',
                  border: '1px solid #f3f4f6', background: '#fff',
                  textDecoration: 'none', transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#e9e4dc'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#f3f4f6'}
              >
                <span style={{ fontSize: '11px', fontWeight: 700, color: bookColor.text, flexShrink: 0, marginTop: '1px' }}>
                  {r.reference}
                </span>
                <span style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.6, fontFamily: "'Gowun Batang', serif" }}>
                  {r.text_ko_krv}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 전체 보기 링크 */}
      <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #f3f4f6' }}>
        <Link
          to={`/sayings/${saying.id}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '10px 20px', borderRadius: '10px',
            fontSize: '13px', fontWeight: 600,
            background: bookColor.text, color: '#fff',
            textDecoration: 'none', transition: 'opacity 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          Lectio Divina로 깊이 묵상하기
          <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}


// ── 메인 컴포넌트 ─────────────────────────────────────────────
export default function BibleExplorer() {
  const [selBook,    setSelBook]    = useState('JHN');
  const [selChapter, setSelChapter] = useState(null);
  const [sayings,    setSayings]    = useState([]);
  const [selSaying,  setSelSaying]  = useState(null);
  const [loadingCh,  setLoadingCh]  = useState(false);
  const [chSummary,  setChSummary]  = useState({}); // { 3: 4, 14: 2, ... } 장별 말씀 수
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mStep, setMStep] = useState('book');

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const sayingListRef = useScrollTop(selChapter);
  const bookColor = BOOK_COLORS[selBook] ?? BOOK_COLORS.JHN;

  // ── ★ 핵심 수정: 복음서 선택 → chapter-summary 전용 API 호출 ──
  // 기존: getSayings({book}) → PAGE_SIZE=10 제한으로 10개만 반환
  // 수정: /api/sayings/chapter-summary/?book=XXX → pagination 없이 전체 장 통계
  useEffect(() => {
    if (!selBook) return;
    setSelChapter(null);
    setSayings([]);
    setSelSaying(null);
    setChSummary({});
    setLoadingSummary(true);

    getChapterSummary(selBook).then(summary => {
      setChSummary(summary);
      setLoadingSummary(false);
    });
  }, [selBook]);

  // ── 장 선택 → 말씀 목록 로드 (이 호출은 소수 결과라 pagination 무관) ──
  const handleChapterSelect = useCallback(async (ch) => {
    setSelChapter(ch);
    setSelSaying(null);
    setLoadingCh(true);
    if (isMobile) setMStep('saying');

    const data = await getSayings({ book: selBook, chapter: ch });
    const list  = Array.isArray(data) ? data : (data?.results ?? []);
    setSayings(list);
    setLoadingCh(false);
  }, [selBook, isMobile]);

  // ── 말씀 선택 ────────────────────────────────────────────────
  const handleSayingSelect = useCallback(async (saying) => {
    if (isMobile) setMStep('detail');
    const full = await getSaying(saying.id);
    setSelSaying(full ?? saying);
  }, [isMobile]);

  // ── 복음서 선택 버튼 ─────────────────────────────────────────
  const handleBookSelect = (code) => {
    setSelBook(code);
    if (isMobile) setMStep('chapter');
  };

  const totalChapters = BOOK_CHAPTERS[selBook] ?? 0;

  // ── 복음서 패널 말씀 수 표시 (현재 선택된 복음서만) ─────────
  const totalSayingsCount = Object.values(chSummary).reduce((a, c) => a + c, 0);

  // ============================================================
  // 데스크탑 레이아웃 (3단 split)
  // ============================================================
  if (!isMobile) {
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '180px 1fr 1fr',
          border: '1px solid #e9e4dc',
          borderRadius: '16px',
          overflow: 'hidden',
          background: '#fff',
          minHeight: '560px',
        }}>

          {/* ── 좌: 복음서 선택 ── */}
          <div style={{ borderRight: '1px solid #f3f4f6', background: '#FDFBF7' }}>
            <div style={{
              padding: '14px 16px 12px',
              borderBottom: '1px solid #f3f4f6',
            }}>
              <p style={{
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: '#b0aaa0', margin: 0,
              }}>
                복음서
              </p>
            </div>
            {BOOKS.map(b => {
              const active = selBook === b.code;
              // 각 복음서의 총 말씀 수: 현재 선택된 복음서만 실시간 표시
              const countLabel = active && totalSayingsCount > 0
                ? `${totalSayingsCount}개`
                : `${b.chapters}장`;
              return (
                <button
                  key={b.code}
                  onClick={() => handleBookSelect(b.code)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    width: '100%', padding: '13px 16px',
                    borderBottom: '1px solid #f3f4f6',
                    background: active ? b.color.bg : 'transparent',
                    border: 'none',
                    borderLeft: active ? `3px solid ${b.color.border}` : '3px solid transparent',
                    cursor: 'pointer', transition: 'all 0.15s',
                    fontFamily: 'inherit', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: b.color.border, flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: '14px', fontWeight: active ? 600 : 400,
                      color: active ? b.color.text : '#374151',
                      margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {b.name}
                    </p>
                    <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
                      {countLabel}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── 중: 장 선택 + 말씀 목록 ── */}
          <div style={{ borderRight: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #f3f4f6' }}>
              <p style={{
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: '#b0aaa0', margin: 0,
              }}>
                장 선택 — {BOOK_LABELS[selBook]}
              </p>
            </div>

            {/* 장 그리드 — summary 로딩 중엔 희미하게 */}
            <div style={{ opacity: loadingSummary ? 0.4 : 1, transition: 'opacity 0.3s' }}>
              <ChapterGrid
                total={totalChapters}
                selected={selChapter}
                hasSayings={chSummary}
                onSelect={handleChapterSelect}
                bookColor={bookColor}
              />
            </div>

            {/* 말씀 목록 */}
            {selChapter && (
              <>
                <div style={{
                  padding: '10px 14px 8px',
                  borderTop: '1px solid #f3f4f6',
                  borderBottom: '1px solid #f3f4f6',
                }}>
                  <p style={{
                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: '#b0aaa0', margin: 0,
                  }}>
                    {selChapter}장 말씀
                  </p>
                </div>
                <div ref={sayingListRef} style={{ overflowY: 'auto', flex: 1 }}>
                  {loadingCh ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                      <div style={{
                        width: '20px', height: '20px', borderRadius: '50%',
                        border: '2px solid #f3f4f6', borderTopColor: bookColor.border,
                        animation: 'spin 0.7s linear infinite',
                      }} />
                      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
                    </div>
                  ) : sayings.length === 0 ? (
                    <p style={{ padding: '20px 14px', fontSize: '13px', color: '#d1d5db', fontStyle: 'italic' }}>
                      이 장에 예수님 말씀 없음
                    </p>
                  ) : sayings.map((s) => (
                    <SayingItem
                      key={s.id}
                      saying={s}
                      isSelected={selSaying?.id === s.id}
                      onClick={() => handleSayingSelect(s)}
                      bookColor={bookColor}
                    />
                  ))}
                </div>
              </>
            )}

            {!selChapter && (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '20px',
              }}>
                <p style={{ fontSize: '13px', color: '#d1d5db', fontStyle: 'italic', textAlign: 'center' }}>
                  위에서 장을 선택하세요
                </p>
              </div>
            )}
          </div>

          {/* ── 우: 말씀 상세 ── */}
          <div style={{ overflowY: 'auto', maxHeight: '560px' }}>
            <DetailPanel
              saying={selSaying}
              bookColor={bookColor}
            />
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 모바일 레이아웃 (단계별 아코디언)
  // ============================================================
  return (
    <div style={{ padding: '0 16px' }}>
      <div style={{ border: '1px solid #e9e4dc', borderRadius: '16px', overflow: 'hidden', background: '#fff' }}>

        {/* 복음서 선택 */}
        <div>
          <button
            onClick={() => setMStep(mStep === 'book' ? 'chapter' : 'book')}
            style={{
              width: '100%', padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#FDFBF7', border: 'none', borderBottom: '1px solid #f3f4f6',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: bookColor.border }} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: bookColor.text }}>
                {BOOK_LABELS[selBook]}
              </span>
            </div>
            {mStep === 'book'
              ? <ChevronUp size={14} style={{ color: '#9ca3af' }} />
              : <ChevronDown size={14} style={{ color: '#9ca3af' }} />}
          </button>
          {mStep === 'book' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              {BOOKS.map(b => (
                <button
                  key={b.code}
                  onClick={() => handleBookSelect(b.code)}
                  style={{
                    padding: '14px', border: 'none', borderBottom: '1px solid #f3f4f6',
                    borderRight: b.code === 'MAT' || b.code === 'MRK' ? '1px solid #f3f4f6' : 'none',
                    background: selBook === b.code ? b.color.bg : '#fff',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  }}
                >
                  <p style={{
                    fontSize: '14px', fontWeight: selBook === b.code ? 600 : 400,
                    color: selBook === b.code ? b.color.text : '#374151', margin: 0,
                  }}>
                    {b.name}
                  </p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>
                    {b.chapters}장
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 장 선택 */}
        {(mStep === 'chapter' || mStep === 'saying' || mStep === 'detail') && (
          <div>
            <button
              onClick={() => setMStep('chapter')}
              style={{
                width: '100%', padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: mStep === 'chapter' ? '#FDFBF7' : '#fff',
                border: 'none', borderBottom: '1px solid #f3f4f6',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: '13px', color: '#374151' }}>
                {selChapter ? `${selChapter}장` : '장 선택'}
              </span>
              {mStep === 'chapter'
                ? <ChevronUp size={14} style={{ color: '#9ca3af' }} />
                : <ChevronDown size={14} style={{ color: '#9ca3af' }} />}
            </button>
            {mStep === 'chapter' && (
              <div style={{ opacity: loadingSummary ? 0.4 : 1, transition: 'opacity 0.3s' }}>
                <ChapterGrid
                  total={totalChapters}
                  selected={selChapter}
                  hasSayings={chSummary}
                  onSelect={handleChapterSelect}
                  bookColor={bookColor}
                />
              </div>
            )}
          </div>
        )}

        {/* 말씀 목록 */}
        {(mStep === 'saying' || mStep === 'detail') && selChapter && (
          <div>
            <button
              onClick={() => setMStep('saying')}
              style={{
                width: '100%', padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: mStep === 'saying' ? '#FDFBF7' : '#fff',
                border: 'none', borderBottom: '1px solid #f3f4f6',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: '13px', color: '#374151' }}>
                {selChapter}장 말씀 ({sayings.length}개)
              </span>
              {mStep === 'saying'
                ? <ChevronUp size={14} style={{ color: '#9ca3af' }} />
                : <ChevronDown size={14} style={{ color: '#9ca3af' }} />}
            </button>
            {mStep === 'saying' && (
              <div>
                {loadingCh ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '50%',
                      border: '2px solid #f3f4f6', borderTopColor: bookColor.border,
                      animation: 'spin 0.7s linear infinite',
                    }} />
                    <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
                  </div>
                ) : sayings.map((s) => (
                  <SayingItem
                    key={s.id}
                    saying={s}
                    isSelected={selSaying?.id === s.id}
                    onClick={() => handleSayingSelect(s)}
                    bookColor={bookColor}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* 상세 패널 */}
        {mStep === 'detail' && selSaying && (
          <div>
            <button
              onClick={() => setMStep('detail')}
              style={{
                width: '100%', padding: '12px 16px',
                display: 'flex', alignItems: 'center',
                background: '#FDFBF7',
                border: 'none', borderBottom: '1px solid #f3f4f6',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: bookColor.text }}>
                {selSaying.reference}
              </span>
            </button>
            <DetailPanel saying={selSaying} bookColor={bookColor} />
          </div>
        )}
      </div>
    </div>
  );
}