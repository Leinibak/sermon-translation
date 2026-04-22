// ============================================================
// frontend/src/pages/MeditationDetailPage.jsx
//
// 묵상 상세 보기 페이지
// - 말씀 원문 + 4단계 묵상 내용 전체 표시
// - PDF 저장 기능 (html2pdf.js)
// - 이전 / 다음 묵상 네비게이션
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileDown, Edit3, Trash2 } from 'lucide-react';
import { getMeditations, getSaying, deleteMeditation } from '../api/sayings';
import { useAuth } from '../contexts/AuthContext';
import SectionBar from '../components/JesusSayings/SectionBar';
import {
  SLP_STEPS,
  parseMeditationContent,
  hasStepContent,
  formatDateKo,
  formatDateShort,
  getDateKey,
} from '../utils/meditation';

// ── 색상 토큰 ────────────────────────────────────────────────
const BG      = '#FDFBF7';
const BORDER  = '#e9e4dc';
const PURPLE  = '#3C3489';
const PURPLE_L = '#EEEDFE';
const PURPLE_M = '#AFA9EC';

// ══════════════════════════════════════════════════════════
// StepSection — 단계별 묵상 섹션
// ══════════════════════════════════════════════════════════
function StepSection({ step, parsed }) {
  const filledFields = step.fields.filter(f => (parsed[f.id] || '').trim().length > 0);
  if (filledFields.length === 0) return null;

  return (
    <div style={{ marginBottom: '32px' }}>
      {/* 단계 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        marginBottom: '16px', paddingBottom: '12px',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <span style={{ fontSize: '20px' }}>{step.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#9ca3af', marginBottom: '2px',
          }}>
            {step.roman} · {step.key.toUpperCase()}
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#1f2937' }}>
            {step.label}
          </div>
        </div>
        <div style={{
          fontSize: '10px', color: '#c9c2b8', fontStyle: 'italic',
          display: 'none', // 좁은 화면에서 숨김 — 필요시 @media로 표시
        }}>
          {step.latin}
        </div>
      </div>

      {/* 필드별 내용 */}
      {filledFields.map(field => (
        <div key={field.id} style={{ marginBottom: '18px' }}>
          <div style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#9ca3af', marginBottom: '8px',
          }}>
            {field.label}
          </div>
          <div style={{
            fontSize: '14px', fontFamily: "'Gowun Batang', serif",
            color: '#374151', lineHeight: 1.9,
            padding: '14px 18px',
            background: '#fff',
            border: `1px solid ${BORDER}`,
            borderRadius: '10px',
            whiteSpace: 'pre-wrap',
          }}>
            {parsed[field.id]}
          </div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// PDF 전용 렌더 영역 (화면 밖 숨김)
// ══════════════════════════════════════════════════════════
function PdfContent({ meditation, saying, parsed, dateKo }) {
  const ref = meditation.saying?.reference || meditation.saying_reference || '';

  return (
    <div style={{
      fontFamily: "'Gowun Batang', 'Apple SD Gothic Neo', serif",
      color: '#1a1714',
      padding: '40px',
      background: '#fff',
      maxWidth: '680px',
    }}>
      {/* PDF 헤더 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: '32px', paddingBottom: '16px',
        borderBottom: '2px solid #3C3489',
      }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', color: '#9ca3af', marginBottom: '4px' }}>
            JOUNSORI HAMBURG · 내 묵상 노트
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#3C3489' }}>{ref}</div>
        </div>
        <div style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'right' }}>
          {dateKo}
        </div>
      </div>

      {/* 말씀 본문 */}
      {saying && (
        <div style={{
          background: '#EEEDFE', borderRadius: '10px',
          padding: '20px 24px', marginBottom: '36px',
          borderLeft: '4px solid #3C3489',
        }}>
          <div style={{ fontSize: '18px', lineHeight: 2, color: '#1f2937' }}>
            {saying.text_ko_krv}
          </div>
        </div>
      )}

      {/* 4단계 */}
      {SLP_STEPS.map(step => {
        const filledFields = step.fields.filter(f => (parsed[f.id] || '').trim().length > 0);
        if (filledFields.length === 0) return null;
        return (
          <div key={step.key} style={{ marginBottom: '28px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              marginBottom: '14px', paddingBottom: '8px',
              borderBottom: `1px solid ${step.colorBorder || '#e9e4dc'}`,
            }}>
              <span style={{ fontSize: '16px' }}>{step.icon}</span>
              <div>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: '#9ca3af' }}>
                  {step.roman} · {step.key.toUpperCase()}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: step.color || '#1f2937' }}>
                  {step.label}
                </div>
              </div>
            </div>
            {filledFields.map(field => (
              <div key={field.id} style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: '#9ca3af', marginBottom: '5px', textTransform: 'uppercase' }}>
                  {field.label}
                </div>
                <div style={{
                  fontSize: '13px', lineHeight: 1.9, color: '#374151',
                  padding: '10px 14px',
                  background: step.colorBg || '#f9f9f9',
                  borderRadius: '6px',
                  whiteSpace: 'pre-wrap',
                }}>
                  {parsed[field.id]}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {/* PDF 푸터 */}
      <div style={{
        marginTop: '40px', paddingTop: '14px',
        borderTop: '1px solid #e9e4dc',
        fontSize: '10px', color: '#c9c2b8', textAlign: 'center',
      }}>
        jounsori.hamburg
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// MeditationDetailPage — 메인
// ══════════════════════════════════════════════════════════
export default function MeditationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [meditation, setMeditation] = useState(null);
  const [saying, setSaying] = useState(null);
  const [allMeditations, setAllMeditations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const pdfRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login', { state: { from: `/sayings/meditations/${id}` } }); return; }

    // 전체 묵상 목록 + 현재 묵상
    getMeditations().then(d => {
      const list = Array.isArray(d) ? d : (d?.results ?? []);
      list.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));
      setAllMeditations(list);

      const current = list.find(m => String(m.id) === String(id));
      if (current) {
        setMeditation(current);
        // 연결된 말씀 상세 가져오기
        const sayingId = current.saying?.id || current.saying;
        if (sayingId) {
          getSaying(sayingId).then(s => {
            setSaying(s);
            setLoading(false);
          });
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });
  }, [id, isAuthenticated, navigate]);

  // ── 이전 / 다음 묵상 계산
  const currentIdx = allMeditations.findIndex(m => String(m.id) === String(id));
  const prevMeditation = currentIdx < allMeditations.length - 1 ? allMeditations[currentIdx + 1] : null;
  const nextMeditation = currentIdx > 0 ? allMeditations[currentIdx - 1] : null;

  // ── 삭제
  const handleDelete = async () => {
    if (!window.confirm('이 묵상을 삭제하시겠습니까?')) return;
    const ok = await deleteMeditation(meditation.id);
    if (ok) navigate('/sayings/meditations');
  };

  // ── PDF 저장
  const handlePdf = async () => {
    if (!pdfRef.current) return;
    setPdfLoading(true);
    try {
      // html2pdf.js 동적 로드
      const html2pdf = (await import('html2pdf.js')).default;
      const ref = meditation.saying?.reference || meditation.saying_reference || '묵상';
      const dateStr = getDateKey(meditation.date || meditation.created_at).replace(/-/g, '');
      const filename = `묵상_${ref.replace(/\s/g, '')}_${dateStr}.pdf`;

      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(pdfRef.current)
        .save();
    } catch (err) {
      console.error('PDF 생성 오류:', err);
      alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setPdfLoading(false);
    }
  };

  // ── 로딩
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: BG }}>
        <SectionBar />
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '80px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%',
            border: '2px solid #e5e7eb', borderTopColor: PURPLE_M,
            animation: 'spin 0.7s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (!meditation) {
    return (
      <div style={{ minHeight: '100vh', background: BG }}>
        <SectionBar />
        <div style={{ maxWidth: '480px', margin: '80px auto', textAlign: 'center', padding: '0 24px' }}>
          <p style={{ color: '#9ca3af', fontFamily: "'Gowun Batang', serif" }}>묵상을 찾을 수 없습니다.</p>
          <Link to="/sayings/meditations" style={{ color: PURPLE, fontSize: '13px' }}>← 내 묵상 노트</Link>
        </div>
      </div>
    );
  }

  const parsed = parseMeditationContent(meditation.content);
  const dateKo = formatDateKo(meditation.date || meditation.created_at);
  const ref = meditation.saying?.reference || meditation.saying_reference || '말씀';
  const sayingId = meditation.saying?.id || meditation.saying;

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <SectionBar />

      {/* ── 상단 바 */}
      <div style={{
        background: '#fff',
        borderBottom: `1px solid ${BORDER}`,
        padding: '12px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 30,
      }}>
        <button
          onClick={() => navigate('/sayings/meditations')}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            fontSize: '13px', color: '#6b7280', background: 'none',
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <ChevronLeft size={14} /> 내 묵상 노트
        </button>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* PDF 저장 */}
          <button
            onClick={handlePdf}
            disabled={pdfLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '6px 14px', borderRadius: '7px', fontSize: '12px',
              border: `1px solid ${BORDER}`, background: '#fff',
              color: pdfLoading ? '#9ca3af' : '#374151',
              cursor: pdfLoading ? 'default' : 'pointer',
              fontFamily: 'inherit', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!pdfLoading) e.currentTarget.style.borderColor = PURPLE_M; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; }}
          >
            <FileDown size={13} />
            {pdfLoading ? 'PDF 생성 중...' : 'PDF 저장'}
          </button>

          {/* 수정 (묵상 페이지로 이동) */}
          {sayingId && (
            <Link
              to={`/sayings/${sayingId}/meditate`}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '6px 14px', borderRadius: '7px', fontSize: '12px',
                border: `1px solid ${BORDER}`, background: '#fff',
                color: '#374151', textDecoration: 'none',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = PURPLE_M}
              onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}
            >
              <Edit3 size={13} /> 수정
            </Link>
          )}

          {/* 삭제 */}
          <button
            onClick={handleDelete}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '6px 14px', borderRadius: '7px', fontSize: '12px',
              border: '1px solid #fca5a5', background: '#fff',
              color: '#e05c5c', cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
          >
            <Trash2 size={13} /> 삭제
          </button>
        </div>
      </div>

      {/* ── 본문 */}
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '36px 24px 60px' }}>

        {/* 날짜 */}
        <div style={{
          fontSize: '12px', color: '#9ca3af',
          textAlign: 'center', marginBottom: '28px',
          letterSpacing: '0.05em',
        }}>
          {dateKo}
        </div>

        {/* 말씀 카드 */}
        <div style={{
          background: '#fff', border: `1px solid ${PURPLE_M}`,
          borderRadius: '14px', overflow: 'hidden', marginBottom: '36px',
        }}>
          <div style={{
            padding: '14px 20px', background: PURPLE_L,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: PURPLE }}>{ref}</span>
            {sayingId && (
              <Link
                to={`/sayings/${sayingId}`}
                style={{ fontSize: '11px', color: '#7F77DD', textDecoration: 'none' }}
              >
                말씀 상세 보기 →
              </Link>
            )}
          </div>
          <div style={{
            padding: '20px 24px',
            fontSize: '15px', fontFamily: "'Gowun Batang', serif",
            color: '#1f2937', lineHeight: 2,
          }}>
            {saying?.text_ko_krv || (
              <span style={{ color: '#9ca3af', fontSize: '13px' }}>말씀을 불러오는 중...</span>
            )}
          </div>
        </div>

        {/* 4단계 묵상 내용 */}
        {SLP_STEPS.map(step => (
          <StepSection key={step.key} step={step} parsed={parsed} />
        ))}

        {/* 이전 / 다음 네비 */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingTop: '24px', marginTop: '8px',
          borderTop: `1px solid ${BORDER}`,
        }}>
          {prevMeditation ? (
            <button
              onClick={() => navigate(`/sayings/meditations/${prevMeditation.id}`)}
              style={navBtnStyle}
            >
              <ChevronLeft size={14} />
              {prevMeditation.saying?.reference || '이전 묵상'}
              <span style={{ fontSize: '11px', color: '#c9c2b8', marginLeft: '4px' }}>
                ({formatDateShort(prevMeditation.date || prevMeditation.created_at)})
              </span>
            </button>
          ) : <div />}

          {nextMeditation ? (
            <button
              onClick={() => navigate(`/sayings/meditations/${nextMeditation.id}`)}
              style={navBtnStyle}
            >
              <span style={{ fontSize: '11px', color: '#c9c2b8', marginRight: '4px' }}>
                ({formatDateShort(nextMeditation.date || nextMeditation.created_at)})
              </span>
              {nextMeditation.saying?.reference || '다음 묵상'}
              <ChevronRight size={14} />
            </button>
          ) : <div />}
        </div>
      </div>

      {/* ── PDF 렌더 영역 (숨김) */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0, width: '794px' }}>
        <div ref={pdfRef}>
          <PdfContent
            meditation={meditation}
            saying={saying}
            parsed={parsed}
            dateKo={dateKo}
          />
        </div>
      </div>
    </div>
  );
}

const navBtnStyle = {
  display: 'flex', alignItems: 'center', gap: '5px',
  fontSize: '13px', color: '#6b7280',
  padding: '8px 16px', borderRadius: '8px',
  border: `1px solid ${BORDER}`, background: '#fff',
  cursor: 'pointer', fontFamily: 'inherit',
  transition: 'border-color 0.15s',
};