// ============================================================
// frontend/src/components/JesusSayings/SectionBar.jsx
//
// 변경사항:
// - 반응형: 너비가 좁아지면 라벨이 사라지고 아이콘만 표시
//   (ResizeObserver로 SectionBar 실제 너비 감지 → 임계값 이하 시 compact 모드)
// - compact 모드에서도 hover 툴팁은 유지 (라벨 + 서브텍스트)
// - 1줄: 브레드크럼(왼쪽) + 탭 카드(오른쪽)
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Grid, BookOpen, GitBranch, PenLine, Map } from 'lucide-react';

const TABS = [
  {
    key:    'sayings/list',
    label:  '전체 말씀',
    sub:    '검색·필터',
    path:   '/sayings/list',
    icon:   Grid,
    color:  '#3C3489',
    bg:     '#EEEDFE',
    border: '#AFA9EC',
  },
  {
    key:    'sayings/themes',
    label:  '주제별',
    sub:    '14개 주제',
    path:   '/sayings/themes',
    icon:   BookOpen,
    color:  '#633806',
    bg:     '#FAEEDA',
    border: '#EF9F27',
  },
  {
    key:    'sayings/parallels',
    label:  '병행구절',
    sub:    '4복음서 비교',
    path:   '/sayings/parallels',
    icon:   GitBranch,
    color:  '#085041',
    bg:     '#E1F5EE',
    border: '#5DCAA5',
  },
  {
    key:    'sayings/bible-explorer',
    label:  '4복음서 탐색',
    sub:    '장·절 드릴다운',
    path:   '/sayings/bible-explorer',
    icon:   Map,
    color:  '#0C447C',
    bg:     '#E6F1FB',
    border: '#85B7EB',
  },
  {
    key:    'sayings/meditations',
    label:  '내 묵상',
    sub:    '기록한 묵상',
    path:   '/sayings/meditations',
    icon:   PenLine,
    color:  '#72243E',
    bg:     '#FBEAF0',
    border: '#ED93B1',
  },
];

// 이 너비 이하가 되면 compact(아이콘 전용) 모드로 전환
const COMPACT_BREAKPOINT = 600;

function buildCrumbs(pathname) {
  // trailing slash 제거 후 비교
  const p = pathname.replace(/\/$/, '');
  const crumbs = [{ label: '주님의 음성', path: '/sayings' }];

  // /sayings 홈: 정확히 /sayings 이거나 아무 서브경로도 없는 경우
  if (p === '/sayings') {
    crumbs[0].path = null;
    return crumbs;
  }

  if (p.startsWith('/sayings/themes'))
    crumbs.push({ label: '주제별', path: null });
  else if (p.startsWith('/sayings/list') || p.startsWith('/sayings/books'))
    crumbs.push({ label: '전체 말씀', path: null });
  else if (p.startsWith('/sayings/parallels'))
    crumbs.push({ label: '병행구절', path: null });
  else if (p.startsWith('/sayings/bible-explorer'))
    crumbs.push({ label: '4복음서 탐색', path: null });
  else if (p.startsWith('/sayings/meditations'))
    crumbs.push({ label: '내 묵상', path: null });
  else if (/^\/sayings\/\d+$/.test(p)) {
    // /sayings/:id — 숫자 ID인 경우만 말씀 상세
    crumbs.push({ label: '전체 말씀', path: '/sayings/list' });
    crumbs.push({ label: '말씀 상세', path: null });
  }
  // 그 외 알 수 없는 경로는 크럼 추가 없이 '주님의 음성'만 표시
  return crumbs;
}

function getActiveTab(pathname) {
  if (pathname.startsWith('/sayings/themes'))         return 'sayings/themes';
  if (pathname.startsWith('/sayings/list'))           return 'sayings/list';
  if (pathname.startsWith('/sayings/books'))          return 'sayings/list';
  if (pathname.startsWith('/sayings/parallels'))      return 'sayings/parallels';
  if (pathname.startsWith('/sayings/bible-explorer')) return 'sayings/bible-explorer';
  if (pathname.startsWith('/sayings/meditations'))    return 'sayings/meditations';
  if (/^\/sayings\/\d+\/meditate/.test(pathname)) return 'sayings/meditations';
  return '';
}

