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

// Lectio Divina 4단계
const LECTIO_STEPS = [
  {
    key: 'lectio',
    label: '읽기',
    latin: 'Lectio',
    icon: '📖',
    guide: '말씀을 천천히, 소리 내어 읽어보세요. 특별히 마음에 걸리는 단어나 구절에 주목하세요.',
    prompt: '어떤 단어나 구절이 가장 마음에 남나요?',
    minutes: 3,
    color: '#185FA5',
  },
  {
    key: 'meditatio',
    label: '묵상',
    latin: 'Meditatio',
    icon: '🤲',
    guide: '그 단어를 마음속에서 천천히 되새기세요. 하나님이 이 말씀을 통해 오늘 나에게 무엇을 말씀하시는지 생각해 보세요.',
    prompt: '이 말씀이 오늘 나의 삶과 어떻게 연결되나요?',
    minutes: 5,
    color: '#3C3489',
  },
  {
    key: 'oratio',
    label: '기도',
    latin: 'Oratio',
    icon: '🙏',
    guide: '말씀을 듣고 느낀 것을 하나님께 기도로 응답하세요. 감사, 회개, 간구 — 무엇이든 마음에서 나오는 대로.',
    prompt: '이 말씀으로 하나님께 무엇을 기도하고 싶으신가요?',
    minutes: 5,
    color: '#633806',
  },
  {
    key: 'contemplatio',
    label: '관상',
    latin: 'Contemplatio',
    icon: '✨',
    guide: '기도를 마친 후 잠시 고요히 머무세요. 하나님의 임재 안에서 쉬면서, 이 말씀을 오늘 어떻게 살아낼지 생각해 보세요.',
    prompt: '오늘 이 말씀을 어떻게 삶에서 실천할 수 있을까요?',
    minutes: 3,
    color: '#085041',
  },
];

