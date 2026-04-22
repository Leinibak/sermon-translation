// ============================================================
// frontend/src/pages/SayingsSubPages.jsx (전면 개편)
//
// MeditationPage — 달력 뷰 / 목록 뷰 전환
// ThemePage, ParallelPage — 기존 유지
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { BookOpen, Lock, ChevronRight, ChevronLeft, Edit3, Trash2, Calendar, List } from 'lucide-react';
import SectionBar from '../components/JesusSayings/SectionBar';
import { getThemes, getParallelGroups, getParallelGroup, getMeditations, deleteMeditation } from '../api/sayings';
import { useAuth } from '../contexts/AuthContext';
import {
  SLP_STEPS,
  parseMeditationContent,
  hasStepContent,
  getMeditationPreview,
  formatDate,
  formatDateShort,
  getDateKey,
} from '../utils/meditation';

// ══════════════════════════════════════════════════════════
// 공통 스타일 토큰
// ══════════════════════════════════════════════════════════
const BG = '#FDFBF7';
const BORDER = '#e9e4dc';
const PURPLE = '#3C3489';
const PURPLE_LIGHT = '#EEEDFE';
const PURPLE_MID = '#AFA9EC';

// ══════════════════════════════════════════════════════════
// CalendarPanel — 달력 + 최근 목록
// ══════════════════════════════════════════════════════════
function CalendarPanel({ meditations, selectedDate, onSelectDate }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  // 묵상 있는 날짜 Set
  const meditationDates = new Set(
    meditations.map(m => getDateKey(m.date || m.created_at))
  );

  // 달력 그리드 생성
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const makeDateKey = (d) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  // 최근 5개
  const recent = [...meditations]
    .sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at))
    .slice(0, 5);

  return (
    <div style={{
      borderRight: `1px solid ${BORDER}`,
      background: '#fff',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* 달력 */}
      <div style={{ padding: '20px 20px 0' }}>
        {/* 월 네비 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <button onClick={prevMonth} style={arrowBtnStyle}>‹</button>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937' }}>
            {viewYear}년 {viewMonth + 1}월
          </span>
          <button onClick={nextMonth} style={arrowBtnStyle}>›</button>
        </div>

        {/* 요일 헤더 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', textAlign: 'center', marginBottom: '4px' }}>
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <div key={d} style={{
              fontSize: '10px', fontWeight: 700, color: i === 0 ? '#f87171' : i === 6 ? '#60a5fa' : '#9ca3af',
              paddingBottom: '6px',
            }}>{d}</div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px' }}>
          {cells.map((day, idx) => {
            if (!day) return <div key={`e-${idx}`} />;
            const key = makeDateKey(day);
            const hasMed = meditationDates.has(key);
            const isSelected = selectedDate === key;
            const isToday = key === todayKey;
            const isSun = idx % 7 === 0;
            const isSat = idx % 7 === 6;
            return (
              <button
                key={key}
                onClick={() => hasMed && onSelectDate(key)}
                style={{
                  aspectRatio: '1',
                  borderRadius: '8px',
                  border: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '2px',
                  cursor: hasMed ? 'pointer' : 'default',
                  background: isSelected ? PURPLE : isToday && !isSelected ? PURPLE_LIGHT : 'transparent',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (hasMed && !isSelected) e.currentTarget.style.background = '#f3f0eb'; }}
                onMouseLeave={e => { if (hasMed && !isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{
                  fontSize: '12px',
                  fontWeight: hasMed || isToday ? 700 : 400,
                  color: isSelected ? '#fff'
                    : hasMed ? PURPLE
                    : isSun ? '#fca5a5'
                    : isSat ? '#93c5fd'
                    : '#6b7280',
                }}>
                  {day}
                </span>
                {hasMed && (
                  <div style={{
                    width: '4px', height: '4px', borderRadius: '50%',
                    background: isSelected ? 'rgba(255,255,255,0.7)' : PURPLE_MID,
                  }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 최근 묵상 목록 */}
      <div style={{ padding: '20px', flex: 1 }}>
        <div style={{
          fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: '#9ca3af', marginBottom: '10px',
        }}>
          최근 묵상
        </div>
        {recent.map(m => {
          const dateKey = getDateKey(m.date || m.created_at);
          const parsed = parseMeditationContent(m.content);
          const ref = m.saying?.reference || m.saying_reference || parsed._reference || '말씀';
          const isSelected = selectedDate === dateKey;
          return (
            <button
              key={m.id}
              onClick={() => onSelectDate(dateKey)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                padding: '8px 10px', borderRadius: '8px', border: 'none',
                background: isSelected ? PURPLE_LIGHT : 'transparent',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f3f0eb'; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontSize: '11px', color: '#9ca3af', minWidth: '32px' }}>
                {formatDateShort(m.date || m.created_at)}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: isSelected ? PURPLE : '#374151', flex: 1 }}>
                {ref}
              </span>
              <span style={{ fontSize: '10px', color: PURPLE_MID }}>›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const arrowBtnStyle = {
  width: '26px', height: '26px', borderRadius: '6px',
  border: `1px solid ${BORDER}`, background: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', fontSize: '14px', color: '#6b7280', fontFamily: 'inherit',
};

// ══════════════════════════════════════════════════════════
// CalendarPreview — 달력 뷰 우측 미리보기
// ══════════════════════════════════════════════════════════
function CalendarPreview({ meditation, onDelete, navigate }) {
  if (!meditation) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100%', gap: '10px', color: '#c9c2b8',
      }}>
        <div style={{ fontSize: '32px' }}>📖</div>
        <p style={{ fontSize: '13px', fontFamily: "'Gowun Batang', serif" }}>
          날짜를 선택하면 묵상을 볼 수 있습니다
        </p>
      </div>
    );
  }

  const parsed = parseMeditationContent(meditation.content);
  const ref = meditation.saying?.reference || meditation.saying_reference || parsed._reference || '말씀';
  const sayingText = meditation.saying?.text_ko_krv || '';
  const sayingId = meditation.saying?.id || meditation.saying;

  // 작성된 첫 두 단계만 미리보기
  const filledSteps = SLP_STEPS.filter(s => hasStepContent(parsed, s.key)).slice(0, 2);

  return (
    <div>
      <div style={{
        fontSize: '12px', color: '#9ca3af', marginBottom: '16px',
      }}>
        {/* 날짜는 부모에서 전달 */}
      </div>
      <div style={{
        background: '#fff', border: `1px solid ${BORDER}`,
        borderRadius: '14px', overflow: 'hidden',
      }}>
        {/* 말씀 헤더 */}
        <div style={{ padding: '14px 20px', background: PURPLE_LIGHT, borderBottom: `1px solid ${PURPLE_MID}30` }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: PURPLE, marginBottom: '6px' }}>{ref}</div>
          {sayingText && (
            <div style={{
              fontSize: '13px', fontFamily: "'Gowun Batang', serif",
              color: '#1f2937', lineHeight: 1.8,
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {sayingText}
            </div>
          )}
        </div>

        {/* 단계 미리보기 */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filledSteps.map(step => {
            const firstField = step.fields.find(f => (parsed[f.id] || '').trim());
            if (!firstField) return null;
            return (
              <div key={step.key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>{step.icon}</span>
                <div>
                  <div style={{
                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: '#9ca3af', marginBottom: '3px',
                  }}>
                    {step.roman} · {step.label.split(' ').slice(0, 3).join(' ')}
                  </div>
                  <div style={{
                    fontSize: '13px', fontFamily: "'Gowun Batang', serif",
                    color: '#4b5563', lineHeight: 1.7,
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {parsed[firstField.id]}
                  </div>
                </div>
              </div>
            );
          })}
          {filledSteps.length === 0 && (
            <p style={{ fontSize: '13px', color: '#9ca3af', fontFamily: "'Gowun Batang', serif" }}>
              작성된 내용이 없습니다.
            </p>
          )}
        </div>

        {/* 액션 버튼 */}
        <div style={{
          padding: '12px 20px', borderTop: `1px solid #f3f0eb`,
          display: 'flex', gap: '8px', justifyContent: 'flex-end',
        }}>
          <button
            onClick={() => onDelete(meditation.id)}
            style={{ ...btnOutlineStyle, color: '#e05c5c', borderColor: '#fca5a5' }}
          >
            삭제
          </button>
          <button
            onClick={() => navigate(`/sayings/meditations/${meditation.id}`)}
            style={btnPrimaryStyle}
          >
            전체 보기 →
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// MeditationCard — 목록 뷰 카드
// ══════════════════════════════════════════════════════════
function MeditationCard({ meditation, onDelete, navigate }) {
  const [hovered, setHovered] = useState(false);
  const parsed = parseMeditationContent(meditation.content);
  const preview = getMeditationPreview(parsed);
  const ref = meditation.saying?.reference || meditation.saying_reference || parsed._reference || '말씀';
  const dateStr = formatDate(meditation.date || meditation.created_at);
  const dayStr = (() => {
    const d = new Date(meditation.date || meditation.created_at);
    return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  })();

  return (
    <div
      onClick={() => navigate(`/sayings/meditations/${meditation.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff',
        border: `1px solid ${hovered ? PURPLE_MID : BORDER}`,
        borderRadius: '12px', padding: '16px 20px',
        marginBottom: '10px', cursor: 'pointer',
        display: 'flex', gap: '16px', alignItems: 'flex-start',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: hovered ? '0 2px 12px rgba(60,52,137,0.06)' : 'none',
      }}
    >
      {/* 날짜 */}
      <div style={{ minWidth: '40px', paddingTop: '2px', textAlign: 'center' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: PURPLE }}>{dateStr.slice(5)}</div>
        <div style={{ fontSize: '10px', color: '#9ca3af' }}>{dayStr}</div>
      </div>

      {/* 본문 */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: PURPLE, marginBottom: '5px' }}>{ref}</div>
        {preview && (
          <div style={{
            fontSize: '13px', fontFamily: "'Gowun Batang', serif",
            color: '#6b7280', lineHeight: 1.7, marginBottom: '10px',
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {preview}
          </div>
        )}
        {/* 단계 칩 */}
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {SLP_STEPS.map(step => {
            const done = hasStepContent(parsed, step.key);
            return (
              <span key={step.key} style={{
                fontSize: '11px', padding: '2px 8px', borderRadius: '99px',
                background: done ? PURPLE_LIGHT : '#f3f0eb',
                color: done ? PURPLE : '#9ca3af',
              }}>
                {step.icon} {step.roman}
              </span>
            );
          })}
        </div>
      </div>

      {/* 삭제 버튼 */}
      <button
        onClick={e => { e.stopPropagation(); onDelete(meditation.id); }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#d1d5db', padding: '2px', fontFamily: 'inherit',
          flexShrink: 0, fontSize: '12px',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#fca5a5'}
        onMouseLeave={e => e.currentTarget.style.color = '#d1d5db'}
        title="삭제"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// 버튼 스타일
const btnOutlineStyle = {
  padding: '6px 14px', borderRadius: '7px', fontSize: '12px',
  border: `1px solid ${BORDER}`, background: '#fff',
  color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit',
};
const btnPrimaryStyle = {
  padding: '6px 14px', borderRadius: '7px', fontSize: '12px',
  border: 'none', background: PURPLE, color: '#fff',
  cursor: 'pointer', fontFamily: 'inherit',
};

// ══════════════════════════════════════════════════════════
// MeditationPage — 메인
// ══════════════════════════════════════════════════════════
export function MeditationPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [meditations, setMeditations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'list'
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    getMeditations().then(d => {
      const list = Array.isArray(d) ? d : (d?.results ?? []);
      // 날짜 내림차순 정렬
      list.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));
      setMeditations(list);
      // 가장 최근 날짜를 기본 선택
      if (list.length > 0) {
        setSelectedDate(getDateKey(list[0].date || list[0].created_at));
      }
      setLoading(false);
    });
  }, [isAuthenticated]);

  const handleDelete = async (id) => {
    if (!window.confirm('이 묵상을 삭제하시겠습니까?')) return;
    const ok = await deleteMeditation(id);
    if (ok) setMeditations(m => m.filter(x => x.id !== id));
  };

  // 선택된 날의 묵상 찾기
  const selectedMeditation = meditations.find(m =>
    getDateKey(m.date || m.created_at) === selectedDate
  );

  // 월별 그룹 (목록 뷰용)
  const groupedByMonth = meditations.reduce((acc, m) => {
    const d = new Date(m.date || m.created_at);
    const key = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  // ── 비로그인
  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: '100vh', background: BG }}>
        <SectionBar />
        <div style={{ maxWidth: '480px', margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
          <Lock size={32} style={{ color: PURPLE_MID, marginBottom: '16px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', marginBottom: '8px' }}>
            내 묵상 노트
          </h2>
          <p style={{
            fontSize: '14px', fontFamily: "'Gowun Batang', serif",
            color: '#6b7280', lineHeight: 1.8, marginBottom: '24px',
          }}>
            묵상 노트는 로그인 후 사용할 수 있습니다.
          </p>
          <Link
            to="/login"
            state={{ from: location.pathname }}
            style={{
              display: 'inline-block', padding: '10px 28px',
              borderRadius: '10px', fontSize: '14px', fontWeight: 600,
              color: '#fff', background: PURPLE, textDecoration: 'none',
            }}
          >
            로그인하기
          </Link>
        </div>
      </div>
    );
  }

  // ── 로딩
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: BG }}>
        <SectionBar />
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '80px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%',
            border: '2px solid #e5e7eb', borderTopColor: PURPLE_MID,
            animation: 'spin 0.7s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ── 빈 상태
  if (meditations.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: BG }}>
        <SectionBar />
        <div style={{ maxWidth: '480px', margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
          <BookOpen size={32} style={{ color: PURPLE_MID, marginBottom: '16px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', marginBottom: '8px' }}>
            아직 기록된 묵상이 없습니다
          </h2>
          <p style={{
            fontSize: '14px', fontFamily: "'Gowun Batang', serif",
            color: '#6b7280', lineHeight: 1.8, marginBottom: '24px',
          }}>
            말씀을 읽고 첫 묵상을 남겨보세요.
          </p>
          <Link
            to="/sayings"
            style={{
              display: 'inline-block', padding: '10px 28px',
              borderRadius: '10px', fontSize: '14px', fontWeight: 600,
              color: '#fff', background: PURPLE, textDecoration: 'none',
            }}
          >
            말씀 탐색하기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <SectionBar />

      {/* 페이지 헤더 */}
      <div style={{
        maxWidth: '1100px', margin: '0 auto',
        padding: '28px 28px 20px',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '12px',
      }}>
        <div>
          <p style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: '#9ca3af', marginBottom: '5px',
          }}>
            나의 기록
          </p>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#1f2937', marginBottom: '4px' }}>
            내 묵상 노트
          </h1>
          <p style={{ fontSize: '13px', color: '#9ca3af' }}>
            총 {meditations.length}개의 묵상
          </p>
        </div>

        {/* 뷰 전환 */}
        <div style={{
          display: 'flex', background: '#f3f0eb',
          borderRadius: '8px', padding: '3px', gap: '2px',
        }}>
          <button
            onClick={() => setViewMode('calendar')}
            style={{
              padding: '6px 14px', borderRadius: '6px', fontSize: '12px',
              border: 'none', fontFamily: 'inherit', cursor: 'pointer',
              background: viewMode === 'calendar' ? '#fff' : 'transparent',
              color: viewMode === 'calendar' ? PURPLE : '#6b7280',
              fontWeight: viewMode === 'calendar' ? 600 : 400,
              boxShadow: viewMode === 'calendar' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            <Calendar size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
            달력
          </button>
          <button
            onClick={() => setViewMode('list')}
            style={{
              padding: '6px 14px', borderRadius: '6px', fontSize: '12px',
              border: 'none', fontFamily: 'inherit', cursor: 'pointer',
              background: viewMode === 'list' ? '#fff' : 'transparent',
              color: viewMode === 'list' ? PURPLE : '#6b7280',
              fontWeight: viewMode === 'list' ? 600 : 400,
              boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            <List size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
            목록
          </button>
        </div>
      </div>

      {/* ── 달력 뷰 ── */}
      {viewMode === 'calendar' && (
        <div style={{
          maxWidth: '1100px', margin: '0 auto',
          borderTop: `1px solid ${BORDER}`,
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          minHeight: '520px',
          background: '#fff',
          borderRadius: '0 0 16px 16px',
          overflow: 'hidden',
          border: `1px solid ${BORDER}`,
          borderTop: 'none',
        }}>
          <CalendarPanel
            meditations={meditations}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
          <div style={{ padding: '24px 28px' }}>
            {selectedDate && (
              <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px' }}>
                {(() => {
                  const d = new Date(selectedDate);
                  const days = ['일', '월', '화', '수', '목', '금', '토'];
                  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
                })()}
              </div>
            )}
            <CalendarPreview
              meditation={selectedMeditation}
              onDelete={handleDelete}
              navigate={navigate}
            />
          </div>
        </div>
      )}

      {/* ── 목록 뷰 ── */}
      {viewMode === 'list' && (
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 28px 40px' }}>
          {Object.entries(groupedByMonth).map(([month, items]) => (
            <div key={month}>
              <div style={{
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
                color: '#9ca3af', textTransform: 'uppercase',
                padding: '20px 0 10px',
                borderBottom: `1px solid ${BORDER}`,
                marginBottom: '12px',
              }}>
                {month}
              </div>
              {items.map(m => (
                <MeditationCard
                  key={m.id}
                  meditation={m}
                  onDelete={handleDelete}
                  navigate={navigate}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════
// ThemePage — 기존 유지
// ══════════════════════════════════════════════════════════
const THEME_CONFIG = {
  i_am:         { bg: '#EEEDFE', text: '#3C3489', border: '#AFA9EC', icon: '✦', desc: '나는 ~이다' },
  salvation:    { bg: '#E1F5EE', text: '#085041', border: '#5DCAA5', icon: '✙', desc: '영생과 구원' },
  kingdom:      { bg: '#FAEEDA', text: '#633806', border: '#EF9F27', icon: '♔', desc: '하나님 나라' },
  love:         { bg: '#FAECE7', text: '#712B13', border: '#F0997B', icon: '♡', desc: '사랑의 계명' },
  prayer:       { bg: '#FBEAF0', text: '#72243E', border: '#ED93B1', icon: '✧', desc: '기도의 삶' },
  faith:        { bg: '#E6F1FB', text: '#0C447C', border: '#85B7EB', icon: '◇', desc: '믿음의 여정' },
  holy_spirit:  { bg: '#EAF3DE', text: '#27500A', border: '#97C459', icon: '∞', desc: '성령의 역사' },
  discipleship: { bg: '#F1EFE8', text: '#444441', border: '#B4B2A9', icon: '↗', desc: '제자의 길' },
  cross:        { bg: '#FAECE7', text: '#712B13', border: '#F0997B', icon: '✝', desc: '십자가 고난' },
  resurrection: { bg: '#EEEDFE', text: '#3C3489', border: '#AFA9EC', icon: '◎', desc: '부활의 소망' },
  judgment:     { bg: '#FCEBEB', text: '#791F1F', border: '#F09595', icon: '⊖', desc: '심판과 진리' },
  forgiveness:  { bg: '#E1F5EE', text: '#085041', border: '#5DCAA5', icon: '○', desc: '용서와 회복' },
  healing:      { bg: '#EAF3DE', text: '#27500A', border: '#97C459', icon: '✤', desc: '치유와 기적' },
  identity:     { bg: '#FAEEDA', text: '#633806', border: '#EF9F27', icon: '◈', desc: '예수님의 정체' },
};

export function ThemePage() {
  const [themes, setThemes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getThemes().then(d => { if (d) setThemes(d); setLoading(false); });
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <SectionBar />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: '28px' }}>
          <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '6px' }}>
            주님의 음성
          </p>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937', marginBottom: '6px' }}>주제별 탐색</h1>
          <p style={{ fontSize: '14px', color: '#6b7280', fontFamily: "'Gowun Batang', serif", lineHeight: 1.7 }}>
            예수님의 말씀을 14가지 주제로 분류하였습니다.
          </p>
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '40px' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid #e5e7eb', borderTopColor: PURPLE_MID, animation: 'spin 0.7s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
            {themes.map(t => {
              const cfg = THEME_CONFIG[t.key] ?? { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb', icon: '○', desc: '' };
              return (
                <Link key={t.key} to={`/sayings/list?themes__key=${t.key}`} style={{
                  display: 'block', padding: '16px', borderRadius: '12px',
                  border: `1px solid ${cfg.border}`, background: cfg.bg,
                  textDecoration: 'none', transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: cfg.bg, color: cfg.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', marginBottom: '12px', border: `1px solid ${cfg.border}` }}>
                    {cfg.icon}
                  </div>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: '#1f2937', marginBottom: '2px' }}>{t.name_ko}</p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '10px' }}>{cfg.desc}</p>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: cfg.text, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {t.saying_count}개 말씀 <ChevronRight size={11} />
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ParallelPage — 기존 유지
// ══════════════════════════════════════════════════════════
const BOOK_COLORS = {
  MAT: { bg: '#FAEEDA', text: '#633806', border: '#EF9F27' },
  MRK: { bg: '#E1F5EE', text: '#085041', border: '#5DCAA5' },
  LUK: { bg: '#E6F1FB', text: '#0C447C', border: '#85B7EB' },
  JHN: { bg: '#EEEDFE', text: '#3C3489', border: '#AFA9EC' },
};

export function ParallelPage() {
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getParallelGroups().then(d => {
      const list = Array.isArray(d) ? d : (d?.results ?? []);
      setGroups(list);
      setLoading(false);
    });
  }, []);

  const handleSelect = async (g) => {
    setSelected(g.id);
    const d = await getParallelGroup(g.id);
    setDetail(d);
  };

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <SectionBar />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: '28px' }}>
          <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '6px' }}>주님의 음성</p>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937', marginBottom: '6px' }}>병행구절 비교</h1>
          <p style={{ fontSize: '14px', color: '#6b7280', fontFamily: "'Gowun Batang', serif", lineHeight: 1.7 }}>
            같은 사건에 대해 4복음서가 어떻게 다르게 기록했는지 나란히 비교합니다.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '28px' }}>
          {loading ? (
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid #e5e7eb', borderTopColor: PURPLE_MID, animation: 'spin 0.7s linear infinite' }} />
          ) : groups.map(g => (
            <button key={g.id} onClick={() => handleSelect(g)} style={{
              padding: '8px 18px', borderRadius: '999px', fontSize: '14px', border: '1px solid',
              borderColor: selected === g.id ? PURPLE_MID : BORDER,
              background: selected === g.id ? PURPLE_LIGHT : '#fff',
              color: selected === g.id ? PURPLE : '#6b7280',
              fontWeight: selected === g.id ? 600 : 400,
              cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
            }}>
              {g.name}
            </button>
          ))}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        {detail && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', marginBottom: '16px' }}>{detail.name}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
              {(detail.sayings ?? []).map((s, i) => {
                const bc = BOOK_COLORS[s.book] ?? { bg: '#F1EFE8', text: '#444441', border: '#D3D1C7' };
                return (
                  <div key={i} style={{ border: `1px solid ${s.id ? bc.border : '#f3f4f6'}`, borderRadius: '12px', overflow: 'hidden', background: s.id ? '#fff' : '#f9fafb' }}>
                    <div style={{ padding: '10px 14px', background: s.id ? bc.bg : '#f3f4f6', borderBottom: `1px solid ${s.id ? bc.border + '50' : '#f3f4f6'}` }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: s.id ? bc.text : '#9ca3af' }}>{s.book_display}</span>
                      {s.reference && <span style={{ fontSize: '12px', color: s.id ? bc.text + '99' : '#9ca3af', marginLeft: '6px' }}>{s.reference}</span>}
                    </div>
                    <div style={{ padding: '12px 14px' }}>
                      {s.id ? (
                        <>
                          <p style={{ fontSize: '14px', lineHeight: 1.8, color: '#1f2937', margin: '0 0 10px', fontFamily: "'Gowun Batang', serif" }}>{s.text_ko_krv}</p>
                          <Link to={`/sayings/${s.id}`} style={{ fontSize: '13px', color: PURPLE_MID, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            상세 보기 <ChevronRight size={11} />
                          </Link>
                        </>
                      ) : (
                        <p style={{ fontSize: '13px', color: '#d1d5db', fontStyle: 'italic' }}>이 사건의 기록 없음</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {!loading && groups.length > 0 && !detail && (
          <div style={{ textAlign: 'center', padding: '40px', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: '14px' }}>
            <p style={{ fontSize: '15px', color: '#9ca3af', fontFamily: "'Gowun Batang', serif" }}>
              위에서 사건을 선택하면 4복음서를 나란히 비교합니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}