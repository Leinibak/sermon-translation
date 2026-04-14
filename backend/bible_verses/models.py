# backend/bible_verses/models.py

from django.db import models
from django.conf import settings


# ============================================================
# 기존 모델 — 절대 수정하지 않음
# ============================================================

class BibleVerse(models.Model):
    """매일 표시할 성경 구절 (기존 슬라이드용, 유지)"""

    CATEGORY_CHOICES = [
        ('obedience', '순종'),
        ('faith', '믿음'),
        ('love', '사랑'),
        ('repentance', '회개'),
        ('comfort', '위로'),
        ('peace', '평안'),
        ('prayer', '기도'),
        ('acceptance', '영접'),
        ('hope', '소망'),
        ('grace', '은혜'),
        ('forgiveness', '용서'),
        ('wisdom', '지혜'),
        ('courage', '용기'),
        ('thanksgiving', '감사'),
    ]

    category    = models.CharField(max_length=20, choices=CATEGORY_CHOICES, verbose_name='카테고리')
    reference_kr = models.CharField(max_length=100, verbose_name='성경 참조 (한글)')
    reference_de = models.CharField(max_length=100, verbose_name='성경 참조 (독일어)')
    text_kr     = models.TextField(verbose_name='한글 구절 (개역개정)')
    text_de     = models.TextField(verbose_name='독일어 구절 (Schlachter 2000)')
    is_active   = models.BooleanField(default=True, verbose_name='활성화')
    priority    = models.IntegerField(default=1, verbose_name='우선순위',
                                      help_text='1-10 (낮을수록 자주 표시됨)')
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['priority', 'category']
        verbose_name = '성경 구절'
        verbose_name_plural = '성경 구절 목록'

    def __str__(self):
        return f'{self.get_category_display()} - {self.reference_kr}'


# ============================================================
# 신규 모델 — 주님의 음성 (Jesus Sayings)
# ============================================================

class Theme(models.Model):
    """말씀 주제 태그"""

    THEME_CHOICES = [
        ('i_am',        '나는 ~이다 선언'),
        ('salvation',   '영생 / 구원'),
        ('kingdom',     '하나님 나라'),
        ('love',        '사랑 / 계명'),
        ('prayer',      '기도'),
        ('faith',       '믿음'),
        ('holy_spirit', '성령'),
        ('discipleship','제자도'),
        ('cross',       '십자가 / 고난'),
        ('resurrection','부활'),
        ('judgment',    '심판'),
        ('forgiveness', '용서'),
        ('healing',     '치유 / 기적'),
        ('identity',    '예수님의 정체'),
    ]

    key      = models.CharField(max_length=30, unique=True,
                                choices=THEME_CHOICES, verbose_name='주제 키')
    name_ko  = models.CharField(max_length=50, verbose_name='한국어 이름')
    name_en  = models.CharField(max_length=50, blank=True, verbose_name='영어 이름')
    name_de  = models.CharField(max_length=50, blank=True, verbose_name='독일어 이름')
    order    = models.PositiveSmallIntegerField(default=0, verbose_name='정렬 순서')

    class Meta:
        ordering = ['order', 'key']
        verbose_name = '주제'
        verbose_name_plural = '주제 목록'

    def __str__(self):
        return self.name_ko


