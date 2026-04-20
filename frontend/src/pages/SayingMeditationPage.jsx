// ============================================================
// frontend/src/pages/SayingMeditationPage.jsx  (수정본 v1)
//
// 변경사항:
//  1. 데스크탑: 좌(정보/성경본문) 40% + 우(묵상입력) 60% 비율로 변경
//  2. 좌측 패널: 성경본문 / 말씀의 배경 / 핵심 단어 원어해설 / 관련구절
//  3. 우측 패널: 묵상 입력 영역 (단계별 StepPanel)
//  4. 모바일/태블릿: 정보 패널이 상단에 표시됨
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Save, BookOpen,
  Play, Pause, RotateCcw, Check, Copy,
  CalendarDays, ArrowLeft, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  getSaying,
  getMeditationBySaying,
  createMeditation,
  updateMeditation,
} from '../api/sayings';
import { useAuth } from '../contexts/AuthContext';

// ─────────────────────────────────────────────────────────
// 디자인 토큰
// ─────────────────────────────────────────────────────────
const T = {
  ink:  '#1a1714', ink2: '#3d3830', ink3: '#6b6358',
  ink4: '#9e9488', ink5: '#c9c2b8',
  paper: '#f8f4ef', paper2: '#f0ebe3', paper3: '#e6dfd4',
  m1: '#7a4a00', m1bg: '#fdf0e0', m1mid: '#e8c88a',
  m2: '#4a3f7a', m2bg: '#f0eef9', m2mid: '#c8c3e8',
  m3: '#1a5c8a', m3bg: '#eaf3fb', m3mid: '#b3d4ec',
  m4: '#2d6e2d', m4bg: '#eaf4ea', m4mid: '#a8d4a8',
  m5: '#005a48', m5bg: '#e0f5ee', m5mid: '#7ecab5',
};

// ─────────────────────────────────────────────────────────
// 4단계 묵상 정의
// ─────────────────────────────────────────────────────────
const SLP_STEPS = [
  {
    key: 'praeparatio',
    roman: 'I',
    latin: 'Praeparatio · Auditio · Illuminatio',
    label: '고요 속에 말씀 듣기',
    badge: '정직 · 낭독 · 발견',
    color: T.m1, colorBg: T.m1bg, colorMid: T.m1mid,
    icon: '🌅',
    minutes: 10,
    desc: '소란한 마음을 내려놓고 숨김없이 하나님 앞에 마주 앉습니다.\n  말씀을 낮은 소리로 천천히 읽으며 들려오는 말씀에 집중해 보세요.',
    chips: [
      '깊게 세 번 호흡하며, 고요한 침묵 속에 머뭅니다',
      '"주님, 제게 말씀하소서" — 기대하는 마음으로 드리는 기도',
      '낮은 목소리로 본문을 한 자 한 자 천천히 읽어봅니다',
      '마음을 울리는 구절을 발견했다면, 그곳에 잠시 멈추어 봅니다',
    ],
    fields: [
      { id: 'j0a', label: '마음에 머문 단어 · 구절', rows: 3,
        placeholder: '낭독하며 유독 마음에 닿은 단어나 문장을 옮겨 적어보세요... \n관련 질문도..' },
      { id: 'j0b', label: '본문에서 새롭게 보인 것들', rows: 3,
        placeholder: '인물·행동·반복어, 앞뒤 문맥, 연결되는 말씀 — 무엇이든 \n새롭게 보이는 것이나, 떠오르는 질문들을...' },
      { id: 'j0c', label: '이 발견들이 함께 가리키는 것', rows: 2,
        placeholder: '오늘 본문이 말하려는 핵심이 무엇이라고 느껴지나요? \n한두 문장으로...' },
    ],
  },
  {
    key: 'meditatio',
    roman: 'II',
    latin: 'Meditatio · Oratio · Applicatio',
    label: '말씀 앞에 서기',
    badge: '거울 · 응답 · 순종',
    color: T.m2, colorBg: T.m2bg, colorMid: T.m2mid,
    icon: '🤲',
    minutes: 15,
    desc: '말씀을 내 삶으로 가져옵니다.\n 말씀이 오늘 나의 어디에 닿는지 천천히 음미하다 보면, 자연스럽게 드러나는 것들이 생깁니다.',
    chips: [
      '이 말씀이 지금 내 삶의 어디에 말을 걸고 있는가?',
      '말씀 앞에서 드러나는 나의 모습은 어떠한가?',
      '하나님께 무엇을 고백하고, 무엇을 구하는가?',
      '오늘 이 말씀대로 살기 위해 내가 할 한 가지는?',
    ],
    fields: [
      { id: 'j1a', label: '말씀과 내 삶의 연결 — 묵상', rows: 4,
        placeholder: '본문이 내 삶의 어느 부분을 만지는지, \n떠오르는 생각·감정·기억을 자유롭게...' },
      { id: 'j1b', label: '하나님께 드리는 응답 — 기도', rows: 3,
        placeholder: '말씀에 반응하는 모든 것. \n감사든, 회개든, 간구든, 형식 없이 솔직하게...' },
      { id: 'j1c', label: '오늘의 순종 — 구체적 결단', rows: 2,
        placeholder: '오늘 이 말씀대로 살기 위한 한 가지. \n무엇을, 어떻게, 언제, 누구에게...' },
    ],
  },
  {
    key: 'contemplatio',
    roman: 'III',
    latin: 'Contemplatio · Quies',
    label: '예수님 안에 머물기',
    badge: '안식 · 신뢰 · 임재',
    color: T.m4, colorBg: T.m4bg, colorMid: T.m4mid,
    icon: '✨',
    minutes: 10,
    timerOptions: [5, 10, 15],
    desc: '이제 모든 것을 내려놓습니다. \n포도나무 되시는 예수님의 안전하고 따스한 품에 그저 머무르세요.',
    chips: [],
    abidePractices: [
      { num: '1', title: '온전한 내어드림',
        text: '"주님, 제가 여기 있습니다." \n나의모습 그대로, 모든 생각, 모든 짐을 주님께 내려 놓습니다.' },
      { num: '2', title: '잠잠히 머묾',
        text: '예수님께만 바라봅니다. \n나와 함께 계시는 주님 안에서 잠잠히 머무는 시간입니다.' },
      { num: '3', title: '주님이 공급하심',
        text: '"나는 포도나무요 너희는 가지라." \n주님의 생명이 내 안에 흐르도록, 사랑받는 자녀로서 그분께 나를 온전히 맡깁니다.' },
      { num: '4', title: '임재하심의 충만함',
        text: '내가 무언가를 채우려 하지 않습니다. \n지금 내 곁에 주님이 계신다는 사실, 그것만으로 충분합니다.' },
    ],
    fields: [
      { id: 'j3a', label: '주님 안에서의 머묾', rows: 2,
        placeholder: '지금 주님의 품 안에서 느끼는 평안과 안식을 잠시 누려보세요. \n아무것도 적지 않아도 괜찮습니다...' },
    ],
  },
  {
    key: 'propositum',
    roman: 'IV',
    latin: 'Propositum · Vivendo',
    label: '오늘을 향한 발걸음',
    badge: '동행 · 기도 · 소망',
    color: T.m5, colorBg: T.m5bg, colorMid: T.m5mid,
    icon: '🌿',
    minutes: 5,
    desc: '말씀을 품고 세상으로 나아갑니다.\n 이제 세상 속으로 나아갑니다.',
    chips: [],
    fields: [
      { id: 'j4a', label: '마음에 새긴 한 구절', rows: 2,
        placeholder: '오늘 하루 나를 붙들어줄 생명의 말씀...' },
      { id: 'j4b', label: '삶으로 드릴 순종', rows: 2,
        placeholder: '오늘 실천할 작지만 구체적 행동 한 가지...' },
      { id: 'j4c', label: '올려드리는 기도', rows: 3,
        placeholder: '나를 위한 간구와 이웃을 향한 중보의 제목들...' },
      { id: 'j4d', label: '성령의 일하심을 향한 기대', rows: 2,
        placeholder: '오늘 성령님이 일하시길 기대하고 바라는 곳...' },
    ],
  },
];

