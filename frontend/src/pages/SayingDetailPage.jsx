// ============================================================
// frontend/src/pages/SayingDetailPage.jsx
//
// 말씀 상세 페이지 — 완전 재설계
// 단일 컬럼 몰입형 레이아웃
// 읽기 → 배경 → 원어 → 병행구절 → 관련 말씀 → 묵상 공간 흐름
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Copy, Check,
  BookOpen, ChevronDown, ChevronUp, Save, Lock,
  Play, Pause, RotateCcw, Trash2, Edit3,
} from 'lucide-react';
import SectionBar from '../components/JesusSayings/SectionBar';
import {
  getSaying,
  getMeditationBySaying,
  createMeditation,
  updateMeditation,
  deleteMeditation,
} from '../api/sayings';
import { useAuth } from '../contexts/AuthContext';

import {
  THEME_COLORS, DEFAULT_THEME_COLOR as DEFAULT_COLOR,
  BOOK_COLORS, BOOK_LABELS, BOOK_ORDER,
  getThemeColorFromSaying,
} from '../constants/themes';

// ─────────────────────────────────────────────────────────
// 디자인 토큰 — Sacra Lectio Praxis 팔레트 (v3)
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
// Sacra Lectio Praxis — 4단계 구조
// ─────────────────────────────────────────────────────────
const SLP_STEPS = [
  {
    key: 'praeparatio',
    roman: 'I',
    latin: 'Praeparatio · Auditio · Illuminatio', 
    label: '고요, 들음, 살핌', 
    badge: '정직 · 낭독 · 발견',
    color: T.m1, colorBg: T.m1bg, colorMid: T.m1mid,
    icon: '🌅',
    desc: '소란한 마음을 내려놓고 숨김없이 하나님 앞에 마주 앉습니다. 말씀을 낮은 소리로 천천히 읽으며 들려오는 말씀에 집중해 보세요. 유독 마음에 걸리는 단어나 문구가 있다면 그 자리에 그대로 머물러보세요.',
    chips: [
      '깊게 세 번 호흡하며, 고요한 침묵 속에 머뭅니다',
      '“주님, 제게 말씀하소서” — 기대하는 마음으로 드리는 기도',
      '낮은 목소리로 본문을 한 자 한 자 천천히 읽어봅니다',
      '마음을 울리는 구절을 발견했다면, 그곳에 잠시 멈추어 봅니다',
    ],
    miniCards: [
      { title: '찬찬히 살피기', desc: '본문에 나타난 인물과 행동, 반복되는 단어를 천천히 눈에 담아봅니다.' },
      { title: '말씀의 배경', desc: '이 말씀이 전해진 시대와 상황, 앞뒤 흐름 속에 담긴 의미를 헤아려봅니다.' },
      { title: '연관된 말씀', desc: '비슷한 울림을 주는 다른 말씀들을 떠올리며 그 깊이를 더해봅니다.' },
      { title: '길잡이 단어', desc: '핵심 단어나 모호한 표현의 원어 의미를 살피며 말씀의 결을 느껴봅니다.' },
      ],
    fields: [  
      { 
        id: 'j0a', 
        label: '마음에 머문 단어 · 구절', 
        placeholder: '낭독하며 걸음이 멈춰진 곳, 유독 마음에 닿은 단어나 문장을 옮겨 적어보세요. 이유를 몰라도 괜찮습니다...' 
      },
      { 
        id: 'j0b', 
        label: '본문에서 새롭게 보인 것들', 
        placeholder: '인물·행동·반복어, 앞뒤 문맥, 연결되는 말씀, 원어의 결 — 살피며 처음 눈에 들어온 것들을 자유롭게...' 
      },
      { 
        id: 'j0c', 
        label: '이 발견들이 함께 가리키는 것', 
        placeholder: '위에서 관찰하고 살핀 것들을 모아볼 때, 오늘 이 말씀이 말하려는 핵심이 무엇으로 느껴지나요? 한두 문장으로...' 
      }, 
    ],
    minutes: 10,
  },
  {
    key: 'meditatio',
    roman: 'II',
    latin: 'Meditatio · Oratio · Applicatio',
    label: '말씀 앞에 서기',
    badge: '거울 · 응답 · 순종',
    color: T.m2, colorBg: T.m2bg, colorMid: T.m2mid,
    icon: '🤲',
    desc: '말씀을 내 삶으로 가져옵니다. 말씀이 오늘 나의 어디에 닿는지 천천히 음미하다 보면, 자연스럽게 드러나는 것들이 생깁니다 — 깨달음, 부끄러움, 감사, 결단. 그것들을 하나님 앞에 솔직하게 내어놓고, 오늘 하루 어떻게 살아낼지 구체적으로 새겨봅니다.',
    chips: [
      '이 말씀이 지금 내 삶의 어디에 말을 걸고 있는가?',
      '말씀 앞에서 드러나는 나의 모습은 어떠한가?',
      '하나님께 무엇을 고백하고, 무엇을 구하는가?',
      '오늘 이 말씀대로 살기 위해 내가 할 한 가지는?',
    ],
    miniCards: [],
    fields: [
      {
        id: 'j1a',
        label: '말씀과 내 삶의 연결 — 묵상',
        placeholder: '이 말씀이 지금 내 삶의 어느 부분에 닿는지, 떠오르는 생각·감정·기억·상황을 자유롭게 적어보세요. 말씀이 드러내는 나의 모습도 함께...',
      },
      {
        id: 'j1b',
        label: '하나님께 드리는 응답 — 기도',
        placeholder: '묵상에서 우러나온 기도를 적어보세요. 감사든, 회개든, 간구든, 형식 없이 솔직하게. 말씀이 먼저 말씀하셨으니, 이제 내가 응답합니다...',
      },
      {
        id: 'j1c',
        label: '오늘의 순종 — 구체적 결단',
        placeholder: '오늘 이 말씀대로 살기 위한 한 가지. 언제, 누구에게, 어떻게 — 구체적일수록 실제가 됩니다...',
      },
    ],
    minutes: 15,
  },
  {
    key: 'contemplatio',
    roman: 'III',
    latin: 'Contemplatio · Quies', // '안식과 쉼'을 뜻하는 부제
    label: '예수님 안에 머물기',
    badge: '안식 · 신뢰 · 임재',
    color: T.m4, colorBg: T.m4bg, colorMid: T.m4mid,
    icon: '✨',
    desc: '이제 모든 것을 내려놓습니다. 앞서 행했던 탐구와 결단, 마음을 짓누르던 열심과 염려, 연약함과 실패, 심지어 오늘의 계획까지도 모두 주님 손에 맡깁니다. 포도나무 되시는 예수님의 안전하고 따스한 품에 그저 머무르세요. 무언가를 하려 애쓰지 않아도 괜찮습니다. 그분의 현존을 누리는 이 침묵이 가장 깊은 기도가 됩니다.',
    chips: [],
    miniCards: [],
    abidePractices: [
      { 
        num: '1', 
        title: '온전한 내어드림', 
        text: '"주님, 제가 여기 있습니다." 묵상하며 얻은 생각들과 마음의 짐들을 그분의 손에 조용히 올려드립니다.' 
      },
      { 
        num: '2', 
        title: '시선의 머묾', 
        text: '다른 생각들이 떠오를 땐 가만히 흘려보내세요. 판단하지 말고, 부드럽게 예수님의 얼굴로 시선을 돌립니다.' 
      },
      { 
        num: '3', 
        title: '가지의 안식', 
        text: '"나는 포도나무요 너희는 가지라." 사랑받는 자녀로서 주님의 생명력이 내 영혼을 적시도록 나를 맡깁니다.' 
      },
      { 
        num: '4', 
        title: '기다림의 평안', 
        text: '무언가를 채우려 하지 않아도 좋습니다. 지금 내 곁에 주님이 계신다는 사실, 그것만으로 충분합니다.' 
      },
    ],
    timerOptions: [5, 10, 15],
    fields: [
      { 
        id: 'j3a', 
        label: '주님 안에서의 머묾', 
        placeholder: '지금 주님의 품 안에서 느끼는 평안과 안식을 잠시 누려보세요. 아무것도 적지 않아도 괜찮습니다...' 
      },
    ],
    minutes: 10,
  },
  {
    key: 'propositum',
    roman: 'IV',
    latin: 'Propositum · Vivendo', // '삶으로 살아내는'이라는 의미
    label: '오늘을 향한 발걸음',
    badge: '동행 · 기도 · 소망',
    color: T.m5, colorBg: T.m5bg, colorMid: T.m5mid,
    icon: '🌿',
    desc: '아침 햇살처럼 따뜻한 말씀의 결실을 하나님 앞에 봉헌합니다. 마음에 새긴 구절과 사랑의 결단, 간절한 기도를 품고 이제 세상 속으로 나아갑니다. 오늘 마주할 모든 순간 속에 살아계실 하나님과의 동행을 설레는 마음으로 기대해 보세요.',
    chips: [],
    miniCards: [],
    fields: [
      {
        id: 'j4a',
        label: '마음에 새긴 생명의 말씀',
        placeholder: '오늘 나를 살게 할 단 한 구절 — 일상의 순간마다 조용히 읊조려 보세요...',
      },
      {
        id: 'j4b',
        label: '사랑으로 맺을 오늘의 열매',
        placeholder: '오늘 저녁 기쁨으로 돌아볼 수 있는, 작지만 구체적인 순종 한 가지...',
      },
      {
        id: 'j4c',
        label: '주님께 드리는 기도와 감사',
        placeholder: '오늘의 감사와 간구, 특별히 마음이 쓰이는 이들을 위한 중보 기도를 담아보세요...',
      },
      {
        id: 'j4d',
        label: '기대하는 하나님의 손길',
        placeholder: '오늘 하나님이 어떤 놀라운 일을 행하실지, 내 삶의 어디에서 그분을 만날지 소망해 봅니다...',
      },
    ],
    minutes: 5,
  },
]
// ─────────────────────────────────────────────────────────
// 공통 스타일
// ─────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes slideDown { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 2000px; } }
  .saying-detail-section { animation: fadeIn 0.4s ease both; }
  .keyword-card { transition: all 0.22s ease; }
  .keyword-card:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
  .related-link:hover { border-color: #AFA9EC !important; background: #FDFBF7 !important; }
`;

// ─────────────────────────────────────────────────────────
// 섹션 헤더
// ─────────────────────────────────────────────────────────
function SectionLabel({ children, sub }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <p style={{
        fontSize: '13px', fontWeight: 700, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: '#7a7470', margin: 0,
      }}>
        {children}
      </p>
      {sub && (
        <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px', fontFamily: "'Gowun Batang', serif" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 황금 구분선
// ─────────────────────────────────────────────────────────
function GoldDivider({ color = '#C9A96E' }) {
  return (
    <div style={{ margin: '48px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, #e9e4dc)' }} />
      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, opacity: 0.5 }} />
      <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, #e9e4dc)' }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 원어 키워드 카드
// ─────────────────────────────────────────────────────────
function KeywordCard({ kw, accentColor }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div
      className="keyword-card"
      onClick={() => setFlipped(f => !f)}
      style={{
        cursor: 'pointer',
        minWidth: '210px',
        maxWidth: '250px',
        flexShrink: 0,
        border: `1px solid ${flipped ? accentColor.border : '#e9e4dc'}`,
        borderRadius: '14px',
        padding: '18px',
        background: flipped ? accentColor.bg : '#fff',
        userSelect: 'none',
      }}
    >
      {!flipped ? (
        <>
          <p style={{ fontSize: '17px', fontWeight: 700, color: accentColor.text, marginBottom: '6px' }}>
            {kw.word}
          </p>
          <p style={{
            fontSize: '13px', color: accentColor.gold, fontStyle: 'italic',
            marginBottom: '4px', fontFamily: 'serif',
          }}>
            {kw.original}
          </p>
          <p style={{ fontSize: '12px', color: '#9ca3af', letterSpacing: '0.02em' }}>
            {kw.transliteration}
          </p>
          <p style={{ fontSize: '10px', color: '#c4bfb8', marginTop: '12px', letterSpacing: '0.05em' }}>
            탭하여 의미 보기 →
          </p>
        </>
      ) : (
        <>
          <p style={{ fontSize: '10px', color: accentColor.gold, marginBottom: '8px', fontWeight: 700, letterSpacing: '0.06em' }}>
            {kw.word} — 의미
          </p>
          <p style={{
            fontSize: '13px', color: accentColor.text, lineHeight: 1.75,
            fontFamily: "'Gowun Batang', serif",
          }}>
            {kw.meaning}
          </p>
          <p style={{ fontSize: '10px', color: '#c4bfb8', marginTop: '12px' }}>← 탭하여 닫기</p>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 원형 타이머 SVG
// ─────────────────────────────────────────────────────────
function CircleTimer({ progress, color, mm, ss, size = 56 }) {
  const r = (size / 2) - 4;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.paper3} strokeWidth="3" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - progress)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '11px', fontWeight: 700, color,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {mm}:{ss}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 단계별 타이머 훅
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
// 단계 카드
// ─────────────────────────────────────────────────────────
function StepCard({ stepData, values, onChange, isOpen, onToggle }) {
  const s = stepData;
  const { elapsed, running, mm, ss, progress, totalSec, start, pause, reset } = useStepTimer(s.minutes);
  const [timerMin, setTimerMin] = useState(s.minutes);

  const handleStart = () => {
    if (s.timerOptions) { reset(); start(timerMin); }
    else start();
  };

  const isDone = elapsed >= (timerMin ?? s.minutes) * 60;

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${T.paper3}`,
      borderRadius: '10px',
      marginBottom: '10px',
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(26,23,20,0.07)',
    }}>
      {/* 헤더 */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '14px 16px', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: s.colorBg, color: s.color,
          fontSize: '11px', fontWeight: 600, flexShrink: 0,
          fontFamily: 'Georgia, serif', fontStyle: 'italic',
        }}>
          {s.roman}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', color: T.ink4, fontStyle: 'italic', marginBottom: '1px' }}>{s.latin}</div>
          <div style={{ fontSize: '16px', fontWeight: 500, color: T.ink }}>{s.label}</div>
        </div>
        <span style={{
          fontSize: '11px', padding: '3px 9px',
          borderRadius: '20px', whiteSpace: 'nowrap', flexShrink: 0,
          background: s.colorBg, color: s.color,
        }}>
          {s.badge}
        </span>
        <span style={{
          fontSize: '11px', color: T.ink5, flexShrink: 0,
          transition: 'transform 0.25s',
          transform: isOpen ? 'rotate(180deg)' : 'none',
        }}>▼</span>
      </div>

      {/* 바디 */}
      {isOpen && (
        <div style={{ borderTop: `1px solid ${T.paper3}` }}>
          <div style={{ padding: '16px' }}>

            {/* 설명 */}
            <div style={{
              fontSize: '14px', color: T.ink3, lineHeight: 1.85,
              padding: '10px 14px', background: T.paper,
              borderRadius: '8px', borderLeft: `2.5px solid ${T.paper3}`,
              marginBottom: '14px',
            }}>
              {s.desc}
            </div>

            {/* 프롬프트 칩 */}
            {s.chips && s.chips.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '14px' }}>
                {s.chips.map((c, i) => (
                  <div key={i} style={{
                    fontSize: '12.5px', color: T.ink2,
                    padding: '7px 12px', background: T.paper,
                    borderRadius: '7px', lineHeight: 1.5,
                    display: 'flex', alignItems: 'flex-start', gap: '8px',
                  }}>
                    <span style={{ color: T.ink4, flexShrink: 0 }}>·</span> {c}
                  </div>
                ))}
              </div>
            )}

            {/* 미니 카드 그리드 */}
            {s.miniCards && s.miniCards.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
                {s.miniCards.map((mc, i) => (
                  <div key={i} style={{ background: T.paper, borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: T.ink2, marginBottom: '3px' }}>{mc.title}</div>
                    <div style={{ fontSize: '12.5px', color: T.ink3, lineHeight: 1.55 }}>{mc.desc}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Contemplatio: 머물기 실천 가이드 */}
            {s.abidePractices && (
              <div style={{
                background: T.m4bg, borderRadius: '9px',
                padding: '14px', marginBottom: '14px',
              }}>
                <div style={{
                  fontStyle: 'italic', fontSize: '13px',
                  color: T.m4, fontWeight: 500, marginBottom: '10px',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  머물기 실천 가이드
                  <div style={{ flex: 1, height: 1, background: T.m4mid, opacity: 0.4 }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {s.abidePractices.map((a, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'flex-start', gap: '10px',
                      background: '#fff', borderRadius: '7px', padding: '9px 12px',
                      borderLeft: `2.5px solid ${T.m4mid}`,
                    }}>
                      <span style={{ fontStyle: 'italic', fontSize: '13px', color: T.m4, minWidth: 18, fontWeight: 500 }}>{a.num}</span>
                      <span style={{ fontSize: '13.5px', color: T.ink2, lineHeight: 1.65 }}>
                        <strong style={{ color: T.m4 }}>{a.title}</strong> — {a.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 타이머 */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '16px',
              marginBottom: '20px', flexWrap: 'wrap',
            }}>
              <CircleTimer progress={progress} color={s.color} mm={mm} ss={ss} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', color: T.ink4, marginBottom: '8px' }}>
                  권장 시간: {s.minutes}분
                </div>
                {/* 시간 선택 버튼 (Contemplatio 전용) */}
                {s.timerOptions && (
                  <div style={{ display: 'flex', gap: '5px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    {s.timerOptions.map(m => (
                      <button
                        key={m}
                        onClick={() => { setTimerMin(m); reset(); }}
                        style={{
                          fontSize: '11.5px', padding: '4px 11px',
                          borderRadius: '20px', cursor: 'pointer',
                          fontFamily: 'inherit',
                          background: timerMin === m ? s.color : '#fff',
                          color: timerMin === m ? '#fff' : s.color,
                          border: `1px solid ${s.colorMid}`,
                          transition: 'all 0.15s',
                        }}
                      >
                        {m}분
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                  {!running ? (
                    <button
                      onClick={handleStart}
                      disabled={isDone}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '7px 14px', borderRadius: '8px',
                        fontSize: '12px', fontWeight: 600,
                        background: isDone ? '#e5e7eb' : s.color,
                        color: isDone ? T.ink4 : '#fff',
                        border: 'none', cursor: isDone ? 'default' : 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <Play size={11} />
                      {isDone ? '완료 🌿' : elapsed > 0 ? '계속' : '시작'}
                    </button>
                  ) : (
                    <button
                      onClick={pause}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '7px 14px', borderRadius: '8px',
                        fontSize: '12px', fontWeight: 600,
                        background: s.color, color: '#fff',
                        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <Pause size={11} /> 일시정지
                    </button>
                  )}
                  <button
                    onClick={reset}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '7px 11px', borderRadius: '8px',
                      fontSize: '12px', color: T.ink4,
                      background: 'transparent', border: `1px solid ${T.paper3}`,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <RotateCcw size={11} /> 초기화
                  </button>
                </div>
              </div>
            </div>

            {/* Walk-word 표시 (Contemplatio 전용) */}
            {s.key === 'contemplatio' && values['j3a'] && (
              <div style={{
                fontStyle: 'italic', fontSize: '13.5px',
                padding: '8px 12px', background: '#fff', borderRadius: '7px',
                marginBottom: '10px',
                borderLeft: `2.5px solid ${T.m3mid}`, color: T.m3,
              }}>
                ✦ {values['j3a']}
              </div>
            )}

            {/* 입력 필드들 */}
            {s.fields.map(f => (
              <div key={f.id} style={{ marginBottom: '10px' }}>
                <div style={{
                  fontSize: '12px', fontWeight: 600, color: T.ink4,
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  marginBottom: '5px',
                }}>
                  {f.label}
                </div>
                <textarea
                  value={values[f.id] || ''}
                  onChange={e => onChange(f.id, e.target.value)}
                  placeholder={f.placeholder}
                  rows={3}
                  style={{
                    width: '100%', border: `1px solid ${T.paper3}`,
                    borderRadius: '8px', padding: '10px 12px',
                    fontSize: '14px', fontFamily: "'Gowun Batang', serif",
                    color: T.ink, background: '#fff',
                    resize: 'vertical', lineHeight: 1.75,
                    outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => e.target.style.borderColor = T.ink4}
                  onBlur={e => e.target.style.borderColor = T.paper3}
                />
              </div>
            ))}

            {/* Propositum 마무리 안내 */}
            {s.key === 'propositum' && (
              <div style={{
                marginTop: '8px', padding: '10px 14px',
                background: T.m5bg, borderRadius: '8px',
                fontSize: '12px', color: T.m5, lineHeight: 1.7,
              }}>
                🌅 저녁 묵상을 시작할 때, 지금 여기 적은 핵심 말씀과 결단을 먼저 읽으며 시작하세요. 아침과 저녁이 하나로 이어집니다.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// SacraLectioGuide — 5단계 묵상 가이드 (SayingDetailPage 전용)
// ─────────────────────────────────────────────────────────
function SacraLectioGuide({ onSendToNote }) {
  const [openStep, setOpenStep] = useState(0);
  const [values, setValues] = useState({});
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [passage, setPassage] = useState('');

  const handleChange = (id, val) => setValues(prev => ({ ...prev, [id]: val }));

  const doneSteps = SLP_STEPS.map(s =>
    s.fields.some(f => (values[f.id] || '').trim().length > 0)
  );
  const doneCount = doneSteps.filter(Boolean).length;

  const buildExportText = () => {
    const g = id => (values[id] || '').trim();
    return [
      `=== Sacra Lectio Praxis — 아침 묵상 ===`,
      `날짜: ${date}  |  본문: ${passage}`,
      ``,
      `[I. 준비·듣기·탐구]`,
      `나의 상태 / 초대 기도: ${g('j0a')}`,
      `마음에 닿은 단어·구절: ${g('j0b')}`,
      `관찰·문맥·연관구절·원어: ${g('j0c')}`,
      ``,
      `[II. 묵상]`,
      `말씀과 내 삶의 연결: ${g('j1a')}`,
      `깨달음: ${g('j1b')}`,
      ``,
      `[III. 기도·결단]`,
      `기도: ${g('j2a')}`,
      `결단 대상·상황: ${g('j2b')}`,
      `구체적 행동: ${g('j2c')}`,
      `회개: ${g('j2d')}`,
      ``,
      `[IV. 관상·머물기]`,
      `하루 동행 단어: ${g('j3a')}`,
      `오늘의 증언: ${g('j3b')}`,
      ``,
      `[V. 결단 요약]`,
      `핵심 말씀: ${g('j4a')}`,
      `오늘 순종할 한 가지: ${g('j4b')}`,
      `기대하는 하나님의 일하심: ${g('j4c')}`,
    ].join('\n');
  };

  const handleCopy = () => {
    const txt = buildExportText();
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => alert('묵상 내용이 복사되었습니다'));
  };

  const handleSendToNote = () => {
    if (onSendToNote) onSendToNote(buildExportText());
  };

  return (
    <div style={{
      background: T.paper,
      border: `1px solid ${T.paper3}`,
      borderRadius: '16px',
      overflow: 'hidden',
      marginBottom: '24px',
    }}>
    {/* 헤더 */}
    <div style={{
      textAlign: 'center',
      padding: '20px 20px 16px',
      borderBottom: `1px solid ${T.paper3}`,
      background: '#fff',
    }}>
      <div style={{
        fontSize: '12px', color: T.ink4,
        letterSpacing: '0.14em', marginBottom: '8px',
        fontStyle: 'italic',
      }}>
        Lectio · Meditatio · Oratio · Contemplatio
      </div>
      <div style={{
        fontSize: '18px', fontWeight: 500, color: T.ink,
        marginBottom: '6px',
        fontFamily: "'Gowun Batang', serif",
      }}>
        말씀 앞에 고요히 머무는 시간
      </div>
      <div style={{ fontSize: '13px', color: T.ink3, lineHeight: 1.9 }}>
        듣고, 깨닫고, 응답하고, 그분 안에 거합니다
      </div>
    </div>

      {/* 날짜 + 본문 */}
      <div style={{
        display: 'flex', gap: '10px', padding: '14px 16px',
        borderBottom: `1px solid ${T.paper3}`,
        background: T.paper2,
      }}>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{
            fontFamily: 'inherit', fontSize: '13px', padding: '7px 11px',
            border: `1px solid ${T.paper3}`, borderRadius: '8px',
            background: '#fff', color: T.ink, outline: 'none', width: '148px', flexShrink: 0,
          }}
        />
        <input
          type="text"
          value={passage}
          onChange={e => setPassage(e.target.value)}
          placeholder="본문 (예: 요한복음 15:1–11)"
          style={{
            fontFamily: 'inherit', fontSize: '13px', padding: '7px 11px',
            border: `1px solid ${T.paper3}`, borderRadius: '8px',
            background: '#fff', color: T.ink, outline: 'none', flex: 1,
          }}
        />
      </div>

      {/* 진행 바 */}
      <div style={{ display: 'flex', gap: '5px', padding: '12px 16px', background: T.paper2 }}>
        {SLP_STEPS.map((s, i) => (
          <div
            key={s.key}
            title={s.label}
            style={{
              flex: 1, height: '3px', borderRadius: '2px',
              background: doneSteps[i] ? s.color : T.paper3,
              transition: 'background 0.4s',
            }}
          />
        ))}
      </div>

      {/* 세션 배너 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 16px', margin: '14px 16px',
        borderRadius: '10px',
        background: T.m1bg, border: `1px solid ${T.m1mid}`,
        color: T.m1, fontSize: '13.5px', lineHeight: 1.6,
      }}>
        <span style={{ fontSize: '18px' }}>🌅</span>
        <span>
          <strong style={{ fontWeight: 600, display: 'block', marginBottom: '2px' }}>아침 묵상 — 말씀으로 깨어나는 하루</strong>
          고요한 아침, 먼저 들려오는 말씀에 귀를 기울입니다. 그 안에 담긴 깊은 의미를 살피고 묵상하며, 진실한 기도와 삶의 결단으로 응답합니다. 이제 주님 안에 평안히 머물며 오늘 하루를 시작합니다.
        </span>
      </div>

      {/* 단계 카드들 */}
      <div style={{ padding: '0 16px' }}>
        {SLP_STEPS.map((s, i) => (
          <StepCard
            key={s.key}
            stepData={s}
            values={values}
            onChange={handleChange}
            isOpen={openStep === i}
            onToggle={() => setOpenStep(openStep === i ? -1 : i)}
          />
        ))}
      </div>

      {/* 내보내기 바 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        padding: '14px 16px', marginTop: '14px',
        borderTop: `1px solid ${T.paper3}`, background: T.paper2,
      }}>
        <span style={{ fontSize: '12px', color: T.ink3 }}>
          {doneCount}/{SLP_STEPS.length} 단계 완료
        </span>
        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
          <button
            onClick={handleCopy}
            style={{
              fontSize: '12px', padding: '6px 14px',
              border: `1px solid ${T.paper3}`, borderRadius: '20px',
              background: '#fff', color: T.ink3, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all 0.15s',
            }}
          >
            텍스트로 복사
          </button>
          {onSendToNote && (
            <button
              onClick={handleSendToNote}
              style={{
                fontSize: '12px', padding: '6px 14px',
                border: `1px solid ${T.m1mid}`, borderRadius: '20px',
                background: T.m1bg, color: T.m1, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'all 0.15s',
              }}
            >
              묵상 노트에 저장 ↗
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// MeditationSection
// ─────────────────────────────────────────────────────────
function MeditationSection({ sayingId, accentColor }) {
  const { isAuthenticated } = useAuth();
  const [meditations, setMeditations] = useState([]);
  const [content, setContent] = useState('');
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !sayingId) return;
    getMeditationBySaying(sayingId).then(d => {
      if (Array.isArray(d)) setMeditations(d);
    });
  }, [isAuthenticated, sayingId]);

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    if (editId) {
      const updated = await updateMeditation(editId, { content, saying: sayingId });
      if (updated) {
        setMeditations(m => m.map(x => x.id === editId ? updated : x));
        setEditId(null);
      }
    } else {
      const created = await createMeditation({ content, saying: sayingId });
      if (created) setMeditations(m => [created, ...m]);
    }
    setContent('');
    setSaving(false);
  };

  const handleEdit = (m) => { setEditId(m.id); setContent(m.content); };

  const handleDelete = async (id) => {
    if (!window.confirm('이 묵상을 삭제하시겠습니까?')) return;
    const ok = await deleteMeditation(id);
    if (ok) setMeditations(m => m.filter(x => x.id !== id));
  };

  const formatDate = (str) => {
    if (!str) return '';
    const d = new Date(str);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  // 가이드 내보내기 → 노트 자동 입력
  const handleReceiveFromGuide = (txt) => {
    setContent(prev => prev ? prev + '\n\n' + txt : txt);
    setShowGuide(false);
  };

  const ac = accentColor || { text: T.m1, border: T.m1mid, bg: T.m1bg };

  return (
    <div>
      {/* Sacra Lectio Praxis 토글 버튼 */}
      <button
        onClick={() => setShowGuide(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '13px', color: T.m1,
          background: showGuide ? T.m1bg : 'transparent',
          border: `1px solid ${T.m1mid}`,
          borderRadius: '10px', padding: '9px 18px',
          cursor: 'pointer', marginBottom: '20px',
          fontFamily: 'inherit', transition: 'all 0.2s',
          fontWeight: showGuide ? 600 : 400,
        }}
      >
        <BookOpen size={14} />
        {showGuide ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        <span>Sacra Lectio Praxis — 말씀 묵상 가이드</span>
      </button>

      {/* 가이드 패널 */}
      {showGuide && (
        <SacraLectioGuide onSendToNote={handleReceiveFromGuide} />
      )}

      {/* 묵상 노트 작성 */}
      {isAuthenticated ? (
        <div>
          <div style={{
            border: `1px solid ${T.paper3}`,
            borderRadius: '14px', overflow: 'hidden', background: '#FDFBF7',
          }}>
            <div style={{ padding: '12px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: T.ink4, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                {editId ? '묵상 노트 수정' : '묵상 노트 기록'}
              </span>
              {!editId && (
                <span style={{ fontSize: '11px', color: T.ink5 }}>
                  위 가이드 완료 후 "묵상 노트에 저장"을 누르거나 직접 입력하세요
                </span>
              )}
            </div>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={5}
              placeholder="이 말씀을 통해 받은 은혜, 깨달음, 기도를 자유롭게 기록하세요..."
              style={{
                width: '100%', padding: '14px 20px',
                fontSize: '14px', fontFamily: "'Gowun Batang', serif",
                lineHeight: 1.9, color: '#1f2937',
                background: 'transparent', border: 'none',
                outline: 'none', resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 20px', borderTop: `1px solid ${T.paper3}`,
              background: T.paper,
            }}>
              <span style={{ fontSize: '12px', color: T.ink4 }}>
                {content.length > 0 ? `${content.length}자` : ''}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {editId && (
                  <button
                    onClick={() => { setEditId(null); setContent(''); }}
                    style={{
                      padding: '7px 14px', borderRadius: '8px',
                      fontSize: '12px', color: T.ink4,
                      background: 'transparent', border: `1px solid ${T.paper3}`,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    취소
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || !content.trim()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '7px 18px', borderRadius: '8px',
                    fontSize: '12px', fontWeight: 600, color: '#fff',
                    background: saving || !content.trim() ? T.ink5 : ac.text,
                    border: 'none',
                    cursor: saving || !content.trim() ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', transition: 'background 0.2s',
                  }}
                >
                  <Save size={12} />
                  {saving ? '저장 중...' : editId ? '수정 완료' : '저장'}
                </button>
              </div>
            </div>
          </div>

          {/* 기록된 묵상들 */}
          {meditations.length > 0 && (
            <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {meditations.map(m => (
                <div
                  key={m.id}
                  style={{
                    background: '#fff', border: `1px solid ${T.paper3}`,
                    borderRadius: '12px', padding: '18px 20px',
                    borderLeft: `3px solid ${ac.border}`,
                  }}
                >
                  <p style={{
                    fontSize: '14px', fontFamily: "'Gowun Batang', serif",
                    lineHeight: 1.9, color: '#1f2937',
                    whiteSpace: 'pre-wrap', margin: '0 0 14px',
                  }}>
                    {m.content}
                  </p>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    paddingTop: '12px', borderTop: '1px solid #f3f4f6',
                  }}>
                    <span style={{ fontSize: '11px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {formatDate(m.created_at)}
                      {m.is_private && <><Lock size={10} /> 비공개</>}
                    </span>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        onClick={() => handleEdit(m)}
                        style={{
                          fontSize: '12px', color: ac.text,
                          background: 'none', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '3px',
                          fontFamily: 'inherit', padding: 0,
                        }}
                      >
                        <Edit3 size={11} /> 수정
                      </button>
                      <button
                        onClick={() => handleDelete(m.id)}
                        style={{
                          fontSize: '12px', color: '#fca5a5',
                          background: 'none', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '3px',
                          fontFamily: 'inherit', padding: 0,
                        }}
                      >
                        <Trash2 size={11} /> 삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          background: '#fff', border: `1px solid ${T.paper3}`,
          borderRadius: '14px', padding: '32px', textAlign: 'center',
        }}>
          <p style={{
            fontSize: '15px', color: '#6b7280', marginBottom: '16px',
            fontFamily: "'Gowun Batang', serif", lineHeight: 1.8,
          }}>
            묵상을 기록하려면 로그인이 필요합니다
          </p>
          <Link
            to="/login"
            style={{
              display: 'inline-block', padding: '10px 24px',
              borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              background: ac.text, color: '#fff',
              textDecoration: 'none',
            }}
          >
            로그인하기
          </Link>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// 메인: SayingDetailPage
// ══════════════════════════════════════════════════════════
export default function SayingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [saying, setSaying] = useState(null);
  const [trans, setTrans] = useState('krv');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [bgOpen, setBgOpen] = useState(true);

  useEffect(() => {
    setLoading(true);
    window.scrollTo({ top: 0 });
    getSaying(id).then(d => {
      if (d) setSaying(d);
      else navigate('/sayings');
      setLoading(false);
    });
  }, [id]);

  const handleCopy = () => {
    if (!saying) return;
    const text = trans === 'krv' ? saying.text_ko_krv : (saying.text_ko_new || saying.text_ko_krv);
    navigator.clipboard.writeText(`${text}\n— ${saying.reference}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const goBack = () => navigate('/sayings');

  const parallelMap = {};
  (saying?.parallels ?? []).forEach(p => { parallelMap[p.book] = p; });
  const hasParallels = Object.keys(parallelMap).length > 0;

  const ac = getThemeColorFromSaying(saying);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#FDFBF7' }}>
        <SectionBar />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', paddingTop: '120px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            border: '3px solid #e5e7eb', borderTopColor: '#7F77DD',
            animation: 'spin 0.7s linear infinite',
          }} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!saying) return null;

  const bodyText = trans === 'krv' ? saying.text_ko_krv : (saying.text_ko_new || saying.text_ko_krv);

  return (
    <div style={{ minHeight: '100vh', background: '#FDFBF7' }}>
      <style>{GLOBAL_CSS}</style>
      <SectionBar />

      {/* ── 헤더 영역 ── */}
      <div style={{
        background: `linear-gradient(180deg, ${ac.bg} 0%, #FDFBF7 100%)`,
        paddingTop: '28px', paddingBottom: '0',
      }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 24px' }}>

          {/* 상단 네비게이션 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '28px',
          }}>
            <button
              onClick={goBack}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '14px', color: '#9ca3af',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '6px 10px 6px 0', fontFamily: 'inherit',
              }}
            >
              <ChevronLeft size={14} />
              말씀 목록
            </button>

            {(saying.related_sayings ?? []).length > 0 && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <Link
                  to={`/sayings/${saying.related_sayings[0].id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    fontSize: '13px', color: ac.text,
                    textDecoration: 'none', padding: '6px 12px',
                    border: `1px solid ${ac.border}`, borderRadius: '8px',
                    background: '#fff',
                  }}
                >
                  관련 말씀 <ChevronRight size={13} />
                </Link>
              </div>
            )}
          </div>

          {/* 상황/출처 배지 */}
          {saying.occasion && (
            <div style={{ marginBottom: '10px' }}>
              <span style={{
                fontSize: '12px', fontWeight: 600,
                letterSpacing: '0.05em', color: ac.text,
                background: ac.bg, border: `1px solid ${ac.border}`,
                padding: '4px 12px', borderRadius: '999px',
              }}>
                {saying.occasion}
              </span>
            </div>
          )}

          {/* 성경 참조 */}
          <h1 style={{
            fontSize: 'clamp(24px, 4vw, 32px)',
            fontWeight: 700, color: '#1f2937',
            marginBottom: '8px', letterSpacing: '-0.01em',
          }}>
            {saying.reference}
          </h1>

          {/* 주제 태그 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '32px' }}>
            {(saying.themes ?? []).map(t => {
              const c = THEME_COLORS[t.key] ?? DEFAULT_COLOR;
              return (
                <Link
                  key={t.key}
                  to={`/sayings?theme=${t.key}`}
                  style={{
                    fontSize: '13px', fontWeight: 500,
                    padding: '4px 12px', borderRadius: '999px',
                    background: c.bg, color: c.text,
                    border: `1px solid ${c.border}`,
                    textDecoration: 'none',
                  }}
                >
                  {t.name_ko}
                </Link>
              );
            })}
            {saying.size && (
              <span style={{
                fontSize: '13px', padding: '4px 12px', borderRadius: '999px',
                background: '#F1EFE8', color: '#5F5E5A', border: '1px solid #D3D1C7',
              }}>
                {{ S: '단문', M: '중문', L: '장문' }[saying.size] || saying.size}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── 말씀 본문 카드 ── */}
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 24px' }}>
        <div style={{
          background: '#fff',
          border: '1px solid #e9e4dc',
          borderLeft: `4px solid ${ac.gold}`,
          borderRadius: '0 16px 16px 0',
          padding: '28px 32px',
          marginBottom: '8px',
        }}>
          {/* 번역 토글 + 복사 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '20px',
          }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['krv', 'new'].map(t => (
                <button
                  key={t}
                  onClick={() => setTrans(t)}
                  style={{
                    padding: '5px 14px', borderRadius: '7px',
                    fontSize: '13px', fontWeight: trans === t ? 600 : 400,
                    border: trans === t ? `1px solid ${ac.border}` : '1px solid #e5e7eb',
                    background: trans === t ? ac.bg : 'transparent',
                    color: trans === t ? ac.text : '#9ca3af',
                    cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
                  }}
                >
                  {t === 'krv' ? '개역개정' : '새번역'}
                </button>
              ))}
            </div>
            <button
              onClick={handleCopy}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '5px 12px', borderRadius: '7px',
                fontSize: '13px', color: copied ? '#27500A' : '#9ca3af',
                background: copied ? '#EAF3DE' : 'transparent',
                border: `1px solid ${copied ? '#97C459' : '#e5e7eb'}`,
                cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? '복사됨' : '복사'}
            </button>
          </div>

          {/* 말씀 본문 */}
          <p style={{
            fontFamily: "'Gowun Batang', serif",
            fontSize: 'clamp(18px, 2.6vw, 23px)',
            lineHeight: 2.1, color: '#1f2937',
            margin: 0, letterSpacing: '0.01em',
          }}>
            "{bodyText}"
          </p>
        </div>

        {/* 번역 출처 */}
        <p style={{ fontSize: '12px', color: '#c4bfb8', textAlign: 'right', marginBottom: '0' }}>
          {trans === 'krv' ? '개역개정' : '새번역'} · {saying.reference}
        </p>
      </div>

      {/* ── 본문 섹션들 ── */}
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 24px 80px' }}>

        {/* 섹션 1: 말씀의 배경 */}
        <div style={{ marginTop: '48px' }} className="saying-detail-section">
          <button
            onClick={() => setBgOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', background: 'none', border: 'none',
              cursor: 'pointer', padding: 0, marginBottom: bgOpen ? '16px' : 0,
              fontFamily: 'inherit',
            }}
          >
            <SectionLabel>말씀의 배경</SectionLabel>
            <span style={{ color: '#c4bfb8', flexShrink: 0 }}>
              {bgOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>

          {bgOpen && (
            <div style={{
              background: '#fff', border: '1px solid #e9e4dc',
              borderRadius: '14px', padding: '22px 26px',
            }}>
              <p style={{
                fontFamily: "'Gowun Batang', serif",
                fontSize: '15px', lineHeight: 1.95,
                color: '#374151', margin: 0,
              }}>
                {saying.context_ko || '배경 설명이 준비 중입니다.'}
              </p>
              {saying.occasion && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  marginTop: '16px', paddingTop: '14px',
                  borderTop: '1px solid #f3f4f6',
                }}>
                  <BookOpen size={12} style={{ color: '#c4bfb8' }} />
                  <span style={{ fontSize: '13px', color: '#9ca3af' }}>
                    {saying.occasion} — {saying.reference}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 섹션 2: 원어 키워드 */}
        {(saying.keywords ?? []).length > 0 && (
          <>
            <GoldDivider color={ac.gold} />
            <div className="saying-detail-section">
              <SectionLabel sub="카드를 탭하면 원어 의미가 펼쳐집니다">핵심 단어 — 원어 해설</SectionLabel>
              <div style={{
                display: 'flex', gap: '12px',
                overflowX: 'auto', paddingBottom: '12px',
                scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
              }}>
                <style>{`.keyword-scroll::-webkit-scrollbar { display: none; }`}</style>
                {saying.keywords.map((kw, i) => (
                  <KeywordCard key={i} kw={kw} accentColor={ac} />
                ))}
              </div>
            </div>
          </>
        )}

        {/* 섹션 3: 병행구절 */}
        {hasParallels && (
          <>
            <GoldDivider color={ac.gold} />
            <div className="saying-detail-section">
              <SectionLabel>병행구절 — 4복음서 비교</SectionLabel>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '10px',
              }}>
                {BOOK_ORDER.map(book => {
                  const p = parallelMap[book];
                  const isCurrent = book === saying.book;
                  const bc = BOOK_COLORS[book] ?? { bg: '#F1EFE8', text: '#444441', border: '#D3D1C7' };
                  if (!p && !isCurrent) return null;
                  return (
                    <div
                      key={book}
                      style={{
                        border: `1px solid ${isCurrent ? ac.border : (p ? bc.border : '#f3f4f6')}`,
                        borderRadius: '12px', overflow: 'hidden',
                        background: isCurrent ? ac.bg : (p ? '#fff' : '#f9fafb'),
                        opacity: p || isCurrent ? 1 : 0.5,
                      }}
                    >
                      <div style={{
                        padding: '10px 14px',
                        background: isCurrent ? ac.bg : bc.bg,
                        borderBottom: `1px solid ${(isCurrent ? ac.border : bc.border)}30`,
                        display: 'flex', alignItems: 'center', gap: '8px',
                      }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: isCurrent ? ac.text : bc.text }}>
                          {BOOK_LABELS[book]}
                        </span>
                        {isCurrent && (
                          <span style={{
                            fontSize: '10px', padding: '1px 7px', borderRadius: '999px',
                            background: ac.text, color: '#fff',
                          }}>현재</span>
                        )}
                        {p?.reference && !isCurrent && (
                          <span style={{ fontSize: '11px', color: `${bc.text}99` }}>{p.reference}</span>
                        )}
                      </div>
                      <div style={{ padding: '12px 14px' }}>
                        {isCurrent ? (
                          <p style={{
                            fontSize: '13px', lineHeight: 1.8,
                            color: '#1f2937', margin: 0,
                            fontFamily: "'Gowun Batang', serif",
                          }}>
                            {saying.text_ko_krv?.slice(0, 100)}{saying.text_ko_krv?.length > 100 ? '…' : ''}
                          </p>
                        ) : p ? (
                          <>
                            <p style={{
                              fontSize: '13px', lineHeight: 1.8,
                              color: '#1f2937', margin: '0 0 10px',
                              fontFamily: "'Gowun Batang', serif",
                            }}>
                              {p.text_ko_krv?.slice(0, 100)}{p.text_ko_krv?.length > 100 ? '…' : ''}
                            </p>
                            <Link
                              to={`/sayings/${p.id}`}
                              style={{
                                fontSize: '13px', color: bc.text,
                                textDecoration: 'none',
                                display: 'inline-flex', alignItems: 'center', gap: '3px',
                              }}
                            >
                              상세 보기 <ChevronRight size={11} />
                            </Link>
                          </>
                        ) : (
                          <p style={{ fontSize: '12px', color: '#d1d5db', fontStyle: 'italic' }}>
                            이 사건의 기록 없음
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* 섹션 4: 관련 말씀 */}
        {(saying.related_sayings ?? []).length > 0 && (
          <>
            <GoldDivider color={ac.gold} />
            <div className="saying-detail-section">
              <SectionLabel>관련 말씀</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {saying.related_sayings.slice(0, 3).map((r, i) => (
                  <Link
                    key={i}
                    to={`/sayings/${r.id}`}
                    className="related-link"
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '14px',
                      padding: '16px 18px', borderRadius: '12px',
                      border: '1px solid #e9e4dc', background: '#fff',
                      textDecoration: 'none', transition: 'all 0.2s',
                    }}
                  >
                    <span style={{
                      fontSize: '13px', fontWeight: 700, color: ac.text,
                      whiteSpace: 'nowrap', marginTop: '2px', flexShrink: 0,
                    }}>
                      {r.reference}
                    </span>
                    <span style={{
                      fontSize: '14px', color: '#4b5563', lineHeight: 1.75,
                      fontFamily: "'Gowun Batang', serif", flex: 1,
                    }}>
                      {r.text_ko_krv?.slice(0, 80)}{r.text_ko_krv?.length > 80 ? '…' : ''}
                    </span>
                    <ChevronRight size={14} style={{ color: '#d1d5db', flexShrink: 0, marginTop: '3px' }} />
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── 묵상 공간 ── */}
        <div style={{ marginTop: '60px' }}>
          <div style={{
            background: `linear-gradient(135deg, ${ac.bg} 0%, #F7F5F0 100%)`,
            border: `1px solid ${ac.border}40`,
            borderRadius: '16px',
            padding: '24px 28px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '14px', flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '3px', height: '36px',
                background: `linear-gradient(to bottom, ${ac.gold}, transparent)`,
                borderRadius: '2px', flexShrink: 0,
              }} />
              <div>
                <p style={{
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: '#b0aaa0', margin: '0 0 4px',
                }}>
                  Lectio · Meditatio · Oratio · Contemplatio
                </p>
                <p style={{
                  fontSize: '15px', color: ac.text,
                  fontFamily: "'Gowun Batang', serif", margin: 0,
                  lineHeight: 1.7,
                }}>
                  말씀 앞에 고요히 앉아, 듣고 깨닫고 응답하며 그분 안에 머뭅니다
                </p>
              </div>
            </div>
            <Link
              to={`/sayings/${id}/meditate`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '10px 20px', borderRadius: '10px',
                fontSize: '14px', fontWeight: 600,
                color: '#fff', background: ac.text,
                textDecoration: 'none', flexShrink: 0,
                fontFamily: 'inherit',
              }}
            >
              묵상 시작하기 →
            </Link>
          </div>
        </div>

        {/* 하단 네비게이션 */}
        <div style={{
          marginTop: '60px', paddingTop: '24px',
          borderTop: '1px solid #e9e4dc',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <button
            onClick={goBack}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '14px', color: '#9ca3af',
              background: 'none', border: '1px solid #e5e7eb',
              borderRadius: '8px', padding: '10px 18px',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <ChevronLeft size={14} />
            말씀 목록으로
          </button>

          {(saying.related_sayings ?? []).length > 0 && (
            <Link
              to={`/sayings/${saying.related_sayings[0].id}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '13px', color: '#fff',
                background: ac.text, borderRadius: '8px', padding: '10px 18px',
                textDecoration: 'none',
              }}
            >
              다음 말씀 <ChevronRight size={14} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}