// ── 공통 스타일 ───────────────────────────────────────────
const GLOBAL_CSS = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes slideDown { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 2000px; } }
  .saying-detail-section { animation: fadeIn 0.4s ease both; }
  .keyword-card { transition: all 0.22s ease; }
  .keyword-card:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
  .related-link:hover { border-color: #AFA9EC !important; background: #FDFBF7 !important; }
`;

// ── 섹션 헤더 ─────────────────────────────────────────────
function SectionLabel({ children, sub }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <p style={{
        fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: '#b0aaa0', margin: 0,
      }}>
        {children}
      </p>
      {sub && (
        <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px', fontFamily: "'Gowun Batang', serif" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ── 황금 구분선 ───────────────────────────────────────────
function GoldDivider({ color = '#C9A96E' }) {
  return (
    <div style={{ margin: '48px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, #e9e4dc)' }} />
      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, opacity: 0.5 }} />
      <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, #e9e4dc)' }} />
    </div>
  );
}

// ── 원어 키워드 카드 ──────────────────────────────────────
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
          <p style={{
            fontSize: '10px', color: '#c4bfb8', marginTop: '12px',
            letterSpacing: '0.05em',
          }}>
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

// ── Lectio Divina 가이드 ──────────────────────────────────
function LectioGuide() {
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  const current = LECTIO_STEPS[step];
  const totalSec = current.minutes * 60;
  const remaining = Math.max(0, totalSec - elapsed);
  const mins = String(Math.floor(remaining / 60)).padStart(2, '0');
  const secs = String(remaining % 60).padStart(2, '0');
  const progress = elapsed / totalSec;
  const circumference = 2 * Math.PI * 26;

  const startTimer = () => {
    if (elapsed >= totalSec) return;
    setRunning(true);
    timerRef.current = setInterval(() => {
      setElapsed(e => {
        if (e + 1 >= totalSec) {
          clearInterval(timerRef.current);
          setRunning(false);
          return totalSec;
        }
        return e + 1;
      });
    }, 1000);
  };

  const pauseTimer = () => {
    clearInterval(timerRef.current);
    setRunning(false);
  };

  const resetTimer = () => {
    clearInterval(timerRef.current);
    setRunning(false);
    setElapsed(0);
  };

  const goStep = (i) => {
    resetTimer();
    setStep(i);
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  return (
    <div style={{
      background: '#F7F5F0',
      border: '1px solid #e9e4dc',
      borderRadius: '16px',
      overflow: 'hidden',
    }}>
      {/* 단계 탭 */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        borderBottom: '1px solid #e9e4dc',
      }}>
        {LECTIO_STEPS.map((s, i) => (
          <button
            key={s.key}
            onClick={() => goStep(i)}
            style={{
              padding: '12px 8px',
              fontSize: '11px', fontWeight: step === i ? 700 : 400,
              borderRight: i < 3 ? '1px solid #e9e4dc' : 'none',
              background: step === i ? '#fff' : 'transparent',
              color: step === i ? s.color : '#9ca3af',
              border: 'none', borderBottom: step === i ? `2px solid ${s.color}` : '2px solid transparent',
              cursor: 'pointer', transition: 'all 0.2s',
              fontFamily: 'inherit',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
            }}
          >
            <span style={{ fontSize: '16px' }}>{s.icon}</span>
            <span>{s.label}</span>
            <span style={{ fontSize: '9px', color: '#c4bfb8', letterSpacing: '0.04em' }}>{s.latin}</span>
          </button>
        ))}
      </div>

      {/* 현재 단계 */}
      <div style={{ padding: '24px' }}>
        <p style={{
          fontSize: '14px', color: '#4b5563', lineHeight: 1.9,
          fontFamily: "'Gowun Batang', serif", marginBottom: '16px',
        }}>
          {current.guide}
        </p>
        <div style={{
          padding: '12px 16px', background: '#fff', borderRadius: '10px',
          borderLeft: `3px solid ${current.color}`, marginBottom: '24px',
        }}>
          <p style={{ fontSize: '12px', color: current.color, fontWeight: 600 }}>
            💭 {current.prompt}
          </p>
        </div>

        {/* 타이머 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ position: 'relative', width: '60px', height: '60px', flexShrink: 0 }}>
            <svg width="60" height="60" viewBox="0 0 60 60">
              <circle cx="30" cy="30" r="26" fill="none" stroke="#e9e4dc" strokeWidth="3" />
              <circle
                cx="30" cy="30" r="26"
                fill="none"
                stroke={current.color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
                transform="rotate(-90 30 30)"
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 700, color: current.color,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {mins}:{secs}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>
              권장 시간: {current.minutes}분
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {!running ? (
                <button
                  onClick={startTimer}
                  disabled={elapsed >= totalSec}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '7px 16px', borderRadius: '8px',
                    fontSize: '12px', fontWeight: 600,
                    background: elapsed >= totalSec ? '#e5e7eb' : current.color,
                    color: elapsed >= totalSec ? '#9ca3af' : '#fff',
                    border: 'none', cursor: elapsed >= totalSec ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <Play size={11} />
                  {elapsed >= totalSec ? '완료' : elapsed > 0 ? '계속' : '시작'}
                </button>
              ) : (
                <button
                  onClick={pauseTimer}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '7px 16px', borderRadius: '8px',
                    fontSize: '12px', fontWeight: 600,
                    background: current.color, color: '#fff',
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <Pause size={11} />
                  일시정지
                </button>
              )}
              <button
                onClick={resetTimer}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '7px 12px', borderRadius: '8px',
                  fontSize: '12px', color: '#9ca3af',
                  background: 'transparent', border: '1px solid #e5e7eb',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <RotateCcw size={11} />
                초기화
              </button>
              {step < LECTIO_STEPS.length - 1 && (
                <button
                  onClick={() => goStep(step + 1)}
                  style={{
                    padding: '7px 14px', borderRadius: '8px',
                    fontSize: '12px', color: current.color,
                    background: 'transparent',
                    border: `1px solid ${current.color}40`,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  다음 단계 →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 묵상 섹션 ─────────────────────────────────────────────
function MeditationSection({ sayingId, accentColor }) {
  const { isAuthenticated } = useAuth();
  const [meditations, setMeditations] = useState([]);
  const [content, setContent] = useState('');
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showLectio, setShowLectio] = useState(false);

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

  return (
    <div>
      {/* Lectio Divina 토글 */}
      <button
        onClick={() => setShowLectio(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '13px', color: accentColor.text,
          background: 'transparent', border: `1px solid ${accentColor.border}`,
          borderRadius: '8px', padding: '8px 16px',
          cursor: 'pointer', marginBottom: '20px',
          fontFamily: 'inherit', transition: 'background 0.2s',
        }}
      >
        {showLectio ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        렉티오 디비나 묵상 가이드 {showLectio ? '닫기' : '열기'}
      </button>

      {showLectio && (
        <div style={{ marginBottom: '24px' }}>
          <LectioGuide />
        </div>
      )}

      {/* 묵상 작성 */}
      {isAuthenticated ? (
        <div>
          <div style={{
            border: '1px solid #e5e7eb',
            borderRadius: '14px',
            overflow: 'hidden',
            background: '#FDFBF7',
          }}>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={5}
              placeholder="이 말씀을 통해 받은 은혜, 깨달음, 기도를 자유롭게 기록하세요..."
              style={{
                width: '100%', padding: '20px',
                fontSize: '14px', fontFamily: "'Gowun Batang', serif",
                lineHeight: 1.9, color: '#1f2937',
                background: 'transparent', border: 'none',
                outline: 'none', resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 20px', borderTop: '1px solid #e5e7eb',
              background: '#f9f7f4',
            }}>
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                {editId ? '묵상 수정 중' : '새 묵상 기록'}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {editId && (
                  <button
                    onClick={() => { setEditId(null); setContent(''); }}
                    style={{
                      padding: '7px 14px', borderRadius: '8px',
                      fontSize: '12px', color: '#9ca3af',
                      background: 'transparent', border: '1px solid #e5e7eb',
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
                    background: saving || !content.trim() ? '#c4bfb8' : accentColor.text,
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
                    background: '#fff', border: '1px solid #e9e4dc',
                    borderRadius: '12px', padding: '18px 20px',
                    borderLeft: `3px solid ${accentColor.border}`,
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
                      {m.is_private && (
                        <><Lock size={10} /> 비공개</>
                      )}
                    </span>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        onClick={() => handleEdit(m)}
                        style={{
                          fontSize: '12px', color: accentColor.text,
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
          background: '#fff', border: '1px solid #e9e4dc', borderRadius: '14px',
          padding: '32px', textAlign: 'center',
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
              background: accentColor.text, color: '#fff',
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

  // 병행구절 맵 구성
  const parallelMap = {};
  (saying?.parallels ?? []).forEach(p => { parallelMap[p.book] = p; });
  const hasParallels = Object.keys(parallelMap).length > 0;

  const firstThemeKey = saying?.themes?.[0]?.key;
  const ac = getThemeColorFromSaying(saying);

  // 로딩
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

      {/* ── 헤더 영역 (그라데이션) ── */}
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
                fontSize: '13px', color: '#9ca3af',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '6px 10px 6px 0', fontFamily: 'inherit',
              }}
            >
              <ChevronLeft size={14} />
              말씀 목록
            </button>

            {/* 이전/다음 관련 말씀 */}
            {(saying.related_sayings ?? []).length > 0 && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <Link
                  to={`/sayings/${saying.related_sayings[0].id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    fontSize: '12px', color: ac.text,
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
                fontSize: '11px', fontWeight: 600,
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
                    fontSize: '12px', fontWeight: 500,
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
                fontSize: '12px', padding: '4px 12px', borderRadius: '999px',
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
                    fontSize: '12px', fontWeight: trans === t ? 600 : 400,
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
                fontSize: '12px', color: copied ? '#27500A' : '#9ca3af',
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
            fontSize: 'clamp(17px, 2.4vw, 21px)',
            lineHeight: 2.1,
            color: '#1f2937',
            margin: 0,
            letterSpacing: '0.01em',
          }}>
            "{bodyText}"
          </p>
        </div>

        {/* 번역 출처 표시 */}
        <p style={{ fontSize: '11px', color: '#c4bfb8', textAlign: 'right', marginBottom: '0' }}>
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
                fontSize: '14px', lineHeight: 1.95,
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
                  <span style={{ fontSize: '12px', color: '#9ca3af' }}>
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

        {/* 섹션 3: 병행구절 — 4복음서 비교 */}
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
                        <span style={{
                          fontSize: '12px', fontWeight: 700,
                          color: isCurrent ? ac.text : bc.text,
                        }}>
                          {BOOK_LABELS[book]}
                        </span>
                        {isCurrent && (
                          <span style={{
                            fontSize: '10px', padding: '1px 7px', borderRadius: '999px',
                            background: ac.text, color: '#fff',
                          }}>현재</span>
                        )}
                        {p?.reference && !isCurrent && (
                          <span style={{ fontSize: '11px', color: `${bc.text}99` }}>
                            {p.reference}
                          </span>
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
                                fontSize: '12px', color: bc.text,
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
                      fontSize: '12px', fontWeight: 700, color: ac.text,
                      whiteSpace: 'nowrap', marginTop: '2px', flexShrink: 0,
                    }}>
                      {r.reference}
                    </span>
                    <span style={{
                      fontSize: '13px', color: '#4b5563', lineHeight: 1.75,
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
          {/* 묵상 공간 헤더 */}
          <div style={{
            background: `linear-gradient(135deg, ${ac.bg} 0%, #F7F5F0 100%)`,
            border: `1px solid ${ac.border}40`,
            borderRadius: '16px 16px 0 0',
            padding: '24px 28px 20px',
            display: 'flex', alignItems: 'center', gap: '14px',
          }}>
            <div style={{
              width: '3px', height: '36px',
              background: `linear-gradient(to bottom, ${ac.gold}, transparent)`,
              borderRadius: '2px', flexShrink: 0,
            }} />
            <div>
              <p style={{
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: '#b0aaa0', margin: '0 0 4px',
              }}>
                묵상 공간
              </p>
              <p style={{
                fontSize: '14px', color: ac.text,
                fontFamily: "'Gowun Batang', serif",
                margin: 0,
              }}>
                이 말씀 앞에 잠시 머물러 보세요
              </p>
            </div>
          </div>

          <div style={{
            background: '#F7F4EF',
            border: `1px solid ${ac.border}40`,
            borderTop: 'none',
            borderRadius: '0 0 16px 16px',
            padding: '28px',
          }}>
            <MeditationSection sayingId={Number(id)} accentColor={ac} />
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
              fontSize: '13px', color: '#9ca3af',
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