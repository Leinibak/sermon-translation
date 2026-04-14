# backend/bible_verses/management/commands/export_gospel_sayings.py
#
# DB 데이터를 JSON 으로 내보내거나 JSON 파일 유효성을 검증합니다
#
# ── 사용법 ──────────────────────────────────────────────────────
#   python manage.py export_gospel_sayings                   # 전체 DB → JSON
#   python manage.py export_gospel_sayings --book MAT        # 마태복음만
#   python manage.py export_gospel_sayings --out /path/dir   # 출력 디렉토리 지정
#   python manage.py export_gospel_sayings --validate /path/to/file.json  # 검증만
# ────────────────────────────────────────────────────────────────

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings

from bible_verses.models import JesusSaying

DATA_DIR = Path(settings.BASE_DIR) / 'data' / 'jesus_sayings'

REQUIRED_FIELDS = ['book', 'chapter', 'verse_start', 'text_ko_krv']
OPTIONAL_TEXT_FIELDS = ['text_ko_new', 'text_en', 'text_de', 'text_zh', 'text_es',
                        'context_ko', 'context_en']
VALID_BOOKS    = ['MAT', 'MRK', 'LUK', 'JHN']
VALID_SIZES    = ['S', 'M', 'L']
VALID_AUDIENCE = ['disciples', 'pharisees', 'crowd', 'individual', 'prayer', 'mixed']
VALID_SEASONS  = ['advent', 'christmas', 'lent', 'easter', 'pentecost', 'ordinary']
VALID_THEMES   = ['i_am', 'salvation', 'kingdom', 'love', 'prayer', 'faith',
                  'holy_spirit', 'discipleship', 'cross', 'resurrection',
                  'judgment', 'forgiveness', 'healing', 'identity']