// ── 탭 카드 ─────────────────────────────────────────────────
function TabCard({ tab, isActive, compact }) {
  const [hovered, setHovered] = useState(false);
  const Icon = tab.icon;

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <Link
        to={tab.path}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          // compact 모드: 아이콘만이므로 정사각형에 가깝게
          gap: compact ? 0 : '5px',
          padding: compact ? '5px 7px' : '5px 10px 5px 8px',
          borderRadius: '8px',
          border: `1px solid ${isActive ? tab.border : (hovered ? tab.border + '90' : '#e9e4dc')}`,
          background: isActive ? tab.bg : (hovered ? tab.bg + '70' : '#fafaf9'),
          textDecoration: 'none',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        {/* 아이콘 */}
        <span style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '20px',
          height: '20px',
          borderRadius: '5px',
          background: isActive ? tab.color + '20' : (hovered ? tab.color + '15' : '#f0f0f0'),
          color: isActive ? tab.color : (hovered ? tab.color : '#9ca3af'),
          flexShrink: 0,
          transition: 'all 0.15s',
        }}>
          <Icon size={12} />
        </span>

        {/* 라벨 — compact 모드에서는 숨김 */}
        {!compact && (
          <span style={{
            fontSize: '12px',
            fontWeight: isActive ? 700 : 500,
            color: isActive ? tab.color : (hovered ? tab.color : '#374151'),
            whiteSpace: 'nowrap',
            transition: 'color 0.15s',
          }}>
            {tab.label}
          </span>
        )}
      </Link>

      {/* 툴팁 — hover 시 항상 표시 (compact 모드에선 라벨+서브, 일반 모드엔 서브만) */}
      {hovered && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(28,29,36,0.90)',
          color: 'rgba(255,255,255,0.9)',
          fontSize: '10px',
          fontWeight: 400,
          padding: '3px 8px',
          borderRadius: '5px',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 200,
          lineHeight: 1.5,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}>
          {/* compact 모드에선 라벨도 툴팁에 표시 */}
          {compact && (
            <span style={{ fontWeight: 600, marginRight: '4px' }}>{tab.label}</span>
          )}
          <span style={{ color: compact ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.9)' }}>
            {tab.sub}
          </span>
          {/* 화살표 */}
          <div style={{
            position: 'absolute',
            top: '-4px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderBottom: '4px solid rgba(28,29,36,0.90)',
          }} />
        </div>
      )}
    </div>
  );
}

export default function SectionBar() {
  const { pathname } = useLocation();
  const crumbs    = buildCrumbs(pathname);
  const activeTab = getActiveTab(pathname);

  // ── 실제 컨테이너 너비 감지 → compact 전환 ──────────────────
  const barRef  = useRef(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setCompact(entry.contentRect.width < COMPACT_BREAKPOINT);
      }
    });

    observer.observe(el);
    // 마운트 시 초기값 반영
    setCompact(el.offsetWidth < COMPACT_BREAKPOINT);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="sticky z-40 bg-white"
      style={{
        top: '80px',
        borderBottom: '1px solid #e9e4dc',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div
        ref={barRef}
        className="mx-auto px-4 md:px-6"
        style={{
          maxWidth: '960px',
          height: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        {/* 왼쪽: 브레드크럼 */}
        <nav
          className="flex items-center gap-1"
          style={{ flexShrink: 0, minWidth: 0, overflow: 'hidden' }}
          aria-label="breadcrumb"
        >
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <span style={{ color: '#d1d5db', fontSize: '12px', flexShrink: 0 }}>›</span>
              )}
              {c.path ? (
                <Link
                  to={c.path}
                  style={{
                    fontSize: '12px',
                    color: '#9ca3af',
                    textDecoration: 'none',
                    transition: 'color 0.15s',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#6b7280'}
                  onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
                >
                  {c.label}
                </Link>
              ) : (
                <span style={{
                  fontSize: '12px', fontWeight: 600, color: '#3C3489',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {c.label}
                </span>
              )}
            </React.Fragment>
          ))}
        </nav>

        {/* 오른쪽: 탭 카드들 — compact 여부에 따라 라벨 on/off */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          {TABS.map(tab => (
            <TabCard
              key={tab.key}
              tab={tab}
              isActive={activeTab === tab.key}
              compact={compact}
            />
          ))}
        </div>
      </div>
    </div>
  );
}