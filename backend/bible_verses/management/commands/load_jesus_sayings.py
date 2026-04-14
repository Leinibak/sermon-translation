# backend/bible_verses/management/commands/load_gospel_sayings.py
#
# 4복음서 예수님 말씀 고도화 데이터 로더
#
# ── 사용법 ──────────────────────────────────────────────────────
#   python manage.py load_gospel_sayings                     # 전체 로드 (중복 스킵)
#   python manage.py load_gospel_sayings --book MAT          # 마태복음만
#   python manage.py load_gospel_sayings --book LUK          # 누가복음만
#   python manage.py load_gospel_sayings --book MRK          # 마가복음만
#   python manage.py load_gospel_sayings --book JHN          # 요한복음만
#   python manage.py load_gospel_sayings --update            # 기존 데이터도 업데이트
#   python manage.py load_gospel_sayings --clear --book MAT  # 마태복음 초기화 후 재로드
#   python manage.py load_gospel_sayings --dry-run           # 실제 저장 없이 검증만
#   python manage.py load_gospel_sayings --json /path/to/custom.json  # 외부 JSON 파일 로드
#
# ── JSON 파일 위치 ──────────────────────────────────────────────
#   BASE_DIR / data / jesus_sayings / *.json
#   또는 --json 옵션으로 직접 경로 지정
# ────────────────────────────────────────────────────────────────

import json
import os
import sys
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.conf import settings

from bible_verses.models import Theme, JesusSaying, ParallelGroup


# ── 기본 데이터 디렉토리 ─────────────────────────────────────────
DATA_DIR = Path(settings.BASE_DIR) / 'data' / 'jesus_sayings'

# ── 복음서 코드 → 파일명 매핑 ────────────────────────────────────
BOOK_FILE_MAP = {
    'MAT': 'jesus_sayings_matthew.json',
    'MRK': 'jesus_sayings_mark.json',
    'LUK': 'jesus_sayings_luke.json',
    'JHN': 'jesus_sayings_john.json',    # 기존 load_jesus_sayings.py 와 호환
}

BOOK_NAMES = {
    'MAT': '마태복음',
    'MRK': '마가복음',
    'LUK': '누가복음',
    'JHN': '요한복음',
}


