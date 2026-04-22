// frontend/src/utils/meditation.js
// 묵상 데이터 파싱 유틸리티 + 단계 정의

// ─── 4단계 정의 (SayingMeditationPage와 동일) ─────────────────
export const SLP_STEPS = [
  {
    key: 'praeparatio',
    roman: 'I',
    latin: 'Praeparatio · Auditio · Illuminatio',
    label: '고요 속에 말씀 듣기',
    icon: '🌅',
    color: '#7a4a00',
    colorBg: '#fdf0e0',
    colorMid: '#e8c88a',
    colorBorder: '#e8c88a',
    fields: [
      { id: 'j0a', label: '마음에 머문 단어 · 구절' },
      { id: 'j0b', label: '본문에서 새롭게 보인 것들' },
      { id: 'j0c', label: '이 발견들이 함께 가리키는 것' },
    ],
  },
  {
    key: 'meditatio',
    roman: 'II',
    latin: 'Meditatio · Oratio · Applicatio',
    label: '말씀 앞에 서기',
    icon: '🤲',
    color: '#4a3f7a',
    colorBg: '#f0eef9',
    colorMid: '#c8c3e8',
    colorBorder: '#c8c3e8',
    fields: [
      { id: 'j1a', label: '말씀과 내 삶의 연결 — 묵상' },
      { id: 'j1b', label: '하나님께 드리는 응답 — 기도' },
      { id: 'j1c', label: '오늘의 순종 — 구체적 결단' },
    ],
  },
  {
    key: 'contemplatio',
    roman: 'III',
    latin: 'Contemplatio · Quies',
    label: '예수님 안에 머물기',
    icon: '✨',
    color: '#2d6e2d',
    colorBg: '#eaf4ea',
    colorMid: '#a8d4a8',
    colorBorder: '#a8d4a8',
    fields: [
      { id: 'j3a', label: '주님 안에서의 머묾' },
    ],
  },
  {
    key: 'propositum',
    roman: 'IV',
    latin: 'Propositum · Vivendo',
    label: '오늘을 향한 발걸음',
    icon: '🌿',
    color: '#005a48',
    colorBg: '#e0f5ee',
    colorMid: '#7ecab5',
    colorBorder: '#7ecab5',
    fields: [
      { id: 'j4a', label: '마음에 새긴 한 구절' },
      { id: 'j4b', label: '삶으로 드릴 순종' },
      { id: 'j4c', label: '올려드리는 기도' },
      { id: 'j4d', label: '성령의 일하심을 향한 기대' },
    ],
  },
];

// ─── content JSON 파싱 ────────────────────────────────────────
export function parseMeditationContent(contentStr) {
  if (!contentStr) return {};
  try {
    const parsed = JSON.parse(contentStr);
    return typeof parsed === 'object' ? parsed : { j0a: contentStr };
  } catch {
    return { j0a: contentStr }; // 구버전 plain text 대응
  }
}

// ─── 특정 단계에 작성된 내용이 있는지 확인 ────────────────────
export function hasStepContent(parsed, stepKey) {
  const step = SLP_STEPS.find(s => s.key === stepKey);
  if (!step) return false;
  return step.fields.some(f => (parsed[f.id] || '').trim().length > 0);
}

// ─── 묵상에서 첫 번째 작성된 텍스트 미리보기 (목록 카드용) ────
export function getMeditationPreview(parsed) {
  for (const step of SLP_STEPS) {
    for (const field of step.fields) {
      const text = (parsed[field.id] || '').trim();
      if (text.length > 0) return text;
    }
  }
  return '';
}

// ─── 날짜 포맷 ────────────────────────────────────────────────
export function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateKo(str) {
  if (!str) return '';
  const d = new Date(str);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

export function formatDateShort(str) {
  if (!str) return '';
  const d = new Date(str);
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
}

export function getDateKey(str) {
  // "2026-04-22T..." → "2026-04-22"
  if (!str) return '';
  return str.split('T')[0];
}