// ─────────────────────────────────────────────────────────
// 원형 타이머
// ─────────────────────────────────────────────────────────
function CircleTimer({ progress, color, mm, ss, size = 52 }) {
  const r = (size / 2) - 4;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.paper3} strokeWidth="3" />
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none" stroke={color} strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - progress)}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '10px', fontWeight: 700, color,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {mm}:{ss}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 타이머 훅
// ─────────────────────────────────────────────────────────
function useStepTimer(totalMinutes) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const ref = useRef(null);

  const start = useCallback((overrideMin) => {
    const target = (overrideMin ?? totalMinutes) * 60;
    if (elapsed >= target) return;
    setRunning(true);
    ref.current = setInterval(() => {
      setElapsed(e => {
        if (e + 1 >= target) { clearInterval(ref.current); setRunning(false); return target; }
        return e + 1;
      });
    }, 1000);
  }, [elapsed, totalMinutes]);

  const pause = useCallback(() => { clearInterval(ref.current); setRunning(false); }, []);
  const reset = useCallback(() => { clearInterval(ref.current); setRunning(false); setElapsed(0); }, []);

  useEffect(() => () => clearInterval(ref.current), []);

  const totalSec = totalMinutes * 60;
  const remaining = Math.max(0, totalSec - elapsed);
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const progress = totalSec > 0 ? elapsed / totalSec : 0;
  return { elapsed, running, remaining, mm, ss, progress, totalSec, start, pause, reset };
}

