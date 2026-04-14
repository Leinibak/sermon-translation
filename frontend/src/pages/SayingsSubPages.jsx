// ============================================================
// frontend/src/pages/SayingsSubPages.jsx (수정본)
//
// ThemePage — 기존 구조 유지 + 아이콘 개선
// MeditationPage — 내 묵상 목록 페이지 신규 설계
// ParallelPage — 기존 유지
// ============================================================

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Lock, ChevronRight, Edit3, Trash2 } from 'lucide-react';
import SectionBar from '../components/JesusSayings/SectionBar';
import { getThemes, getParallelGroups, getParallelGroup, getMeditations, deleteMeditation } from '../api/sayings';
import { useAuth } from '../contexts/AuthContext';

// ── 주제별 아이콘 + 색상 ─────────────────────────────────
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

// ══════════════════════════════════════════════════════════
// ThemePage
// ══════════════════════════════════════════════════════════
export function ThemePage() {
  const [themes,  setThemes]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getThemes().then(d => { if (d) setThemes(d); setLoading(false); });
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#FDFBF7' }}>
      <SectionBar />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>

        {/* 헤더 */}
        <div style={{ marginBottom: '28px' }}>
          <p style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: '#9ca3af', marginBottom: '6px',
          }}>
            주님의 음성
          </p>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937', marginBottom: '6px' }}>
            주제별 탐색
          </h1>
          <p style={{
            fontSize: '14px', color: '#6b7280',
            fontFamily: "'Gowun Batang', serif", lineHeight: 1.7,
          }}>
            예수님의 말씀을 14개 주제로 분류했습니다. 오늘 내 마음에 와닿는 주제를 선택하세요.
          </p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '40px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              border: '2px solid #e5e7eb', borderTopColor: '#7F77DD',
              animation: 'spin 0.7s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '12px',
          }}>
            {themes.map(t => {
              const cfg = THEME_CONFIG[t.key] ?? { bg: '#F1EFE8', text: '#444441', border: '#D3D1C7', icon: '✦', desc: '' };
              return (
                <Link
                  key={t.key}
                  to={`/sayings/list?theme=${t.key}`}
                  style={{
                    display: 'block',
                    border: `1px solid ${cfg.border}`,
                    borderRadius: '14px',
                    padding: '18px 16px',
                    background: '#fff',
                    textDecoration: 'none',
                    transition: 'background 0.2s, transform 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = cfg.bg; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.transform = 'none'; }}
                >
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: cfg.bg, color: cfg.text,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px', marginBottom: '12px',
                    border: `1px solid ${cfg.border}`,
                  }}>
                    {cfg.icon}
                  </div>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: '#1f2937', marginBottom: '2px' }}>
                    {t.name_ko}
                  </p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '10px' }}>
                    {cfg.desc}
                  </p>
                  <p style={{
                    fontSize: '12px', fontWeight: 600, color: cfg.text,
                    display: 'flex', alignItems: 'center', gap: '4px',
                  }}>
                    {t.saying_count}개 말씀
                    <ChevronRight size={11} />
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
// MeditationPage — 내 묵상 노트 목록 (신규 설계)
// ══════════════════════════════════════════════════════════
export function MeditationPage() {
  const { isAuthenticated } = useAuth();
  const [meditations, setMeditations] = useState([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    getMeditations().then(d => {
      if (Array.isArray(d)) setMeditations(d);
      else if (d?.results) setMeditations(d.results);
      setLoading(false);
    });
  }, [isAuthenticated]);

  const handleDelete = async (id) => {
    if (!window.confirm('이 묵상을 삭제하시겠습니까?')) return;
    const ok = await deleteMeditation(id);
    if (ok) setMeditations(m => m.filter(x => x.id !== id));
  };

  const formatDate = (str) => {
    if (!str) return '';
    const d = new Date(str);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FDFBF7' }}>
      <SectionBar />
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px' }}>

        {/* 헤더 */}
        <div style={{ marginBottom: '28px' }}>
          <p style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: '#9ca3af', marginBottom: '6px',
          }}>
            나의 기록
          </p>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937', marginBottom: '6px' }}>
            내 묵상 노트
          </h1>
          <p style={{
            fontSize: '14px', color: '#6b7280',
            fontFamily: "'Gowun Batang', serif", lineHeight: 1.7,
          }}>
            말씀 앞에 머물며 기록한 묵상들을 모아봤습니다.
          </p>
        </div>

        {/* 비로그인 */}
        {!isAuthenticated && (
          <div style={{
            background: '#fff', border: '1px solid #e9e4dc',
            borderRadius: '16px', padding: '40px',
            textAlign: 'center',
          }}>
            <Lock size={28} style={{ color: '#AFA9EC', marginBottom: '12px' }} />
            <p style={{
              fontSize: '15px', color: '#4b5563',
              fontFamily: "'Gowun Batang', serif", lineHeight: 1.8,
              marginBottom: '20px',
            }}>
              묵상 노트는 로그인 후 사용할 수 있습니다.
            </p>
            <Link to="/login" style={{
              display: 'inline-block',
              padding: '10px 24px', borderRadius: '10px',
              fontSize: '14px', fontWeight: 600, color: '#fff',
              background: '#3C3489', textDecoration: 'none',
            }}>
              로그인하기
            </Link>
          </div>
        )}

        {/* 로딩 */}
        {isAuthenticated && loading && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '40px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              border: '2px solid #e5e7eb', borderTopColor: '#7F77DD',
              animation: 'spin 0.7s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* 빈 상태 */}
        {isAuthenticated && !loading && meditations.length === 0 && (
          <div style={{
            background: '#fff', border: '1px solid #e9e4dc',
            borderRadius: '16px', padding: '40px', textAlign: 'center',
          }}>
            <BookOpen size={28} style={{ color: '#AFA9EC', marginBottom: '12px' }} />
            <p style={{
              fontSize: '15px', color: '#4b5563',
              fontFamily: "'Gowun Batang', serif", lineHeight: 1.8,
              marginBottom: '20px',
            }}>
              아직 기록된 묵상이 없습니다.<br />
              말씀을 읽고 첫 묵상을 남겨보세요.
            </p>
            <Link to="/sayings" style={{
              display: 'inline-block',
              padding: '10px 24px', borderRadius: '10px',
              fontSize: '14px', fontWeight: 600, color: '#fff',
              background: '#3C3489', textDecoration: 'none',
            }}>
              말씀 탐색하기
            </Link>
          </div>
        )}

        {/* 묵상 목록 */}
        {isAuthenticated && !loading && meditations.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {meditations.map(m => (
              <div
                key={m.id}
                style={{
                  background: '#fff',
                  border: '1px solid #e9e4dc',
                  borderRadius: '14px',
                  overflow: 'hidden',
                }}
              >
                {/* 연결 말씀 */}
                {m.saying && (
                  <Link
                    to={`/sayings/${m.saying.id ?? m.saying}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '10px 16px',
                      background: '#EEEDFE',
                      borderBottom: '1px solid #AFA9EC30',
                      textDecoration: 'none',
                    }}
                  >
                    <BookOpen size={12} style={{ color: '#7F77DD', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#3C3489' }}>
                      {m.saying.reference || '말씀 보기'}
                    </span>
                    <ChevronRight size={11} style={{ color: '#AFA9EC', marginLeft: 'auto' }} />
                  </Link>
                )}

                {/* 묵상 본문 */}
                <div style={{ padding: '16px' }}>
                  <p style={{
                    fontSize: '14px',
                    fontFamily: "'Gowun Batang', serif",
                    lineHeight: 1.9, color: '#1f2937',
                    whiteSpace: 'pre-wrap', margin: '0 0 12px',
                  }}>
                    {m.content}
                  </p>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    paddingTop: '10px', borderTop: '1px solid #f3f4f6',
                  }}>
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                      {formatDate(m.created_at)}
                      {m.is_private && (
                        <span style={{ marginLeft: '6px' }}>
                          <Lock size={10} style={{ display: 'inline', verticalAlign: 'middle' }} />
                          {' '}비공개
                        </span>
                      )}
                    </span>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {m.saying && (
                        <Link
                          to={`/sayings/${m.saying.id ?? m.saying}`}
                          style={{
                            fontSize: '12px', color: '#7F77DD',
                            textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px',
                          }}
                        >
                          <Edit3 size={11} />
                          수정
                        </Link>
                      )}
                      <button
                        onClick={() => handleDelete(m.id)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '3px',
                          fontSize: '12px', fontFamily: 'inherit', padding: 0,
                        }}
                      >
                        <Trash2 size={11} />
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ParallelPage — 병행구절 비교 (기존 구조 유지 + 디자인 개선)
// ══════════════════════════════════════════════════════════
// import { getParallelGroups, getParallelGroup } from '../api/sayings';

export function ParallelPage() {
  const [groups,   setGroups]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail,   setDetail]   = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    getParallelGroups().then(d => {
      if (d) setGroups(Array.isArray(d) ? d : d.results ?? []);
      setLoading(false);
    });
  }, []);

  const handleSelect = async (g) => {
    setSelected(g.id);
    const d = await getParallelGroup(g.id);
    if (d) setDetail(d);
  };

  const BOOK_COLORS = {
    MAT: { bg: '#E6F1FB', text: '#0C447C', border: '#85B7EB' },
    MRK: { bg: '#EAF3DE', text: '#27500A', border: '#97C459' },
    LUK: { bg: '#FAEEDA', text: '#633806', border: '#EF9F27' },
    JHN: { bg: '#EEEDFE', text: '#3C3489', border: '#AFA9EC' },
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FDFBF7' }}>
      <SectionBar />
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ marginBottom: '28px' }}>
          <p style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: '#9ca3af', marginBottom: '6px',
          }}>
            4복음서 비교
          </p>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937', marginBottom: '6px' }}>
            병행구절 비교
          </h1>
          <p style={{
            fontSize: '14px', color: '#6b7280',
            fontFamily: "'Gowun Batang', serif", lineHeight: 1.7,
          }}>
            같은 사건에 대해 4복음서가 어떻게 다르게 기록했는지 나란히 비교합니다.
          </p>
        </div>

        {/* 그룹 선택 버튼 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '28px' }}>
          {loading ? (
            <div style={{
              width: '24px', height: '24px', borderRadius: '50%',
              border: '2px solid #e5e7eb', borderTopColor: '#7F77DD',
              animation: 'spin 0.7s linear infinite',
            }} />
          ) : groups.map(g => (
            <button
              key={g.id}
              onClick={() => handleSelect(g)}
              style={{
                padding: '8px 18px', borderRadius: '999px',
                fontSize: '13px', border: '1px solid',
                borderColor: selected === g.id ? '#AFA9EC' : '#e9e4dc',
                background: selected === g.id ? '#EEEDFE' : '#fff',
                color: selected === g.id ? '#3C3489' : '#6b7280',
                fontWeight: selected === g.id ? 600 : 400,
                cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
              }}
            >
              {g.name}
            </button>
          ))}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        {/* 비교 그리드 */}
        {detail ? (
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', marginBottom: '16px' }}>
              {detail.name}
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px',
            }}>
              {(detail.sayings ?? []).map((s, i) => {
                const bc = BOOK_COLORS[s.book] ?? { bg: '#F1EFE8', text: '#444441', border: '#D3D1C7' };
                return (
                  <div
                    key={i}
                    style={{
                      border: `1px solid ${s.id ? bc.border : '#f3f4f6'}`,
                      borderRadius: '12px', overflow: 'hidden',
                      background: s.id ? '#fff' : '#f9fafb',
                    }}
                  >
                    <div style={{
                      padding: '10px 14px',
                      background: s.id ? bc.bg : '#f3f4f6',
                      borderBottom: `1px solid ${s.id ? bc.border + '50' : '#f3f4f6'}`,
                    }}>
                      <span style={{
                        fontSize: '12px', fontWeight: 700,
                        color: s.id ? bc.text : '#9ca3af',
                      }}>
                        {s.book_display}
                      </span>
                      {s.reference && (
                        <span style={{ fontSize: '11px', color: s.id ? bc.text + '99' : '#9ca3af', marginLeft: '6px' }}>
                          {s.reference}
                        </span>
                      )}
                    </div>
                    <div style={{ padding: '12px 14px' }}>
                      {s.id ? (
                        <>
                          <p style={{
                            fontSize: '13px', lineHeight: 1.8,
                            color: '#1f2937', margin: '0 0 10px',
                            fontFamily: "'Gowun Batang', serif",
                          }}>
                            {s.text_ko_krv}
                          </p>
                          <Link
                            to={`/sayings/${s.id}`}
                            style={{
                              fontSize: '12px', color: '#7F77DD',
                              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px',
                            }}
                          >
                            상세 보기
                            <ChevronRight size={11} />
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
        ) : !loading && groups.length > 0 ? (
          <div style={{
            textAlign: 'center', padding: '40px',
            background: '#fff', border: '1px solid #e9e4dc', borderRadius: '14px',
          }}>
            <p style={{
              fontSize: '14px', color: '#9ca3af',
              fontFamily: "'Gowun Batang', serif",
            }}>
              위에서 사건을 선택하면 4복음서를 나란히 비교합니다.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}