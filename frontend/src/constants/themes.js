// frontend/src/constants/themes.js
//
// 주님의 음성 전체에서 공통으로 쓰는 주제 색상·슬라이드 테마 정의.
// 기존 SayingSlide, SayingDetailPage, SayingListPage, SayingsSubPages 4개 파일에
// 동일하게 중복 선언되어 있던 것을 여기서 단일 관리.
//
// 사용법:
//   import { THEME_COLORS, SLIDE_THEME, BOOK_COLORS, getThemeColor, getSlideTheme } from '../constants/themes';

// ── 1. 라이트 UI용 (카드·뱃지·필터) ─────────────────────────
// bg: 배경, text: 텍스트, border: 테두리, gold: 포인트 강조
export const THEME_COLORS = {
  i_am:         { bg: '#EEEDFE', text: '#3C3489', border: '#AFA9EC', gold: '#7F77DD' },
  salvation:    { bg: '#E1F5EE', text: '#085041', border: '#5DCAA5', gold: '#1D9E75' },
  kingdom:      { bg: '#FAEEDA', text: '#633806', border: '#EF9F27', gold: '#BA7517' },
  love:         { bg: '#FAECE7', text: '#712B13', border: '#F0997B', gold: '#993C1D' },
  prayer:       { bg: '#FBEAF0', text: '#72243E', border: '#ED93B1', gold: '#993556' },
  faith:        { bg: '#E6F1FB', text: '#0C447C', border: '#85B7EB', gold: '#185FA5' },
  holy_spirit:  { bg: '#EAF3DE', text: '#27500A', border: '#97C459', gold: '#3B6D11' },
  discipleship: { bg: '#F1EFE8', text: '#444441', border: '#B4B2A9', gold: '#5F5E5A' },
  cross:        { bg: '#FAECE7', text: '#712B13', border: '#F0997B', gold: '#993C1D' },
  resurrection: { bg: '#EEEDFE', text: '#3C3489', border: '#AFA9EC', gold: '#7F77DD' },
  judgment:     { bg: '#FCEBEB', text: '#791F1F', border: '#F09595', gold: '#A32D2D' },
  forgiveness:  { bg: '#E1F5EE', text: '#085041', border: '#5DCAA5', gold: '#1D9E75' },
  healing:      { bg: '#EAF3DE', text: '#27500A', border: '#97C459', gold: '#3B6D11' },
  identity:     { bg: '#FAEEDA', text: '#633806', border: '#EF9F27', gold: '#BA7517' },
};
export const DEFAULT_THEME_COLOR = { bg: '#EEEDFE', text: '#3C3489', border: '#AFA9EC', gold: '#7F77DD' };

/** 주제 키로 라이트 UI 색상 반환 */
export function getThemeColor(themeKey) {
  return THEME_COLORS[themeKey] ?? DEFAULT_THEME_COLOR;
}

/** saying 객체의 첫 번째 테마로 색상 반환 */
export function getThemeColorFromSaying(saying) {
  const key = saying?.themes?.[0]?.key;
  return getThemeColor(key);
}


// ── 2. 슬라이드 다크 배경용 (SayingSlide) ────────────────────
// bg: 슬라이드 배경, accent: 강조색, textAccent: 텍스트 강조, tag: 뱃지 배경
export const SLIDE_THEME = {
  i_am:         { bg: '#1A1535', accent: '#7F77DD', textAccent: '#C8C4F4', tag: '#352E72' },
  salvation:    { bg: '#0C2820', accent: '#1D9E75', textAccent: '#7DDCB8', tag: '#134D36' },
  kingdom:      { bg: '#1C1407', accent: '#BA7517', textAccent: '#F5B840', tag: '#3A2810' },
  love:         { bg: '#1F0C0A', accent: '#993C1D', textAccent: '#F07A52', tag: '#3E160E' },
  prayer:       { bg: '#1C0B14', accent: '#993556', textAccent: '#EE7AA0', tag: '#361526' },
  faith:        { bg: '#071B35', accent: '#185FA5', textAccent: '#64A8E8', tag: '#0D2F52' },
  holy_spirit:  { bg: '#0E1F04', accent: '#3B6D11', textAccent: '#88C94A', tag: '#1A3808' },
  discipleship: { bg: '#131211', accent: '#5F5E5A', textAccent: '#D4D2CB', tag: '#262422' },
  cross:        { bg: '#1F0C0A', accent: '#993C1D', textAccent: '#F07A52', tag: '#3E160E' },
  resurrection: { bg: '#1A1535', accent: '#7F77DD', textAccent: '#C8C4F4', tag: '#352E72' },
  judgment:     { bg: '#1F0808', accent: '#A32D2D', textAccent: '#F07070', tag: '#3A1010' },
  forgiveness:  { bg: '#0C2820', accent: '#1D9E75', textAccent: '#7DDCB8', tag: '#134D36' },
  healing:      { bg: '#0E1F04', accent: '#3B6D11', textAccent: '#88C94A', tag: '#1A3808' },
  identity:     { bg: '#1C1407', accent: '#BA7517', textAccent: '#F5B840', tag: '#3A2810' },
  default:      { bg: '#1A1535', accent: '#7F77DD', textAccent: '#C8C4F4', tag: '#352E72' },
};

/** saying 의 첫 번째 테마로 슬라이드 배경 테마 반환 */
export function getSlideTheme(saying) {
  const key = saying?.themes?.[0]?.key;
  return SLIDE_THEME[key] ?? SLIDE_THEME.default;
}


// ── 3. 복음서별 색상 ─────────────────────────────────────────
export const BOOK_COLORS = {
  MAT: { bg: '#E6F1FB', text: '#0C447C', border: '#85B7EB', accent: '#185FA5' },
  MRK: { bg: '#EAF3DE', text: '#27500A', border: '#97C459', accent: '#3B6D11' },
  LUK: { bg: '#FAEEDA', text: '#633806', border: '#EF9F27', accent: '#BA7517' },
  JHN: { bg: '#EEEDFE', text: '#3C3489', border: '#AFA9EC', accent: '#7F77DD' },
};
export const BOOK_LABELS = {
  MAT: '마태복음', MRK: '마가복음', LUK: '누가복음', JHN: '요한복음',
};
export const BOOK_ORDER = ['MAT', 'MRK', 'LUK', 'JHN'];
export const BOOK_CHAPTERS = { MAT: 28, MRK: 16, LUK: 24, JHN: 21 };

/** 복음서 코드로 색상 반환 */
export function getBookColor(bookCode) {
  return BOOK_COLORS[bookCode] ?? { bg: '#F1EFE8', text: '#444441', border: '#D3D1C7', accent: '#5F5E5A' };
}


// ── 4. 크기 레이블 ───────────────────────────────────────────
export const SIZE_LABELS = { S: '단문', M: '중문', L: '장문' };

/** 크기 코드로 한글 레이블 반환 */
export function getSizeLabel(sizeCode) {
  return SIZE_LABELS[sizeCode] ?? sizeCode;
}