// ─────────────────────────────────────────────────────────
// StepPanel — 단계별 입력 패널
// ─────────────────────────────────────────────────────────
function StepPanel({ stepData: s, values, onChange }) {
  const { elapsed, running, mm, ss, progress, start, pause, reset } = useStepTimer(s.minutes);
  const [timerMin, setTimerMin] = useState(s.minutes);
  const [chipsOpen, setChipsOpen] = useState(false);
  const isDone = elapsed >= timerMin * 60;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 단계 설명 */}
      <div style={{
        fontSize: '13px', color: T.ink3, lineHeight: 1.85,
        padding: '12px 16px', background: T.paper,
        borderRadius: '10px', borderLeft: `3px solid ${s.colorMid}`,
        whiteSpace: 'pre-line', 
      }}>
        {s.desc}
      </div>

      {/* 안내 칩 */}
      {s.chips && s.chips.length > 0 && (
        <div>
          <button
            onClick={() => setChipsOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '11px', fontWeight: 600, color: T.ink4,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0 0 8px', fontFamily: 'inherit', width: '100%',
            }}
          >
            <span style={{ flex: 1, textAlign: 'left' }}>묵상 가이드 보기</span>
            {chipsOpen
              ? <ChevronUp size={13} style={{ color: T.ink5 }} />
              : <ChevronDown size={13} style={{ color: T.ink5 }} />}
          </button>

          {chipsOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {s.chips.map((c, i) => (
                <div key={i} style={{
                  fontSize: '12.5px', color: T.ink2,
                  padding: '8px 12px', background: '#fff',
                  border: `1px solid ${T.paper3}`,
                  borderRadius: '8px', lineHeight: 1.55,
                  display: 'flex', alignItems: 'flex-start', gap: '8px',
                }}>
                  <span style={{ color: s.color, flexShrink: 0, fontWeight: 700 }}>·</span> {c}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Contemplatio 머물기 실천 가이드 */}
      {s.abidePractices && (
        <div style={{
          background: T.m4bg, borderRadius: '10px', padding: '14px 16px',
        }}>
          <div style={{
            fontSize: '11px', fontWeight: 600, color: T.m4,
            letterSpacing: '0.05em', marginBottom: '10px', textTransform: 'uppercase',
          }}>
            머물기 실천 가이드
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {s.abidePractices.map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                background: '#fff', borderRadius: '8px', padding: '9px 12px',
                borderLeft: `3px solid ${T.m4mid}`,
              }}>
                <span style={{ fontStyle: 'italic', fontSize: '13px', color: T.m4, minWidth: 18, fontWeight: 600 }}>{a.num}</span>
                <span style={{ fontSize: '13.5px', color: T.ink2, lineHeight: 1.65,whiteSpace: 'pre-line' }}>
                  <strong style={{ color: T.m4 }}>{a.title}</strong> — {a.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 타이머 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '12px 16px', background: '#fff',
        border: `1px solid ${T.paper3}`, borderRadius: '10px',
        flexWrap: 'wrap',
      }}>
        <CircleTimer progress={progress} color={s.color} mm={mm} ss={ss} />
        <div style={{ flex: 1 }}>
          {s.timerOptions && (
            <div style={{ display: 'flex', gap: '5px', marginBottom: '8px', flexWrap: 'wrap' }}>
              {s.timerOptions.map(m => (
                <button key={m} onClick={() => { setTimerMin(m); reset(); }} style={{
                  fontSize: '11px', padding: '3px 9px', borderRadius: '20px',
                  cursor: 'pointer', fontFamily: 'inherit',
                  background: timerMin === m ? s.color : '#fff',
                  color: timerMin === m ? '#fff' : s.color,
                  border: `1px solid ${s.colorMid}`, transition: 'all 0.15s',
                }}>
                  {m}분
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
            {!running ? (
              <button onClick={() => start(timerMin)} disabled={isDone} style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '6px 12px', borderRadius: '8px',
                fontSize: '12px', fontWeight: 600,
                background: isDone ? '#e5e7eb' : s.color,
                color: isDone ? T.ink4 : '#fff',
                border: 'none', cursor: isDone ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}>
                <Play size={11} /> {isDone ? '완료 ✓' : elapsed > 0 ? '계속' : '시작'}
              </button>
            ) : (
              <button onClick={pause} style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '6px 12px', borderRadius: '8px',
                fontSize: '12px', fontWeight: 600,
                background: s.color, color: '#fff',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <Pause size={11} /> 일시정지
              </button>
            )}
            <button onClick={reset} style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 10px', borderRadius: '8px',
              fontSize: '12px', color: T.ink4,
              background: 'transparent', border: `1px solid ${T.paper3}`,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <RotateCcw size={11} /> 초기화
            </button>
            <span style={{ fontSize: '11px', color: T.ink5, alignSelf: 'center' }}>
              권장 {s.minutes}분
            </span>
          </div>
        </div>
      </div>

      {/* 입력 필드들 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {s.fields.map(f => (
          <div key={f.id}>
            <div style={{
              fontSize: '11px', fontWeight: 700, color: s.color,
              textTransform: 'uppercase', letterSpacing: '0.07em',
              marginBottom: '6px',
            }}>
              {f.label}
            </div>
            <textarea
              value={values[f.id] || ''}
              onChange={e => onChange(f.id, e.target.value)}
              placeholder={f.placeholder}
              rows={f.rows || 3}
              style={{
                width: '100%', border: `1px solid ${T.paper3}`,
                borderRadius: '10px', padding: '12px 14px',
                fontSize: '14px', fontFamily: "'Gowun Batang', serif",
                color: T.ink, background: '#fff',
                resize: 'vertical', lineHeight: 1.85,
                outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = s.colorMid}
              onBlur={e => e.target.style.borderColor = T.paper3}
            />
          </div>
        ))}
      </div>

      {/* Propositum 마무리 안내 */}
      {s.key === 'propositum' && (
        <div style={{
          padding: '12px 16px', background: T.m5bg,
          borderRadius: '10px', fontSize: '12.5px',
          color: T.m5, lineHeight: 1.7,
          fontFamily: "'Gowun Batang', serif",
        }}>
          🌅 저녁 묵상을 시작할 때, 오늘 기록한 핵심 말씀과 결단을 먼저 읽으며 시작하세요. 아침과 저녁이 하나로 이어집니다.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ★ 새로운 통합 컨텍스트 패널
// 성경본문 / 말씀의 배경 / 핵심 단어 원어해설 / 관련구절
// 모든 단계에서 동일하게 표시, 각 섹션 토글 가능
// ─────────────────────────────────────────────────────────
function UnifiedContextPanel({ saying, isMobile = false }) {
  // 성경 본문: 항상 펼쳐져 있음 (모바일/데스크탑 공통)
  const [scriptureOpen, setScriptureOpen] = useState(true);
  // 나머지 3개: 모바일에서는 처음에 닫힘, 데스크탑은 처음에 열림
  const [contextOpen, setContextOpen] = useState(!isMobile);
  const [keywordsOpen, setKeywordsOpen] = useState(!isMobile);
  const [relatedOpen, setRelatedOpen] = useState(!isMobile);
  const [tab, setTab] = useState('krv');
  const [kwFlipped, setKwFlipped] = useState({});

  if (!saying) return null;

  const bodyText = tab === 'krv'
    ? (saying.text_ko_krv || '')
    : (saying.text_ko_new || saying.text_ko_krv || '');

  const hasKeywords = (saying.keywords ?? []).length > 0;
  const hasRelated = (saying.related_sayings ?? []).length > 0;
  const hasParallels = (saying.parallels ?? []).length > 0;

  // 섹션 헤더 공통 스타일
  const SectionHeader = ({ label, isOpen, onToggle, accent }) => (
    <button
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', background: 'none', border: 'none', cursor: 'pointer',
        padding: '14px 0', fontFamily: 'inherit',
        borderBottom: isOpen ? `1px solid ${T.paper3}` : 'none',
        marginBottom: isOpen ? '14px' : 0,
      }}
    >
      <span style={{
        fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: accent || T.ink4,
      }}>
        {label}
      </span>
      <span style={{ color: '#c4bfb8', flexShrink: 0 }}>
        {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </span>
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', paddingRight: '4px' }}>

      {/* ── 섹션 1: 성경 본문 ── */}
      <div style={{ borderBottom: `1px solid ${T.paper3}` }}>
        {/* 오늘의 말씀 헤더 — 한 줄 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '8px', padding: '0 0 10px', flexWrap: 'wrap',
        }}>
          {/* 레이블 + 참조 */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0 }}>
            <span style={{ fontSize: '10px', color: T.ink4, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>
              오늘의 말씀
            </span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: T.ink, fontFamily: "'Gowun Batang', serif", whiteSpace: 'nowrap' }}>
              {saying.reference}
            </span>
          </div>

          {/* 번역 토글 — 우측 */}
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            {['krv', 'new'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  fontSize: '12px', padding: '4px 12px', borderRadius: '20px',
                  fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.15s',
                  background: tab === t ? T.ink : 'transparent',
                  color: tab === t ? '#fff' : T.ink4,
                  border: `1px solid ${tab === t ? T.ink : T.paper3}`,
                }}
              >
                {t === 'krv' ? '개역개정' : '새번역'}
              </button>
            ))}
          </div>
        </div>

        {/* 본문 카드 */}
        <div style={{
          background: '#fff',
          border: `1px solid ${T.m1mid}`,
          borderLeft: `5px solid ${T.m1}`,
          borderRadius: '0 12px 12px 0',
          padding: '18px 20px 14px',
          marginBottom: '16px',
        }}>
          <p style={{
            fontSize: '16px',
            fontFamily: "'Gowun Batang', serif",
            lineHeight: 2.0,
            color: T.ink,
            margin: 0,
          }}>
            {bodyText}
          </p>
          <p style={{ fontSize: '11px', color: T.ink5, marginTop: '10px', marginBottom: 0, textAlign: 'right' }}>
            {tab === 'krv' ? '개역개정' : '새번역'} · {saying.reference}
          </p>
        </div>
      </div>

      {/* ── 섹션 2: 말씀의 배경 ── */}
      <div style={{ borderBottom: `1px solid ${T.paper3}` }}>
        <SectionHeader
          label="말씀의 배경"
          isOpen={contextOpen}
          onToggle={() => setContextOpen(v => !v)}
          accent={T.m2}
        />
        {contextOpen && (
          <div style={{ marginBottom: '14px' }}>
            <div style={{
              background: '#fff',
              border: `1px solid ${T.m2mid}`,
              borderLeft: `4px solid ${T.m2}`,
              borderRadius: '0 10px 10px 0',
              padding: '14px 16px',
            }}>
              <p style={{
                fontSize: '14px',
                fontFamily: "'Gowun Batang', serif",
                lineHeight: 1.9,
                color: T.ink2,
                margin: 0,
              }}>
                {saying.context_ko || '말씀의 배경 설명이 준비 중입니다.'}
              </p>
            </div>
            {saying.occasion && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                marginTop: '10px',
                fontSize: '12px', color: '#9ca3af',
              }}>
                <BookOpen size={11} style={{ color: '#c4bfb8' }} />
                {saying.occasion} — {saying.reference}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 섹션 3: 핵심 단어 원어 해설 ── */}
      {hasKeywords && (
        <div style={{ borderBottom: `1px solid ${T.paper3}` }}>
          <SectionHeader
            label="핵심 단어 원어 해설"
            isOpen={keywordsOpen}
            onToggle={() => setKeywordsOpen(v => !v)}
            accent={T.m4}
          />
          {keywordsOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              {saying.keywords.map((kw, i) => {
                const isFlipped = kwFlipped[i];
                return (
                  <div
                    key={i}
                    onClick={() => setKwFlipped(f => ({ ...f, [i]: !f[i] }))}
                    style={{
                      cursor: 'pointer',
                      border: `1px solid ${isFlipped ? T.m4mid : T.paper3}`,
                      borderRadius: '12px',
                      padding: '12px 14px',
                      background: isFlipped ? T.m4bg : '#fff',
                      transition: 'all 0.2s',
                    }}
                  >
                    {!isFlipped ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 700, color: T.m4 }}>{kw.word}</span>
                          <span style={{ fontSize: '13px', color: T.m4, opacity: 0.8, fontStyle: 'italic', fontFamily: 'serif' }}>
                            {kw.original}
                          </span>
                          <span style={{ fontSize: '12px', color: '#9ca3af' }}>({kw.transliteration})</span>
                        </div>
                        <p style={{ fontSize: '11px', color: '#c4bfb8', margin: 0, letterSpacing: '0.04em' }}>
                          탭하여 의미 보기 →
                        </p>
                      </>
                    ) : (
                      <>
                        <p style={{ fontSize: '11px', color: T.m4, marginBottom: '8px', fontWeight: 700, letterSpacing: '0.06em' }}>
                          {kw.word} — 의미
                        </p>
                        <p style={{
                          fontSize: '14px', color: T.ink2, lineHeight: 1.75,
                          fontFamily: "'Gowun Batang', serif", margin: 0,
                        }}>
                          {kw.meaning}
                        </p>
                        <p style={{ fontSize: '11px', color: '#c4bfb8', marginTop: '10px', marginBottom: 0 }}>← 탭하여 닫기</p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 섹션 4: 관련 구절 (병행구절 + 관련 말씀) ── */}
      {(hasParallels || hasRelated) && (
        <div>
          <SectionHeader
            label="관련 구절"
            isOpen={relatedOpen}
            onToggle={() => setRelatedOpen(v => !v)}
            accent={T.m5}
          />
          {relatedOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
              {/* 병행구절 */}
              {hasParallels && saying.parallels.map((p, i) => (
                <Link
                  key={`par-${i}`}
                  to={`/sayings/${p.id}`}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                    padding: '10px 12px', borderRadius: '10px',
                    border: '1px solid #f3f4f6', background: '#fff',
                    textDecoration: 'none', transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#e9e4dc'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#f3f4f6'}
                >
                  <div style={{ flexShrink: 0 }}>
                    <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '999px', background: T.m5bg, color: T.m5, fontWeight: 600 }}>
                      병행
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: T.m5, display: 'block', marginBottom: '3px' }}>
                      {p.reference}
                    </span>
                    <span style={{ fontSize: '13px', color: '#4b5563', lineHeight: 1.6, fontFamily: "'Gowun Batang', serif" }}>
                      {p.text_ko_krv?.slice(0, 70)}{p.text_ko_krv?.length > 70 ? '…' : ''}
                    </span>
                  </div>
                  <ChevronRight size={12} style={{ color: '#d1d5db', flexShrink: 0, marginTop: '3px' }} />
                </Link>
              ))}
              {/* 관련 말씀 */}
              {hasRelated && saying.related_sayings.slice(0, 3).map((r, i) => (
                <Link
                  key={`rel-${i}`}
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
                  <span style={{ fontSize: '12px', fontWeight: 700, color: T.m5, flexShrink: 0, marginTop: '1px' }}>
                    {r.reference}
                  </span>
                  <span style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.6, fontFamily: "'Gowun Batang', serif", flex: 1 }}>
                    {r.text_ko_krv?.slice(0, 70)}{r.text_ko_krv?.length > 70 ? '…' : ''}
                  </span>
                  <ChevronRight size={12} style={{ color: '#d1d5db', flexShrink: 0, marginTop: '3px' }} />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 전역 스타일
// ─────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .meditate-fade { animation: fadeInUp 0.35s ease both; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* 단계 탭 스크롤바 숨김 */
  .step-tab-bar {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .step-tab-bar::-webkit-scrollbar { display: none; }

  /* 좌측 컨텍스트 패널 스크롤바 — 얇고 은은하게 */
  .meditate-ctx {
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
    transition: scrollbar-color 0.3s;
  }
  .meditate-ctx:hover {
    scrollbar-color: rgba(0,0,0,0.12) transparent;
  }
  .meditate-ctx::-webkit-scrollbar {
    width: 4px;
  }
  .meditate-ctx::-webkit-scrollbar-track {
    background: transparent;
  }
  .meditate-ctx::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 4px;
    transition: background 0.3s;
  }
  .meditate-ctx:hover::-webkit-scrollbar-thumb {
    background: rgba(0,0,0,0.12);
  }
  .meditate-ctx::-webkit-scrollbar-thumb:hover {
    background: rgba(0,0,0,0.22);
  }

  /* 데스크탑: 2컬럼 레이아웃 — 좌(정보) 40% : 우(묵상) 60% */
  @media (min-width: 769px) {
    .meditate-layout { flex-direction: row !important; }
    .meditate-mobile-ctx { display: none !important; }
    .meditate-left { display: block !important; }
    /* 좌측 정보 패널: 좁게 (2/5) */
    .meditate-left-wrap { flex: 2 !important; }
    /* 우측 묵상 입력 패널: 넓게 (3/5) */
    .meditate-right { flex: 3 !important; }
  }

  /* 모바일/태블릿 */
  @media (max-width: 768px) {
    .meditate-layout { flex-direction: column !important; }
    .meditate-right { padding: 20px 16px 80px 16px !important; }
    .meditate-left { display: none !important; }
    .meditate-mobile-ctx { display: none !important; }
    .step-tab-btn {
      flex: 1 1 0 !important;
      padding: 10px 4px !important;
      min-width: 0 !important;
    }
    .step-tab-label { display: none !important; }
    .step-tab-sublabel { font-size: 11px !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60px; }
  }

  /* 플로팅 말씀 버튼 — 모바일 전용 */
  .mobile-fab { display: none; }
  @media (max-width: 768px) {
    .mobile-fab {
      display: flex !important;
      position: fixed;
      bottom: 390px;
      right: 20px;
      z-index: 200;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.20);
      cursor: pointer;
      border: none;
      font-size: 22px;
      transition: transform 0.18s, box-shadow 0.18s;
    }
    .mobile-fab:active { transform: scale(0.90); }
  }

  /* 바텀 시트 오버레이 */
  .bs-overlay { display: none; }
  @media (max-width: 768px) {
    .bs-overlay {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.38);
      z-index: 210;
      animation: bsOverlayIn 0.22s ease;
    }
  }
  @keyframes bsOverlayIn { from { opacity: 0; } to { opacity: 1; } }

  /* 바텀 시트 본체 */
  .bs-sheet { display: none; }
  @media (max-width: 768px) {
    .bs-sheet {
      display: block;
      position: fixed;
      left: 0; right: 0; bottom: 0;
      z-index: 220;
      background: #fff;
      border-radius: 20px 20px 0 0;
      max-height: 78vh;
      overflow-y: auto;
      padding: 0 20px 36px;
      box-shadow: 0 -4px 28px rgba(0,0,0,0.13);
      animation: bsSlideUp 0.28s cubic-bezier(0.32,0.72,0,1);
      scrollbar-width: thin;
      scrollbar-color: rgba(0,0,0,0.12) transparent;
    }
  }
  @keyframes bsSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
`;

// ─────────────────────────────────────────────────────────
// 메인 페이지
// ─────────────────────────────────────────────────────────
export default function SayingMeditationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [saying, setSaying] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState(null);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    setLoading(true);
    getSaying(id).then(data => {
      setSaying(data);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!isAuthenticated || !id) return;
    getMeditationBySaying(id).then(d => {
      if (Array.isArray(d) && d.length > 0) {
        const todayMed = d.find(m => m.date === today || m.created_at?.startsWith(today));
        if (todayMed) {
          setExistingId(todayMed.id);
          try {
            const parsed = JSON.parse(todayMed.content);
            if (typeof parsed === 'object') setValues(parsed);
          } catch {
            setValues({ j0a: todayMed.content });
          }
        }
      }
    });
  }, [isAuthenticated, id, today]);

  const handleChange = (fieldId, val) => {
    setValues(prev => ({ ...prev, [fieldId]: val }));
    setSaved(false);
  };

  const buildContent = () => {
    return JSON.stringify({ ...values, _date: today, _reference: saying?.reference });
  };

  const handleSave = async () => {
    if (!isAuthenticated) return;
    setSaving(true);
    const content = buildContent();
    try {
      if (existingId) {
        await updateMeditation(existingId, { content, saying: parseInt(id), date: today });
      } else {
        const created = await createMeditation({ content, saying: parseInt(id), date: today });
        if (created) setExistingId(created.id);
      }
      setSaved(true);
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const todayFormatted = (() => {
    const d = new Date();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
  })();

  const currentStep = SLP_STEPS[step];
  const doneSteps = SLP_STEPS.map(s => s.fields.some(f => (values[f.id] || '').trim().length > 0));
  const totalDone = doneSteps.filter(Boolean).length;

  if (loading) return (
    <div style={{ minHeight: '100vh', background: T.paper, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 36, height: 36, border: `3px solid ${T.paper3}`,
          borderTopColor: T.m1, borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
        }} />
        <p style={{ fontSize: '13px', color: T.ink4, fontFamily: "'Gowun Batang', serif" }}>말씀을 불러오는 중...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: T.paper }}>
      <style>{GLOBAL_CSS}</style>

      {/* ── 상단 헤더 ── */}
      <div style={{
        background: '#fff',
        borderBottom: `1px solid ${T.paper3}`,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{
          maxWidth: '1200px', margin: '0 auto',
          padding: '12px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '12px', flexWrap: 'wrap',
        }}>
          {/* 좌: 뒤로 + 제목 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => navigate(`/sayings/${id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '12px', color: T.ink3,
                background: 'transparent', border: `1px solid ${T.paper3}`,
                borderRadius: '8px', padding: '6px 10px',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <ArrowLeft size={13} /> 말씀 상세
            </button>
            <div>
              <div style={{ fontSize: '11px', color: T.ink4, fontStyle: 'italic', letterSpacing: '0.08em' }}>
                Sacra Lectio Praxis
              </div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: T.ink }}>
                {saying?.reference} 묵상
              </div>
            </div>
          </div>

          {/* 우: 날짜 + 진행도 + 저장 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '12px', color: T.ink4,
              background: T.paper, border: `1px solid ${T.paper3}`,
              borderRadius: '8px', padding: '6px 10px',
            }}>
              <CalendarDays size={12} />
              {todayFormatted}
            </div>

            {/* 진행도 */}
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              {SLP_STEPS.map((s, i) => (
                <div key={i} style={{
                  width: 28, height: 4, borderRadius: 2,
                  background: doneSteps[i] ? s.color : T.paper3,
                  transition: 'background 0.4s',
                  cursor: 'pointer',
                }} onClick={() => setStep(i)} title={s.label} />
              ))}
              <span style={{ fontSize: '11px', color: T.ink4, marginLeft: '4px' }}>{totalDone}/{SLP_STEPS.length}</span>
            </div>

            {/* 저장 버튼 */}
            {isAuthenticated ? (
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  fontSize: '13px', fontWeight: 600,
                  padding: '8px 16px', borderRadius: '8px',
                  background: saved ? T.m4 : T.m1,
                  color: '#fff', border: 'none',
                  cursor: saving ? 'default' : 'pointer',
                  fontFamily: 'inherit', transition: 'all 0.2s',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? (
                  <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> 저장 중</>
                ) : saved ? (
                  <><Check size={13} /> 저장됨</>
                ) : (
                  <><Save size={13} /> 저장</>
                )}
              </button>
            ) : (
              <Link to="/login" style={{
                fontSize: '12px', padding: '7px 14px', borderRadius: '8px',
                background: T.paper2, color: T.m1, border: `1px solid ${T.m1mid}`,
                textDecoration: 'none',
              }}>
                로그인하여 저장
              </Link>
            )}
          </div>
        </div>

        {/* 저장 성공 토스트 */}
        {showSaveSuccess && (
          <div style={{
            background: T.m4, color: '#fff',
            padding: '8px 20px', fontSize: '12.5px',
            display: 'flex', alignItems: 'center', gap: '6px',
            animation: 'fadeInUp 0.3s ease',
          }}>
            <Check size={13} /> 오늘의 묵상이 저장되었습니다. &lsquo;내 묵상&rsquo;에서 달력으로 확인할 수 있습니다.
          </div>
        )}
      </div>

      {/* ── 단계 탭 네비게이션 ── */}
      <div style={{
        background: '#fff',
        borderBottom: `1px solid ${T.paper3}`,
        position: 'sticky',
        top: 57,
        zIndex: 40,
      }}>
        <div
          className="step-tab-bar"
          style={{
            maxWidth: '1200px', margin: '0 auto',
            padding: '0 24px',
            display: 'flex',
            overflowX: 'auto',
          }}
        >
          {SLP_STEPS.map((s, i) => {
            const isActive = step === i;
            return (
              <button
                key={s.key}
                className="step-tab-btn"
                onClick={() => setStep(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '14px 20px',
                  borderBottom: isActive ? `3px solid ${s.color}` : '3px solid transparent',
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                  whiteSpace: 'nowrap', transition: 'all 0.2s',
                  borderLeft: 'none', borderRight: 'none', borderTop: 'none',
                  marginBottom: '-1px',
                  flexShrink: 0,
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isActive ? s.color : (doneSteps[i] ? s.colorBg : T.paper2),
                  color: isActive ? '#fff' : (doneSteps[i] ? s.color : T.ink4),
                  fontSize: '10px', fontWeight: 700,
                  fontFamily: 'Georgia, serif', fontStyle: 'italic',
                  flexShrink: 0, transition: 'all 0.2s',
                }}>
                  {doneSteps[i] && !isActive ? '✓' : s.roman}
                </span>
                <div style={{ textAlign: 'left' }}>
                  <div className="step-tab-label" style={{ fontSize: '11px', color: isActive ? s.color : T.ink4, fontStyle: 'italic' }}>
                    {s.latin.split('·')[0].trim()}
                  </div>
                  <div className="step-tab-sublabel" style={{
                    fontSize: '13px', fontWeight: isActive ? 600 : 400,
                    color: isActive ? s.color : T.ink3,
                  }}>
                    {s.label}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 메인 2-컬럼 레이아웃 ── */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
        <div
          className="meditate-layout"
          style={{
            display: 'flex',
            minHeight: 'calc(100vh - 180px)',
            gap: 0,
          }}
        >

          {/* ── 좌: 통합 컨텍스트 패널 (데스크탑 전용, 40% 비율) ── */}
          <div
            className="meditate-left meditate-left-wrap"
            style={{
              flex: 2,   // 40% (2/5)
              minWidth: 0,
              display: 'block',
              borderRight: `1px solid ${T.paper3}`,
            }}
          >
            <div
              className="meditate-ctx"
              style={{
                position: 'sticky',
                top: '120px',
                maxHeight: 'calc(100vh - 140px)',
                overflowY: 'auto',
                padding: '32px 32px 32px 0',
              }}
            >
              {/* 컨텍스트 패널 레이블 */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                marginBottom: '16px',
                paddingBottom: '14px',
                borderBottom: `2px solid ${T.paper3}`,
              }}>
              </div>

              <div className="meditate-fade" key={`ctx-unified`}>
                <UnifiedContextPanel saying={saying} isMobile={false} />
              </div>

              {/* 내 묵상 바로가기 (저장 후) */}
              {saved && (
                <div style={{
                  marginTop: '24px', padding: '14px 16px',
                  background: T.m4bg, border: `1px solid ${T.m4mid}`,
                  borderRadius: '12px',
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: T.m4, marginBottom: '6px' }}>
                    ✓ 오늘의 묵상이 저장되었습니다
                  </div>
                  <div style={{ fontSize: '11.5px', color: T.ink3, marginBottom: '10px', lineHeight: 1.6, fontFamily: "'Gowun Batang', serif" }}>
                    &lsquo;내 묵상&rsquo; 페이지에서 달력으로 오늘의 기록을 확인하고, 추후 이어 작성할 수 있습니다.
                  </div>
                  <Link to="/sayings/meditations" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: '12px', color: T.m4,
                    background: '#fff', border: `1px solid ${T.m4mid}`,
                    borderRadius: '8px', padding: '6px 12px',
                    textDecoration: 'none', fontFamily: 'inherit',
                  }}>
                    <CalendarDays size={12} /> 내 묵상 달력으로 →
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* ── 우: 묵상 입력 영역 (60% 비율) ── */}
          <div
            className="meditate-right"
            style={{
              flex: 3,   // 60% (3/5)
              padding: '32px 0 32px 32px',
              minWidth: 0,
            }}
          >
            {/* 모바일 전용: 통합 컨텍스트 패널 (상단 배치) */}
            <div
              className="meditate-mobile-ctx meditate-fade"
              key={`mobile-ctx-${step}`}
              style={{
                display: 'none', // 모바일 CSS에서 block으로 오버라이드
                marginBottom: '24px',
                padding: '20px',
                background: '#fff',
                border: `1px solid ${T.paper3}`,
                borderRadius: '14px',
              }}
            >
              <UnifiedContextPanel saying={saying} isMobile={true} />
            </div>

            {/* 단계 콘텐츠 */}
            <div className="meditate-fade" key={`content-${step}`}>
              <StepPanel
                stepData={currentStep}
                values={values}
                onChange={handleChange}
              />
            </div>

            {/* 단계 이동 버튼 */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginTop: '32px', paddingTop: '20px',
              borderTop: `1px solid ${T.paper3}`,
            }}>
              <button
                onClick={() => setStep(Math.max(0, step - 1))}
                disabled={step === 0}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  fontSize: '13px', color: step === 0 ? T.ink5 : T.ink3,
                  background: 'transparent', border: `1px solid ${T.paper3}`,
                  borderRadius: '8px', padding: '8px 14px',
                  cursor: step === 0 ? 'default' : 'pointer',
                  fontFamily: 'inherit', opacity: step === 0 ? 0.4 : 1,
                }}
              >
                <ChevronLeft size={14} /> 이전 단계
              </button>

              <div style={{ display: 'flex', gap: '6px' }}>
                {SLP_STEPS.map((s, i) => (
                  <div
                    key={i}
                    onClick={() => setStep(i)}
                    style={{
                      width: i === step ? 20 : 8, height: 8, borderRadius: 4,
                      background: i === step ? currentStep.color : (doneSteps[i] ? s.color : T.paper3),
                      cursor: 'pointer', transition: 'all 0.3s',
                      opacity: i === step ? 1 : 0.5,
                    }}
                  />
                ))}
              </div>

              {step < SLP_STEPS.length - 1 ? (
                <button
                  onClick={() => setStep(Math.min(SLP_STEPS.length - 1, step + 1))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    fontSize: '13px', fontWeight: 600,
                    color: '#fff', background: currentStep.color,
                    border: 'none', borderRadius: '8px',
                    padding: '8px 14px', cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  다음 단계 <ChevronRight size={14} />
                </button>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={!isAuthenticated || saving}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    fontSize: '13px', fontWeight: 600,
                    color: '#fff', background: T.m5,
                    border: 'none', borderRadius: '8px',
                    padding: '8px 16px', cursor: isAuthenticated ? 'pointer' : 'default',
                    fontFamily: 'inherit', opacity: !isAuthenticated ? 0.5 : 1,
                  }}
                >
                  <Save size={13} /> 묵상 완료 · 저장
                </button>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── 모바일 플로팅 말씀 버튼 ── */}
      <button
        className="mobile-fab"
        onClick={() => setSheetOpen(true)}
        style={{ background: currentStep.color }}
        title="말씀 보기"
      >
        📖
      </button>

      {/* ── 모바일 바텀 시트 ── */}
      {sheetOpen && (
        <>
          {/* 오버레이 — 터치하면 닫힘 */}
          <div
            className="bs-overlay"
            onClick={() => setSheetOpen(false)}
          />

          {/* 시트 본체 */}
          <div className="bs-sheet">
            {/* 핸들 + 헤더 */}
            <div style={{
              position: 'sticky', top: 0, background: '#fff',
              paddingTop: '12px', paddingBottom: '10px',
              zIndex: 1,
            }}>
              {/* 드래그 핸들 바 */}
              <div style={{
                width: 36, height: 4, borderRadius: 2,
                background: '#e6dfd4', margin: '0 auto 14px',
              }} />
              {/* 헤더 행 */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                paddingBottom: '10px',
                borderBottom: '2px solid #e6dfd4',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: 3, height: 16, borderRadius: 2, background: '#7a4a00' }} />
                  <span style={{ fontSize: '12px', color: '#9e9488', fontStyle: 'italic' }}></span>
                </div>
                <button
                  onClick={() => setSheetOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 20, height: 20, borderRadius: '50%',
                    background: '#f0ebe3', border: 'none', cursor: 'pointer',
                    color: '#6b6358',
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* 컨텍스트 패널 내용 */}
            <div style={{ paddingTop: '4px' }}>
              <UnifiedContextPanel saying={saying} isMobile={true} />
            </div>
          </div>
        </>
      )}

    </div>
  );
}