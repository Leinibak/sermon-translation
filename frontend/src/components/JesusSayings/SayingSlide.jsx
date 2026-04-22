// ============================================================
// frontend/src/components/JesusSayings/SayingSlide.jsx
//
// ✅ 2025-04 수정:
//   - SLIDE_DURATION: 22 → 33초 (1.5배)
//   - 화살표 레이아웃 전면 개선:
//     · ResizeObserver를 ref 콜백 방식으로 변경 → 마운트 즉시 정확한 너비 감지
//     · 슬라이드 너비 > 600px: 화살표를 flex 좌우 컬럼에 배치 (텍스트와 절대 겹치지 않음)
//     · 슬라이드 너비 ≤ 600px: 화살표를 말씀 아래 가운데로 배치
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { getSlideSayings } from '../../api/sayings';
import { SLIDE_THEME, getSlideTheme } from '../../constants/themes';

const variants = {
  enter: (dir) => ({ opacity: 0, x: dir > 0 ? 60 : -60 }),
  center: { opacity: 1, x: 0 },
  exit: (dir) => ({ opacity: 0, x: dir > 0 ? -60 : 60 }),
};
const transition = { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] };

const FALLBACK = [{
  id: 0,
  reference: '요한복음 3:16',
  text_ko_krv: '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라',
  text_ko_new: '하나님이 세상을 이처럼 사랑하셔서, 외아들을 주셨으니, 이는 그를 믿는 사람마다 멸망하지 않고 영생을 얻게 하려 하심이다.',
  context_ko: '니고데모와의 대화 중, 하나님의 구원 계획 전체를 한 문장에 담으신 말씀입니다.',
  keywords: [{ word: '독생자', original: 'μονογενῆ', transliteration: '모노게네', meaning: '유일하게 낳은 자. 동일 본질의 유일한 아들' }],
  themes: [{ key: 'salvation', name_ko: '영생 / 구원' }],
  occasion: '니고데모와의 대화',
}];

function ProgressBar({ duration, active }) {
  return (
    <div style={{ height: '2px', background: 'rgba(255,255,255,0.15)', borderRadius: '1px', overflow: 'hidden' }}>
      {active && (
        <motion.div
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration, ease: 'linear' }}
          style={{ height: '100%', background: 'rgba(255,255,255,0.7)', borderRadius: '1px' }}
        />
      )}
      {!active && <div style={{ width: '0%', height: '100%' }} />}
    </div>
  );
}

const CTX_TABS = [
  { key: 'context', label: '배경' },
  { key: 'keyword', label: '핵심 단어' },
];

const MAX_W = '860px';

// 이 너비 이하에서 화살표를 말씀 아래 가운데로 이동
const ARROW_BOTTOM_BP = 600;

const ARROW_BTN_STYLE = {
  width: '36px', height: '36px', borderRadius: '50%',
  background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color: 'rgba(255,255,255,0.80)', transition: 'background 0.2s',
  flexShrink: 0,
};

function ArrowBtn({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={ARROW_BTN_STYLE}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
    >
      {children}
    </button>
  );
}

