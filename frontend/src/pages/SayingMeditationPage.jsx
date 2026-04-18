// ============================================================
// frontend/src/pages/SayingMeditationPage.jsx  (수정본)
//
// 변경사항:
//  1. CtxScripture: saying.text_ko_krv 필드명 수정 (말씀 본문이 1단계에서 표시됨)
//  2. 단계 탭: 모바일에서 스크롤 없이 4개 균등 표시 (flex + 텍스트 줄임)
//  3. 단계 탭 가로 스크롤바 숨김 (scrollbar-width: none)
//  4. 모바일: 컨텍스트 패널(말씀/배경/핵심단어)을 묵상 입력 필드 바로 위에 표시
//  5. desc, chips 클릭하면 접기/펼치기 가능
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
// import SectionBar from '../components/JesusSayings/SectionBar';

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
    label: '고요, 들음, 살핌',
    badge: '정직 · 낭독 · 발견',
    color: T.m1, colorBg: T.m1bg, colorMid: T.m1mid,
    icon: '🌅',
    minutes: 10,
    contextPanel: 'scripture',
    desc: '소란한 마음을 내려놓고 숨김없이 하나님 앞에 마주 앉습니다. 말씀을 낮은 소리로 천천히 읽으며 들려오는 말씀에 집중해 보세요.',
    chips: [
      '깊게 세 번 호흡하며, 고요한 침묵 속에 머뭅니다',
      '"주님, 제게 말씀하소서" — 기대하는 마음으로 드리는 기도',
      '낮은 목소리로 본문을 한 자 한 자 천천히 읽어봅니다',
      '마음을 울리는 구절을 발견했다면, 그곳에 잠시 멈추어 봅니다',
    ],
    fields: [
      { id: 'j0a', label: '마음에 머문 단어 · 구절', rows: 3,
        placeholder: '낭독하며 걸음이 멈춰진 곳, 유독 마음에 닿은 단어나 문장을 옮겨 적어보세요...' },
      { id: 'j0b', label: '본문에서 새롭게 보인 것들', rows: 3,
        placeholder: '인물·행동·반복어, 앞뒤 문맥, 연결되는 말씀 — 살피며 처음 눈에 들어온 것들을...' },
      { id: 'j0c', label: '이 발견들이 함께 가리키는 것', rows: 2,
        placeholder: '오늘 이 말씀이 말하려는 핵심이 무엇으로 느껴지나요? 한두 문장으로...' },
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
    contextPanel: 'context',
    desc: '말씀을 내 삶으로 가져옵니다. 말씀이 오늘 나의 어디에 닿는지 천천히 음미하다 보면, 자연스럽게 드러나는 것들이 생깁니다.',
    chips: [
      '이 말씀이 지금 내 삶의 어디에 말을 걸고 있는가?',
      '말씀 앞에서 드러나는 나의 모습은 어떠한가?',
      '하나님께 무엇을 고백하고, 무엇을 구하는가?',
      '오늘 이 말씀대로 살기 위해 내가 할 한 가지는?',
    ],
    fields: [
      { id: 'j1a', label: '말씀과 내 삶의 연결 — 묵상', rows: 4,
        placeholder: '이 말씀이 지금 내 삶의 어느 부분에 닿는지, 떠오르는 생각·감정·기억을 자유롭게...' },
      { id: 'j1b', label: '하나님께 드리는 응답 — 기도', rows: 3,
        placeholder: '묵상에서 우러나온 기도. 감사든, 회개든, 간구든, 형식 없이 솔직하게...' },
      { id: 'j1c', label: '오늘의 순종 — 구체적 결단', rows: 2,
        placeholder: '오늘 이 말씀대로 살기 위한 한 가지. 언제, 누구에게, 어떻게...' },
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
    contextPanel: 'keywords',
    desc: '이제 모든 것을 내려놓습니다. 포도나무 되시는 예수님의 안전하고 따스한 품에 그저 머무르세요.',
    chips: [],
    abidePractices: [
      { num: '1', title: '온전한 내어드림',
        text: '"주님, 제가 여기 있습니다." 묵상하며 얻은 생각들과 마음의 짐들을 그분의 손에 조용히 올려드립니다.' },
      { num: '2', title: '시선의 머묾',
        text: '다른 생각들이 떠오를 땐 가만히 흘려보내세요. 부드럽게 예수님의 얼굴로 시선을 돌립니다.' },
      { num: '3', title: '가지의 안식',
        text: '"나는 포도나무요 너희는 가지라." 사랑받는 자녀로서 주님의 생명력이 내 영혼을 적시도록 나를 맡깁니다.' },
      { num: '4', title: '기다림의 평안',
        text: '무언가를 채우려 하지 않아도 좋습니다. 지금 내 곁에 주님이 계신다는 사실, 그것만으로 충분합니다.' },
    ],
    fields: [
      { id: 'j3a', label: '주님 안에서의 머묾', rows: 2,
        placeholder: '지금 주님의 품 안에서 느끼는 평안과 안식을 잠시 누려보세요. 아무것도 적지 않아도 괜찮습니다...' },
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
    contextPanel: 'related',
    desc: '아침 햇살처럼 따뜻한 말씀의 결실을 하나님 앞에 봉헌합니다. 이제 세상 속으로 나아갑니다.',
    chips: [],
    fields: [
      { id: 'j4a', label: '마음에 새긴 생명의 말씀', rows: 2,
        placeholder: '오늘 나를 살게 할 단 한 구절...' },
      { id: 'j4b', label: '사랑으로 맺을 오늘의 열매', rows: 2,
        placeholder: '오늘 저녁 기쁨으로 돌아볼 수 있는, 작지만 구체적인 순종 한 가지...' },
      { id: 'j4c', label: '주님께 드리는 기도와 감사', rows: 3,
        placeholder: '오늘의 감사와 간구, 마음이 쓰이는 이들을 위한 중보 기도를 담아보세요...' },
      { id: 'j4d', label: '기대하는 하나님의 손길', rows: 2,
        placeholder: '오늘 하나님이 어떤 놀라운 일을 행하실지 소망해 봅니다...' },
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
// [FIX 1] 우측 컨텍스트 패널 — 성경 본문
// saying.text_ko_krv 로 필드명 수정
// ─────────────────────────────────────────────────────────
function CtxScripture({ saying }) {
  const [tab, setTab] = useState('kor');
  if (!saying) return null;

  const tabs = [
    { key: 'kor', label: '개역개정' },
    saying.text_ko_new && { key: 'new', label: '새번역' },
  ].filter(Boolean);

  // ✅ FIX: text_ko_krv 가 올바른 필드명
  const bodyText = tab === 'kor'
    ? (saying.text_ko_krv || saying.text || saying.text_kor || '')
    : (saying.text_ko_new || saying.text_ko_krv || '');

  return (
    <div>
      {/* 말씀 헤더 */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '10px', color: T.ink4, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
          오늘의 말씀
        </div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: T.ink, fontFamily: "'Gowun Batang', serif" }}>
          {saying.reference}
        </div>
      </div>

      {/* 단원 태그 */}
      {saying.section && (
        <div style={{
          display: 'inline-block',
          fontSize: '11px', color: T.m1, background: T.m1bg,
          border: `1px solid ${T.m1mid}`, borderRadius: '20px',
          padding: '3px 10px', marginBottom: '16px',
        }}>
          {saying.section}
        </div>
      )}

      {/* 번역 탭 */}
      {tabs.length > 1 && (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              fontSize: '11px', padding: '4px 10px', borderRadius: '20px',
              fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.15s',
              background: tab === t.key ? T.ink : 'transparent',
              color: tab === t.key ? '#fff' : T.ink4,
              border: `1px solid ${tab === t.key ? T.ink : T.paper3}`,
            }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* 본문 */}
      <div style={{
        background: '#fff',
        border: `3px solid ${T.m1mid}`,
        borderLeft: `5px solid ${T.m1}`,
        borderRadius: '0 12px 12px 0',
        padding: '20px 20px 16px',
        marginBottom: '16px',
      }}>
        <p style={{
          fontSize: '16px',
          fontFamily: "'Gowun Batang', serif",
          lineHeight: 2.0,
          color: T.ink,
          margin: 0,
          fontWeight: 500,
        }}>
          {bodyText}
        </p>
        <p style={{ fontSize: '11px', color: T.ink5, marginTop: '12px', marginBottom: 0, textAlign: 'right' }}>
          {tab === 'kor' ? '개역개정' : '새번역'} · {saying.reference}
        </p>
      </div>

      {/* 주제 태그들 */}
      {(saying.themes || saying.tags || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {(saying.themes || saying.tags || []).map((tag, i) => (
            <span key={i} style={{
              fontSize: '11px', color: T.ink3,
              background: T.paper2, border: `1px solid ${T.paper3}`,
              borderRadius: '20px', padding: '3px 9px',
            }}>
              {typeof tag === 'string' ? tag : (tag.name_ko || tag.name)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 우측 컨텍스트 패널 — 말씀의 배경
// ─────────────────────────────────────────────────────────
function CtxContext({ saying }) {
  if (!saying) return null;
  return (
    <div>
      <div style={{ fontSize: '10px', color: T.ink4, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>
        말씀의 배경
      </div>

      <div style={{
        fontSize: '13px', color: T.m2, fontWeight: 600,
        marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        <BookOpen size={13} /> {saying.reference}
      </div>

      <div style={{
        background: '#fff',
        border: `1px solid ${T.m2mid}`,
        borderLeft: `4px solid ${T.m2}`,
        borderRadius: '0 10px 10px 0',
        padding: '16px 18px',
        marginBottom: '16px',
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

      {(saying.themes || saying.tags || []).length > 0 && (
        <>
          <div style={{ fontSize: '10px', color: T.ink4, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>
            주제 태그
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {(saying.themes || saying.tags || []).map((tag, i) => (
              <span key={i} style={{
                fontSize: '12px', color: T.m2,
                background: T.m2bg, border: `1px solid ${T.m2mid}`,
                borderRadius: '20px', padding: '4px 11px',
              }}>
                {typeof tag === 'string' ? tag : (tag.name_ko || tag.name)}
              </span>
            ))}
          </div>
        </>
      )}

      {saying.section && (
        <div style={{
          marginTop: '16px',
          padding: '10px 14px',
          background: T.paper2,
          borderRadius: '8px',
          fontSize: '12px', color: T.ink3,
          fontFamily: "'Gowun Batang', serif",
        }}>
          📖 {saying.section}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 우측 컨텍스트 패널 — 원어 키워드
// ─────────────────────────────────────────────────────────
function CtxKeywords({ saying }) {
  const [flipped, setFlipped] = useState({});
  if (!saying) return null;
  const keywords = saying.keywords || [];

  return (
    <div>
      <div style={{ fontSize: '10px', color: T.ink4, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
        핵심 단어 — 원어 해설
      </div>
      <div style={{ fontSize: '12px', color: T.ink5, marginBottom: '16px', fontFamily: "'Gowun Batang', serif" }}>
        카드를 탭하면 원어 의미가 펼쳐집니다
      </div>

      {keywords.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {keywords.map((kw, i) => {
            const isFlipped = flipped[i];
            return (
              <div
                key={i}
                onClick={() => setFlipped(f => ({ ...f, [i]: !f[i] }))}
                style={{
                  cursor: 'pointer',
                  border: `1px solid ${isFlipped ? T.m4mid : T.paper3}`,
                  borderRadius: '12px',
                  padding: '14px 16px',
                  background: isFlipped ? T.m4bg : '#fff',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '15px', color: T.m4, marginBottom: '4px' }}>
                  {kw.word_ko || kw.word}
                </div>
                {kw.word_original && (
                  <div style={{ fontSize: '12px', color: T.ink4, fontStyle: 'italic', marginBottom: '6px' }}>
                    {kw.word_original} ({kw.language || 'Gk'})
                  </div>
                )}
                {isFlipped && kw.meaning && (
                  <div style={{
                    fontSize: '13px', color: T.ink2, lineHeight: 1.75,
                    fontFamily: "'Gowun Batang', serif",
                    borderTop: `1px solid ${T.m4mid}`, paddingTop: '10px', marginTop: '6px',
                  }}>
                    {kw.meaning}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{
          padding: '20px', background: T.paper2, borderRadius: '10px',
          textAlign: 'center', fontSize: '13px', color: T.ink5,
          fontFamily: "'Gowun Batang', serif",
        }}>
          핵심 단어 해설이 준비 중입니다
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 우측 컨텍스트 패널 — 관련 말씀
// ─────────────────────────────────────────────────────────
function CtxRelated({ saying, navigate }) {
  if (!saying) return null;
  const related = saying.related_sayings || saying.parallels || [];

  return (
    <div>
      <div style={{ fontSize: '10px', color: T.ink4, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px' }}>
        이어지는 말씀들
      </div>

      {related.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {related.map((r, i) => (
            <div
              key={i}
              onClick={() => navigate(`/sayings/${r.id}`)}
              style={{
                cursor: 'pointer',
                border: `1px solid ${T.paper3}`,
                borderRadius: '12px',
                padding: '14px 16px',
                background: '#fff',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '13px', color: T.m5, marginBottom: '6px' }}>
                {r.reference}
              </div>
              <div style={{ fontSize: '13px', color: T.ink2, lineHeight: 1.7, fontFamily: "'Gowun Batang', serif" }}>
                {(r.text_ko_krv || r.text || r.text_kor || '').slice(0, 60)}...
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          padding: '20px', background: T.paper2, borderRadius: '10px',
          textAlign: 'center', fontSize: '13px', color: T.ink5,
          fontFamily: "'Gowun Batang', serif",
        }}>
          관련 말씀이 준비 중입니다
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// [FIX 5] 묵상 단계 패널 (좌측) — desc/chips 클릭시 접기
// ─────────────────────────────────────────────────────────
function StepPanel({ stepData: s, values, onChange }) {
  const { elapsed, running, mm, ss, progress, start, pause, reset } = useStepTimer(s.minutes);
  const [timerMin, setTimerMin] = useState(s.minutes);
  const [descOpen, setDescOpen] = useState(false);   // desc 펼침 상태
  const [chipsOpen, setChipsOpen] = useState(true); // chips 펼침 상태
  const isDone = elapsed >= timerMin * 60;

  // 단계 바뀌면 열림 상태 초기화
  useEffect(() => {
    setDescOpen(false);
    setChipsOpen(false);
  }, [s.key]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* [FIX 5] 단계 설명 — 클릭하면 접기/펼치기 */}
      <div>
        <button
          onClick={() => setDescOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', background: 'transparent', border: 'none',
            cursor: 'pointer', padding: 0, fontFamily: 'inherit',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: 3, height: 14, borderRadius: 2, background: s.colorMid }} />
            <span style={{ fontSize: '11px', color: s.color, fontWeight: 600, letterSpacing: '0.05em' }}>
              {descOpen ? '안내 접기' : '안내 보기'}
            </span>
          </div>
          {descOpen
            ? <ChevronUp size={13} style={{ color: T.ink5 }} />
            : <ChevronDown size={13} style={{ color: T.ink5 }} />}
        </button>

        {descOpen && (
          <div
            onClick={() => setDescOpen(false)}
            title="클릭하면 접힙니다"
            style={{
              marginTop: '8px',
              fontSize: '13px', color: T.ink3, lineHeight: 1.85,
              padding: '12px 16px', background: T.paper,
              borderRadius: '10px', borderLeft: `3px solid ${s.colorMid}`,
              fontFamily: "'Gowun Batang', serif",
              cursor: 'pointer',
            }}
          >
            {s.desc}
          </div>
        )}
      </div>

      {/* [FIX 5] 프롬프트 칩 — 클릭하면 접기/펼치기 */}
      {s.chips && s.chips.length > 0 && (
        <div>
          <button
            onClick={() => setChipsOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', background: 'transparent', border: 'none',
              cursor: 'pointer', padding: 0, fontFamily: 'inherit',
              marginBottom: chipsOpen ? '8px' : 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: s.colorMid }} />
              <span style={{ fontSize: '11px', color: s.color, fontWeight: 600, letterSpacing: '0.05em' }}>
                {chipsOpen ? '묵상 가이드 접기' : '묵상 가이드 보기'}
              </span>
            </div>
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
                <span style={{ fontSize: '12.5px', color: T.ink2, lineHeight: 1.65 }}>
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
// 전역 스타일
// ─────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .meditate-fade { animation: fadeInUp 0.35s ease both; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* [FIX 3] 단계 탭 스크롤바 숨김 */
  .step-tab-bar {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .step-tab-bar::-webkit-scrollbar { display: none; }

  /* 데스크탑: 2컬럼 레이아웃 */
  @media (min-width: 769px) {
    .meditate-layout { flex-direction: row !important; }
    .meditate-mobile-ctx { display: none !important; }
    .meditate-right { display: block !important; }
  }

  /* [FIX 2, 4] 모바일: 단계 탭 균등 + 컨텍스트 패널을 필드 위에 */
  @media (max-width: 768px) {
    .meditate-layout { flex-direction: column !important; }
    .meditate-left { border-right: none !important; padding: 20px 16px !important; }
    .meditate-right { display: none !important; }
    .meditate-mobile-ctx { display: block !important; }
    .step-tab-btn {
      flex: 1 1 0 !important;
      padding: 10px 4px !important;
      min-width: 0 !important;
    }
    .step-tab-label { display: none !important; }
    .step-tab-sublabel { font-size: 11px !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60px; }
  }
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

  const renderContextPanel = () => {
    switch (currentStep.contextPanel) {
      case 'scripture': return <CtxScripture saying={saying} />;
      case 'context':   return <CtxContext saying={saying} />;
      case 'keywords':  return <CtxKeywords saying={saying} />;
      case 'related':   return <CtxRelated saying={saying} navigate={navigate} />;
      default:          return <CtxScripture saying={saying} />;
    }
  };

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

      {/* ── SectionBar ── */}
      {/* <SectionBar /> */}

      {/* ── 상단 헤더 ── */}
      <div style={{
        background: '#fff',
        borderBottom: `1px solid ${T.paper3}`,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{
          maxWidth: '1100px', margin: '0 auto',
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

      {/* ── [FIX 2, 3] 단계 탭 네비게이션 — 모바일 균등, 스크롤바 숨김 ── */}
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
            maxWidth: '1100px', margin: '0 auto',
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
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px' }}>
        <div
          className="meditate-layout"
          style={{
            display: 'flex',
            minHeight: 'calc(100vh - 180px)',
            gap: 0,
          }}
        >
          {/* ── 좌: 묵상 입력 영역 ── */}
          <div
            className="meditate-left"
            style={{
              flex: 1,
              padding: '32px 32px 32px 0',
              borderRight: `1px solid ${T.paper3}`,
              minWidth: 0,
            }}
          >
            {/* 현재 단계 헤더 */}
            {/* <div
              className="meditate-fade"
              key={`header-${step}`}
              style={{ marginBottom: '24px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: currentStep.colorBg, color: currentStep.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px',
                }}>
                  {currentStep.icon}
                </div>
                <div>
                  <div style={{
                    fontSize: '10px', color: currentStep.color,
                    fontStyle: 'italic', letterSpacing: '0.1em',
                  }}>
                    {currentStep.latin}
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: T.ink }}>
                    {currentStep.label}
                  </div>
                </div>
                <span style={{
                  marginLeft: 'auto',
                  fontSize: '11px', padding: '4px 10px',
                  borderRadius: '20px', background: currentStep.colorBg,
                  color: currentStep.color, border: `1px solid ${currentStep.colorMid}`,
                }}>
                  {currentStep.badge}
                </span>
              </div>
            </div> */}

            {/* [FIX 4] 모바일 전용: 말씀/배경/핵심단어 — 필드 바로 위에 삽입 */}
            <div
              className="meditate-mobile-ctx meditate-fade"
              key={`mobile-ctx-${step}`}
              style={{
                display: 'none', // 모바일 CSS에서 block으로 오버라이드
                marginBottom: '20px',
                padding: '16px',
                background: '#fff',
                border: `1px solid ${T.paper3}`,
                borderRadius: '12px',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                marginBottom: '14px',
              }}>
                <div style={{
                  width: 3, height: 14, borderRadius: 2,
                  background: currentStep.color,
                }} />
                <div style={{ fontSize: '11px', color: T.ink4, fontStyle: 'italic' }}>
                  {step === 0 && '말씀을 들으며'}
                  {step === 1 && '말씀의 배경 안에서'}
                  {step === 2 && '원어의 깊이로'}
                  {step === 3 && '이어지는 말씀들'}
                </div>
              </div>
              {renderContextPanel()}
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

          {/* ── 우: 말씀 컨텍스트 패널 (데스크탑 전용) ── */}
          <div
            className="meditate-right"
            style={{
              width: '360px',
              minWidth: '320px',
              flexShrink: 0,
            }}
          >
            <div
              className="meditate-ctx"
              style={{
                position: 'sticky',
                top: '120px',
                maxHeight: 'calc(100vh - 140px)',
                overflowY: 'auto',
                padding: '32px 0 32px 28px',
                scrollbarWidth: 'thin',
              }}
            >
              {/* 컨텍스트 패널 레이블 */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                marginBottom: '20px',
              }}>
                <div style={{
                  width: 3, height: 16, borderRadius: 2,
                  background: currentStep.color,
                }} />
                <div style={{ fontSize: '11px', color: T.ink4, fontStyle: 'italic' }}>
                  {step === 0 && '말씀을 들으며'}
                  {step === 1 && '말씀의 배경 안에서'}
                  {step === 2 && '원어의 깊이로'}
                  {step === 3 && '이어지는 말씀들'}
                </div>
              </div>

              <div className="meditate-fade" key={`ctx-${step}`}>
                {renderContextPanel()}
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

        </div>
      </div>
    </div>
  );
}