class Command(BaseCommand):
    help = '4복음서 예수님 말씀 고도화 JSON 데이터를 DB에 로드합니다'

    # ── 인자 정의 ─────────────────────────────────────────────────
    def add_arguments(self, parser):
        parser.add_argument(
            '--book',
            choices=['MAT', 'MRK', 'LUK', 'JHN'],
            help='특정 복음서만 로드 (기본: 전체)',
        )
        parser.add_argument(
            '--json',
            dest='json_path',
            help='직접 JSON 파일 경로 지정 (--book 보다 우선)',
        )
        parser.add_argument(
            '--update',
            action='store_true',
            help='이미 존재하는 말씀도 모든 필드를 업데이트',
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='로드 전 해당 복음서 데이터를 모두 삭제 (--book 필수)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            dest='dry_run',
            help='실제 저장 없이 데이터 검증만 수행',
        )
        parser.add_argument(
            '--no-parallel',
            action='store_true',
            dest='no_parallel',
            help='병행구절 그룹 처리 건너뜀',
        )

    # ── 메인 핸들러 ───────────────────────────────────────────────
    def handle(self, *args, **options):
        self.dry_run = options['dry_run']
        self.update  = options['update']

        if self.dry_run:
            self.stdout.write(self.style.WARNING('🔍 DRY-RUN 모드 — 실제 저장 없음\n'))

        # JSON 파일 경로 결정
        json_files = self._resolve_files(options)

        # --clear 처리
        if options['clear']:
            if not options['book']:
                raise CommandError('--clear 옵션은 --book 과 함께 사용해야 합니다')
            self._clear_book(options['book'])

        # 주제(Theme) 동기화
        theme_map = self._sync_themes()

        # 파일별 로드
        total_created = total_updated = total_skipped = 0
        for fpath, book_code in json_files:
            c, u, s = self._load_file(
                fpath, book_code, theme_map,
                skip_parallel=options['no_parallel'],
            )
            total_created  += c
            total_updated  += u
            total_skipped  += s

        # 요약
        self.stdout.write('\n' + '─' * 50)
        self.stdout.write(
            self.style.SUCCESS(
                f'✅ 완료  |  생성 {total_created}  |  '
                f'업데이트 {total_updated}  |  스킵 {total_skipped}'
            )
        )
        if self.dry_run:
            self.stdout.write(self.style.WARNING('(DRY-RUN — DB 변경 없음)'))

    # ── 파일 목록 결정 ────────────────────────────────────────────
    def _resolve_files(self, options):
        """(Path, book_code) 튜플 목록 반환"""
        if options['json_path']:
            p = Path(options['json_path'])
            if not p.exists():
                raise CommandError(f'파일 없음: {p}')
            book = options.get('book') or self._guess_book(p)
            return [(p, book)]

        books = [options['book']] if options['book'] else list(BOOK_FILE_MAP.keys())
        result = []
        for book in books:
            fname = BOOK_FILE_MAP[book]
            fpath = DATA_DIR / fname
            if not fpath.exists():
                self.stdout.write(
                    self.style.WARNING(f'⚠  파일 없음: {fpath}  (스킵)')
                )
                continue
            result.append((fpath, book))

        if not result:
            raise CommandError(
                f'로드할 JSON 파일을 찾지 못했습니다.\n'
                f'  기본 경로: {DATA_DIR}\n'
                f'  --json 옵션으로 파일을 직접 지정하거나,\n'
                f'  위 디렉토리에 JSON 파일을 배치하세요.'
            )
        return result

    def _guess_book(self, path: Path):
        """파일명으로 복음서 코드 추측"""
        name = path.stem.lower()
        for code, fname in BOOK_FILE_MAP.items():
            if code.lower() in name:
                return code
        return None

    # ── 초기화 ───────────────────────────────────────────────────
    def _clear_book(self, book_code):
        count, _ = JesusSaying.objects.filter(book=book_code).delete()
        self.stdout.write(
            self.style.WARNING(
                f'🗑  {BOOK_NAMES[book_code]} 데이터 {count}개 삭제'
            )
        )

    # ── 주제 동기화 ───────────────────────────────────────────────
    def _sync_themes(self):
        """기존 + 신규 주제를 key → Theme 오브젝트로 매핑"""
        THEMES = [
            {'key': 'i_am',         'name_ko': '나는 ~이다 선언', 'name_en': 'I AM Declarations',       'order': 1},
            {'key': 'salvation',    'name_ko': '영생 / 구원',     'name_en': 'Salvation / Eternal Life', 'order': 2},
            {'key': 'kingdom',      'name_ko': '하나님 나라',     'name_en': 'Kingdom of God',            'order': 3},
            {'key': 'love',         'name_ko': '사랑 / 계명',     'name_en': 'Love / Commandment',        'order': 4},
            {'key': 'prayer',       'name_ko': '기도',            'name_en': 'Prayer',                    'order': 5},
            {'key': 'faith',        'name_ko': '믿음',            'name_en': 'Faith',                     'order': 6},
            {'key': 'holy_spirit',  'name_ko': '성령',            'name_en': 'Holy Spirit',               'order': 7},
            {'key': 'discipleship', 'name_ko': '제자도',          'name_en': 'Discipleship',              'order': 8},
            {'key': 'cross',        'name_ko': '십자가 / 고난',   'name_en': 'Cross / Suffering',         'order': 9},
            {'key': 'resurrection', 'name_ko': '부활',            'name_en': 'Resurrection',              'order': 10},
            {'key': 'judgment',     'name_ko': '심판',            'name_en': 'Judgment',                  'order': 11},
            {'key': 'forgiveness',  'name_ko': '용서',            'name_en': 'Forgiveness',               'order': 12},
            {'key': 'healing',      'name_ko': '치유 / 기적',     'name_en': 'Healing / Miracle',         'order': 13},
            {'key': 'identity',     'name_ko': '예수님의 정체',   'name_en': 'Identity of Jesus',         'order': 14},
        ]
        theme_map = {}
        for t in THEMES:
            if not self.dry_run:
                obj, _ = Theme.objects.get_or_create(
                    key=t['key'],
                    defaults={k: v for k, v in t.items() if k != 'key'},
                )
            else:
                try:
                    obj = Theme.objects.get(key=t['key'])
                except Theme.DoesNotExist:
                    obj = Theme(key=t['key'], name_ko=t['name_ko'])
            theme_map[t['key']] = obj
        return theme_map

    # ── 파일 로드 ─────────────────────────────────────────────────
    def _load_file(self, fpath, book_code, theme_map, skip_parallel=False):
        book_name = BOOK_NAMES.get(book_code, book_code)
        self.stdout.write(f'\n📖 {book_name}  ({fpath.name})')

        try:
            with open(fpath, encoding='utf-8') as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            raise CommandError(f'JSON 파싱 실패 ({fpath}): {e}')

        if not isinstance(data, list):
            raise CommandError(f'JSON 루트가 배열이어야 합니다: {fpath}')

        created = updated = skipped = 0
        parallel_pending = {}   # group_name → [JesusSaying]

        with transaction.atomic():
            for idx, item in enumerate(data, 1):
                result, saying = self._upsert_saying(item, theme_map, book_code)
                if result == 'created':
                    created += 1
                    marker = '✨'
                elif result == 'updated':
                    updated += 1
                    marker = '♻️ '
                else:
                    skipped += 1
                    marker = '─'

                ref = f"{book_name} {item.get('chapter')}:{item.get('verse_start')}"
                self.stdout.write(f'  {marker} [{idx:>3}] {ref}')

                # 병행구절 수집
                if not skip_parallel and saying and item.get('parallel_groups'):
                    for grp_name in item['parallel_groups']:
                        if grp_name:
                            parallel_pending.setdefault(grp_name, []).append(saying)

            # 병행구절 그룹 처리
            if not skip_parallel:
                self._sync_parallel_groups(parallel_pending)

        return created, updated, skipped

    # ── 단일 말씀 upsert ──────────────────────────────────────────
    def _upsert_saying(self, item, theme_map, default_book):
        """(result, JesusSaying) 반환. result: 'created'|'updated'|'skipped'"""

        # 필수 필드 검증
        required = ['chapter', 'verse_start', 'text_ko_krv']
        for field in required:
            if not item.get(field):
                self.stdout.write(
                    self.style.ERROR(f'  ⛔ 필수 필드 누락: {field} — {item}')
                )
                return 'skipped', None

        book = item.get('book', default_book)

        # 기존 말씀 조회
        try:
            saying = JesusSaying.objects.get(
                book=book,
                chapter=item['chapter'],
                verse_start=item['verse_start'],
            )
            if not self.update:
                return 'skipped', saying

            # 업데이트
            if not self.dry_run:
                self._apply_fields(saying, item)
                saying.save()
                self._apply_themes(saying, item.get('themes', []), theme_map)
            return 'updated', saying

        except JesusSaying.DoesNotExist:
            # 신규 생성
            if self.dry_run:
                saying = JesusSaying(book=book, chapter=item['chapter'], verse_start=item['verse_start'])
                return 'created', saying

            saying = JesusSaying(book=book)
            self._apply_fields(saying, item)
            saying.save()
            self._apply_themes(saying, item.get('themes', []), theme_map)
            return 'created', saying

    # ── 필드 적용 ─────────────────────────────────────────────────
    def _apply_fields(self, saying, item):
        """item dict → JesusSaying 필드 적용"""
        field_map = {
            'chapter':     'chapter',
            'verse_start': 'verse_start',
            'verse_end':   'verse_end',
            'size':        'size',
            'text_ko_krv': 'text_ko_krv',
            'text_ko_new': 'text_ko_new',
            'text_en':     'text_en',
            'text_de':     'text_de',
            'text_zh':     'text_zh',
            'text_es':     'text_es',
            'context_ko':  'context_ko',
            'context_en':  'context_en',
            'keywords':    'keywords',
            'audience':    'audience',
            'occasion':    'occasion',
            'season':      'season',
            'slide_cycle': 'slide_cycle',
            'slide_order': 'slide_order',
            'is_active':   'is_active',
        }
        for src, dst in field_map.items():
            if src in item:
                setattr(saying, dst, item[src])

        # verse_end 기본값: verse_start
        if not saying.verse_end:
            saying.verse_end = saying.verse_start

    # ── 주제 연결 ─────────────────────────────────────────────────
    def _apply_themes(self, saying, theme_keys, theme_map):
        for key in theme_keys:
            theme = theme_map.get(key)
            if theme:
                saying.themes.add(theme)
            else:
                self.stdout.write(
                    self.style.WARNING(f'    ⚠  알 수 없는 주제: {key}')
                )

    # ── 병행구절 그룹 처리 ────────────────────────────────────────
    def _sync_parallel_groups(self, pending: dict):
        """pending: {group_name: [JesusSaying, ...]}"""
        if not pending:
            return
        self.stdout.write(f'\n  🔗 병행구절 그룹 처리 ({len(pending)}개)')
        for name, sayings in pending.items():
            group, created = ParallelGroup.objects.get_or_create(name=name)
            for s in sayings:
                group.sayings.add(s)
            status = '생성' if created else '연결'
            self.stdout.write(f'    [{status}] {name} → {len(sayings)}개 말씀')