export default function SayingSlide() {
  const [sayings, setSayings] = useState([]);
  const [current, setCurrent] = useState(0);
  const [dir, setDir]         = useState(1);
  const [loading, setLoading] = useState(true);
  const [ctxTab, setCtxTab]   = useState('context');
  const [paused, setPaused]   = useState(false);
  const [trans, setTrans]     = useState('krv');

  // ✅ null로 초기화: 마운트 전에는 판단 보류
  const [slideWidth, setSlideWidth] = useState(null);
  // ✅ ref 콜백 방식: loading 끝난 후 DOM에 붙는 순간 즉시 observer 등록
  const roRef = useRef(null);
  const slideRef = useCallback((node) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (!node) return;
    // 즉시 현재 너비 반영
    setSlideWidth(node.getBoundingClientRect().width);
    // 이후 크기 변화 실시간 감지
    const ro = new ResizeObserver(entries => {
      setSlideWidth(entries[0].contentRect.width);
    });
    ro.observe(node);
    roRef.current = ro;
  }, []); // 빈 deps: 함수 자체는 한 번만 생성, node 교체 시 자동 재실행

  const autoKey = useRef(0);
  const SLIDE_DURATION = 33; // ✅ 22 → 33초 (1.5배)

  useEffect(() => {
    (async () => {
      const data = await getSlideSayings();
      setSayings(data?.length > 0 ? data : FALLBACK);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (sayings.length <= 1 || paused) return;
    const t = setTimeout(() => {
      setDir(1);
      setCurrent(p => (p + 1) % sayings.length);
      setCtxTab('context');
    }, SLIDE_DURATION * 1000);
    return () => clearTimeout(t);
  }, [current, sayings.length, paused]);

  const goPrev = useCallback(() => {
    setDir(-1);
    setCurrent(p => (p - 1 + sayings.length) % sayings.length);
    setCtxTab('context');
    autoKey.current++;
  }, [sayings.length]);

  const goNext = useCallback(() => {
    setDir(1);
    setCurrent(p => (p + 1) % sayings.length);
    setCtxTab('context');
    autoKey.current++;
  }, [sayings.length]);

  const goTo = (i) => {
    setDir(i > current ? 1 : -1);
    setCurrent(i);
    setCtxTab('context');
    autoKey.current++;
  };

  if (loading) {
    return (
      <div style={{ background: '#1A1535', minHeight: '480px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.15)', borderTopColor: '#7F77DD', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const saying = sayings[current];
  const theme = getSlideTheme(saying);
  const bodyText = trans === 'krv' ? saying.text_ko_krv : (saying.text_ko_new || saying.text_ko_krv);

  // ✅ slideWidth가 null이면 아직 측정 전 → inline 모드로 렌더 (측정 직후 자동 교정)
  const measured = slideWidth !== null;
  const arrowsInline = sayings.length > 1 && (!measured || slideWidth > ARROW_BOTTOM_BP);
  const arrowsBottom = sayings.length > 1 && measured && slideWidth <= ARROW_BOTTOM_BP;

  return (
    <div
      ref={slideRef}
      style={{ width: '100%', fontFamily: "'Gowun Batang', serif" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* ── 메인 슬라이드 영역 ── */}
      <div style={{
        position: 'relative',
        background: theme.bg,
        minHeight: '480px',
        overflow: 'hidden',
        transition: 'background 0.8s ease',
      }}>
        {/* 배경 광원 */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse 60% 50% at 30% 40%, ${theme.accent}18 0%, transparent 70%)`,
          transition: 'background 0.8s ease',
        }} />

        {/* 진행 바 */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          padding: '16px 24px 0',
        }}>
          <div style={{ maxWidth: MAX_W, margin: '0 auto', display: 'flex', gap: '4px' }}>
            {sayings.map((_, i) => (
              <div key={i} style={{ flex: 1, cursor: 'pointer' }} onClick={() => goTo(i)}>
                <ProgressBar
                  key={`${i}-${current}-${autoKey.current}`}
                  duration={SLIDE_DURATION}
                  active={i === current && !paused}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ✅ 슬라이드 콘텐츠 + 좌우 화살표를 하나의 flex row로 묶음
            arrowsInline: [← 화살표] [콘텐츠] [화살표 →]  → 절대 겹치지 않음
            arrowsBottom: [     콘텐츠     ]
                          [  ← 화살표 →   ]               → 좁은 화면용 */}
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={`slide-${current}`}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={transition}
            style={{
              minHeight: '480px',
              display: 'flex',
              alignItems: 'center',
              padding: arrowsInline ? '60px 8px 80px' : '60px 16px 80px',
            }}
          >
            {/* 왼쪽 화살표 (inline 모드) */}
            {arrowsInline && (
              <div style={{ flexShrink: 0, paddingRight: '8px' }}>
                <ArrowBtn onClick={goPrev}><ChevronLeft size={16} /></ArrowBtn>
              </div>
            )}

            {/* 콘텐츠 */}
            <div style={{ maxWidth: MAX_W, width: '100%', margin: '0 auto' }}>

              {/* 번역 토글 + 상황 배지 */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                marginBottom: '20px', flexWrap: 'wrap',
              }}>
                <div style={{
                  display: 'inline-flex', gap: '2px',
                  background: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '3px',
                }}>
                  {['krv', 'new'].map(t => (
                    <button
                      key={t}
                      onClick={() => setTrans(t)}
                      style={{
                        padding: '4px 12px', borderRadius: '6px',
                        fontSize: '12px', fontWeight: trans === t ? 600 : 400,
                        background: trans === t ? theme.accent : 'transparent',
                        color: trans === t ? '#fff' : 'rgba(255,255,255,0.85)',
                        border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                        fontFamily: 'inherit',
                      }}
                    >
                      {t === 'krv' ? '개역개정' : '새번역'}
                    </button>
                  ))}
                </div>
                {saying.occasion && (
                  <span style={{
                    fontSize: '12px', padding: '4px 10px', borderRadius: '999px',
                    background: theme.tag, color: theme.textAccent,
                    border: `1px solid ${theme.accent}40`,
                  }}>
                    {saying.occasion}
                  </span>
                )}
              </div>

              {/* 말씀 본문 */}
              <p style={{
                fontFamily: "'Gowun Batang', serif",
                fontSize: 'clamp(20px, 2.4vw, 28px)',
                lineHeight: 2.0,
                color: '#fff',
                margin: '0 0 28px',
                letterSpacing: '0.01em',
              }}>
                "{bodyText}"
              </p>

              {/* 성경 참조 + 주제 태그 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '16px', fontWeight: 600, color: theme.textAccent }}>
                  — {saying.reference}
                </span>
                {(saying.themes ?? []).slice(0, 2).map(t => (
                  <span key={t.key} style={{
                    fontSize: '12px', padding: '3px 10px', borderRadius: '999px',
                    background: theme.tag, color: theme.textAccent,
                    border: `1px solid ${theme.accent}40`,
                  }}>
                    {t.name_ko}
                  </span>
                ))}
              </div>

              {/* 화살표 (bottom 모드: 좁은 화면) */}
              {arrowsBottom && (
                <div style={{
                  display: 'flex', justifyContent: 'center', gap: '16px',
                  marginTop: '32px',
                }}>
                  <ArrowBtn onClick={goPrev}><ChevronLeft size={16} /></ArrowBtn>
                  <ArrowBtn onClick={goNext}><ChevronRight size={16} /></ArrowBtn>
                </div>
              )}
            </div>

            {/* 오른쪽 화살표 (inline 모드) */}
            {arrowsInline && (
              <div style={{ flexShrink: 0, paddingLeft: '8px' }}>
                <ArrowBtn onClick={goNext}><ChevronRight size={16} /></ArrowBtn>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* 이 말씀 깊이 보기 버튼 */}
        {saying.id > 0 && (
          <div style={{ position: 'absolute', bottom: '24px', right: '24px', zIndex: 10 }}>
            <Link
              to={`/sayings/${saying.id}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '10px 20px', borderRadius: '10px',
                fontSize: '13px', fontWeight: 600, color: '#fff',
                background: theme.accent, textDecoration: 'none', transition: 'opacity 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              이 말씀 깊이 보기
              <ArrowRight size={13} />
            </Link>
          </div>
        )}
      </div>

      {/* ── 컨텍스트 패널 (배경/핵심단어) ── */}
      <div style={{ background: '#FDFBF7', borderBottom: '1px solid #e9e4dc' }}>
        <div style={{ maxWidth: MAX_W, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #e9e4dc' }}>
            {CTX_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setCtxTab(tab.key)}
                style={{
                  padding: '14px 20px',
                  fontSize: '14px', fontWeight: ctxTab === tab.key ? 600 : 400,
                  color: ctxTab === tab.key ? '#3C3489' : '#9ca3af',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  borderBottom: ctxTab === tab.key ? '2px solid #3C3489' : '2px solid transparent',
                  marginBottom: '-1px', transition: 'color 0.2s',
                  fontFamily: "'Gowun Batang', serif",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`ctx-${current}-${ctxTab}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              style={{ padding: '20px 0 24px' }}
            >
              {ctxTab === 'context' && (
                <p style={{
                  fontSize: '15px', fontFamily: "'Gowun Batang', serif",
                  lineHeight: 1.9, color: '#4b5563', margin: 0,
                }}>
                  {saying.context_ko || '배경 설명이 준비 중입니다.'}
                </p>
              )}

              {ctxTab === 'keyword' && (
                (saying.keywords ?? []).length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {saying.keywords.map((kw, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start',
                        padding: '14px 16px', background: '#fff',
                        border: '1px solid #e9e4dc', borderRadius: '10px',
                      }}>
                        <div style={{ flexShrink: 0, minWidth: '120px' }}>
                          <p style={{ fontSize: '16px', fontWeight: 700, color: '#3C3489', marginBottom: '2px' }}>{kw.word}</p>
                          <p style={{ fontSize: '13px', color: '#7F77DD', fontStyle: 'italic', marginBottom: '1px' }}>{kw.original}</p>
                          <p style={{ fontSize: '12px', color: '#9ca3af' }}>{kw.transliteration}</p>
                        </div>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                          <p style={{ fontSize: '14px', lineHeight: 1.8, color: '#374151', fontFamily: "'Gowun Batang', serif", margin: 0 }}>
                            {kw.meaning}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: '#9ca3af', fontFamily: "'Gowun Batang', serif" }}>
                    원어 해설이 준비 중입니다.
                  </p>
                )
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ── 하단 CTA 바 ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e9e4dc' }}>
        <div style={{
          maxWidth: MAX_W, margin: '0 auto', padding: '14px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '12px', flexWrap: 'wrap',
        }}>
          <p style={{ fontSize: '14px', color: '#6b7280', fontFamily: "'Gowun Batang', serif", margin: 0 }}>
            오늘 말씀을 더 깊이 탐구해 보세요
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Link
              to="/sayings/list"
              style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px',
                color: '#534AB7', border: '1px solid #AFA9EC', background: '#EEEDFE',
                textDecoration: 'none', fontFamily: 'inherit',
              }}
            >
              전체 말씀 탐색
            </Link>
            {saying.id > 0 && (
              <Link
                to={`/sayings/${saying.id}/meditate`}
                style={{
                  padding: '8px 16px', borderRadius: '8px', fontSize: '13px',
                  color: '#fff', background: '#3C3489', border: 'none',
                  textDecoration: 'none', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}
              >
                묵상 시작하기 <ArrowRight size={13} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}