class Command(BaseCommand):
    help = 'DB → JSON 내보내기 또는 JSON 파일 구조 검증'

    def add_arguments(self, parser):
        parser.add_argument('--book', choices=VALID_BOOKS, help='특정 복음서만')
        parser.add_argument('--out', dest='out_dir', help='출력 디렉토리 (기본: data/jesus_sayings/)')
        parser.add_argument('--validate', dest='validate_path', help='검증할 JSON 파일 경로')
        parser.add_argument('--indent', type=int, default=2, help='JSON 들여쓰기 (기본: 2)')

    def handle(self, *args, **options):
        # ── 검증 모드 ─────────────────────────────────────────────
        if options['validate_path']:
            self._validate_file(Path(options['validate_path']))
            return

        # ── 내보내기 모드 ──────────────────────────────────────────
        out_dir = Path(options['out_dir']) if options['out_dir'] else DATA_DIR
        out_dir.mkdir(parents=True, exist_ok=True)

        books = [options['book']] if options['book'] else VALID_BOOKS
        for book in books:
            qs = JesusSaying.objects.filter(book=book).prefetch_related('themes', 'parallel_groups').order_by('chapter', 'verse_start')
            if not qs.exists():
                self.stdout.write(f'  ⚠  {book}: 데이터 없음 (스킵)')
                continue

            rows = [self._serialize(s) for s in qs]
            fname = {
                'MAT': 'jesus_sayings_matthew.json',
                'MRK': 'jesus_sayings_mark.json',
                'LUK': 'jesus_sayings_luke.json',
                'JHN': 'jesus_sayings_john.json',
            }[book]
            fpath = out_dir / fname
            with open(fpath, 'w', encoding='utf-8') as f:
                json.dump(rows, f, ensure_ascii=False, indent=options['indent'])
            self.stdout.write(
                self.style.SUCCESS(f'  ✅ {book} {len(rows)}개 → {fpath}')
            )

    # ── 직렬화 ────────────────────────────────────────────────────
    def _serialize(self, s: JesusSaying) -> dict:
        return {
            'book':           s.book,
            'chapter':        s.chapter,
            'verse_start':    s.verse_start,
            'verse_end':      s.verse_end,
            'size':           s.size,
            'text_ko_krv':    s.text_ko_krv,
            'text_ko_new':    s.text_ko_new,
            'text_en':        s.text_en,
            'text_de':        s.text_de,
            'text_zh':        s.text_zh,
            'text_es':        s.text_es,
            'context_ko':     s.context_ko,
            'context_en':     s.context_en,
            'keywords':       s.keywords or [],
            'audience':       s.audience,
            'occasion':       s.occasion,
            'season':         s.season,
            'slide_cycle':    s.slide_cycle,
            'slide_order':    s.slide_order,
            'is_active':      s.is_active,
            'themes':         [t.key for t in s.themes.all()],
            'parallel_groups': [pg.name for pg in s.parallel_groups.all()],
        }

    # ── 검증 ──────────────────────────────────────────────────────
    def _validate_file(self, path: Path):
        self.stdout.write(f'\n🔍 검증: {path}\n')
        if not path.exists():
            raise CommandError(f'파일 없음: {path}')

        try:
            with open(path, encoding='utf-8') as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            raise CommandError(f'JSON 파싱 오류: {e}')

        if not isinstance(data, list):
            raise CommandError('JSON 루트는 배열이어야 합니다')

        errors = []
        warnings = []

        for i, item in enumerate(data, 1):
            ref = f"[{i}] {item.get('book','?')} {item.get('chapter','?')}:{item.get('verse_start','?')}"

            # 필수 필드
            for f in REQUIRED_FIELDS:
                if not item.get(f):
                    errors.append(f'{ref}: 필수 필드 누락 — {f}')

            # 값 범위 검증
            if item.get('book') not in VALID_BOOKS:
                errors.append(f'{ref}: 잘못된 book — {item.get("book")}')

            if item.get('size') and item['size'] not in VALID_SIZES:
                errors.append(f'{ref}: 잘못된 size — {item["size"]}')

            if item.get('audience') and item['audience'] not in VALID_AUDIENCE:
                errors.append(f'{ref}: 잘못된 audience — {item["audience"]}')

            if item.get('season') and item['season'] not in VALID_SEASONS:
                errors.append(f'{ref}: 잘못된 season — {item["season"]}')

            for t in item.get('themes', []):
                if t not in VALID_THEMES:
                    warnings.append(f'{ref}: 알 수 없는 theme — {t}')

            # 키워드 구조 검증
            for kw in item.get('keywords', []):
                for kf in ['word', 'original', 'transliteration', 'meaning']:
                    if not kw.get(kf):
                        warnings.append(f'{ref}: keywords 필드 누락 — {kf}')

            # 권고사항
            if not item.get('text_ko_new'):
                warnings.append(f'{ref}: text_ko_new 없음 (새번역 추가 권장)')
            if not item.get('context_ko'):
                warnings.append(f'{ref}: context_ko 없음 (배경 설명 추가 권장)')
            if not item.get('keywords'):
                warnings.append(f'{ref}: keywords 없음 (원어 해설 추가 권장)')

        # 결과 출력
        self.stdout.write(f'  총 {len(data)}개 항목 검증\n')

        if errors:
            self.stdout.write(self.style.ERROR(f'\n❌ 오류 {len(errors)}개:'))
            for e in errors:
                self.stdout.write(f'   {e}')

        if warnings:
            self.stdout.write(self.style.WARNING(f'\n⚠  경고 {len(warnings)}개:'))
            for w in warnings:
                self.stdout.write(f'   {w}')

        if not errors and not warnings:
            self.stdout.write(self.style.SUCCESS('✅ 모든 항목 검증 통과!'))
        elif not errors:
            self.stdout.write(self.style.SUCCESS('\n✅ 오류 없음 (경고만 있음)'))
        else:
            raise CommandError(f'검증 실패: {len(errors)}개 오류')