class JesusSaying(models.Model):
    """예수님이 직접 하신 말씀 — 복음서 4권"""

    # ── 복음서 ──────────────────────────────────────────────
    BOOK_CHOICES = [
        ('MAT', '마태복음'),
        ('MRK', '마가복음'),
        ('LUK', '누가복음'),
        ('JHN', '요한복음'),
    ]

    # ── 말씀 크기 (S/M/L) ───────────────────────────────────
    SIZE_CHOICES = [
        ('S', '단문 (1~2절)'),
        ('M', '중문 (3~8절)'),
        ('L', '장문 (9절 이상)'),
    ]

    # ── 청중 ────────────────────────────────────────────────
    AUDIENCE_CHOICES = [
        ('disciples',  '제자들'),
        ('pharisees',  '바리새인 / 서기관'),
        ('crowd',      '무리'),
        ('individual', '개인'),
        ('prayer',     '기도 (아버지께)'),
        ('mixed',      '혼합'),
    ]

    # ── 절기 ────────────────────────────────────────────────
    SEASON_CHOICES = [
        ('advent',     '대강절 (12월)'),
        ('christmas',  '성탄절'),
        ('lent',       '사순절 (2~3월)'),
        ('easter',     '부활절'),
        ('pentecost',  '성령강림절'),
        ('ordinary',   '평시'),
    ]

    # ── 구절 식별 ────────────────────────────────────────────
    book         = models.CharField(max_length=3, choices=BOOK_CHOICES, verbose_name='복음서')
    chapter      = models.PositiveSmallIntegerField(verbose_name='장')
    verse_start  = models.PositiveSmallIntegerField(verbose_name='시작 절')
    verse_end    = models.PositiveSmallIntegerField(verbose_name='끝 절')
    size         = models.CharField(max_length=1, choices=SIZE_CHOICES,
                                    default='M', verbose_name='말씀 크기')

    # ── 본문 (한국어 우선, 다국어 확장 준비) ─────────────────
    text_ko_krv  = models.TextField(verbose_name='개역개정')
    text_ko_new  = models.TextField(blank=True, verbose_name='새번역')
    text_en      = models.TextField(blank=True, verbose_name='영어 (NIV)')
    text_de      = models.TextField(blank=True, verbose_name='독일어 (Schlachter)')
    text_zh      = models.TextField(blank=True, verbose_name='중국어')
    text_es      = models.TextField(blank=True, verbose_name='스페인어')

    # ── 배경 설명 ────────────────────────────────────────────
    context_ko   = models.TextField(blank=True, verbose_name='배경 설명 (한국어)',
                                    help_text='말씀의 상황·배경을 2~4문장으로 설명')
    context_en   = models.TextField(blank=True, verbose_name='배경 설명 (영어)')

    # ── 핵심 단어 (JSON) ─────────────────────────────────────
    # 형식: [{"word": "생명", "original": "ζωή", "transliteration": "조에", "meaning": "영원한 신적 생명"}, ...]
    keywords     = models.JSONField(default=list, blank=True, verbose_name='핵심 단어',
                                    help_text='원어(헬라어/히브리어) 단어 설명 JSON 배열')

    # ── 분류 ────────────────────────────────────────────────
    themes       = models.ManyToManyField(Theme, related_name='sayings',
                                          blank=True, verbose_name='주제 태그')
    audience     = models.CharField(max_length=20, choices=AUDIENCE_CHOICES,
                                    default='mixed', verbose_name='청중')
    occasion     = models.CharField(max_length=100, blank=True, verbose_name='사건/상황',
                                    help_text='예: 산상수훈, 최후의 만찬, 나사로 사건')
    season       = models.CharField(max_length=20, choices=SEASON_CHOICES,
                                    default='ordinary', verbose_name='절기')

    # ── 슬라이드 순환 제어 ───────────────────────────────────
    # cycle=1: 1년차(절기 큐레이션), cycle=2: 2년차(복음서 순서)
    slide_cycle  = models.PositiveSmallIntegerField(default=1, verbose_name='슬라이드 사이클',
                                                    help_text='1 또는 2')
    slide_order  = models.PositiveIntegerField(default=0, verbose_name='슬라이드 순서',
                                               help_text='사이클 내 표시 순서')
    is_active    = models.BooleanField(default=True, verbose_name='활성화')

    # ── 메타 ────────────────────────────────────────────────
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        ordering  = ['book', 'chapter', 'verse_start']
        # 같은 복음서·장·시작절 중복 방지
        unique_together = ['book', 'chapter', 'verse_start']
        verbose_name = '예수님 말씀'
        verbose_name_plural = '예수님 말씀 목록'

    def __str__(self):
        return f'{self.get_book_display()} {self.chapter}:{self.verse_start} ({self.get_size_display()})'

    @property
    def reference(self):
        """예: 요한복음 14:6  또는  요한복음 14:1–4"""
        book = self.get_book_display()
        if self.verse_start == self.verse_end:
            return f'{book} {self.chapter}:{self.verse_start}'
        return f'{book} {self.chapter}:{self.verse_start}–{self.verse_end}'


class ParallelGroup(models.Model):
    """병행구절 그룹 — 같은 사건을 기록한 복음서들을 묶음"""

    name    = models.CharField(max_length=100, verbose_name='그룹 이름',
                               help_text='예: 주기도문, 베드로의 고백, 씨 뿌리는 비유')
    sayings = models.ManyToManyField(JesusSaying, related_name='parallel_groups',
                                     blank=True, verbose_name='병행 말씀들')
    order   = models.PositiveSmallIntegerField(default=0, verbose_name='정렬 순서')

    class Meta:
        ordering = ['order', 'name']
        verbose_name = '병행구절 그룹'
        verbose_name_plural = '병행구절 그룹 목록'

    def __str__(self):
        return self.name


class Meditation(models.Model):
    """개인 묵상 노트"""

    user       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                   related_name='meditations', verbose_name='작성자')
    saying     = models.ForeignKey(JesusSaying, on_delete=models.CASCADE,
                                   related_name='meditations', verbose_name='말씀')
    content    = models.TextField(verbose_name='묵상 내용')
    is_private = models.BooleanField(default=True, verbose_name='비공개',
                                     help_text='True: 본인만 / False: 그룹 공유')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = '묵상 노트'
        verbose_name_plural = '묵상 노트 목록'

    def __str__(self):
        return f'{self.user.username} — {self.saying.reference}'