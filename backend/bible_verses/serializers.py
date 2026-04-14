# backend/bible_verses/serializers.py

from rest_framework import serializers
from .models import BibleVerse, Theme, JesusSaying, ParallelGroup, Meditation


# ============================================================
# 기존 시리얼라이저 — 절대 수정하지 않음
# ============================================================

class BibleVerseSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(
        source='get_category_display',
        read_only=True
    )

    class Meta:
        model  = BibleVerse
        fields = [
            'id', 'category', 'category_display',
            'reference_kr', 'reference_de',
            'text_kr', 'text_de',
            'priority'
        ]


# ============================================================
# 신규 시리얼라이저 — 주님의 음성
# ============================================================

class ThemeSerializer(serializers.ModelSerializer):
    """주제 태그"""
    saying_count = serializers.SerializerMethodField()

    class Meta:
        model  = Theme
        fields = ['key', 'name_ko', 'name_en', 'name_de', 'order', 'saying_count']

    def get_saying_count(self, obj):
        return obj.sayings.filter(is_active=True).count()


# ── 목록용 (가벼운 버전) ─────────────────────────────────────
class JesusSayingListSerializer(serializers.ModelSerializer):
    """말씀 목록 카드용 — 필드 최소화"""
    book_display    = serializers.CharField(source='get_book_display', read_only=True)
    size_display    = serializers.CharField(source='get_size_display', read_only=True)
    audience_display = serializers.CharField(source='get_audience_display', read_only=True)
    season_display  = serializers.CharField(source='get_season_display', read_only=True)
    themes          = ThemeSerializer(many=True, read_only=True)
    reference       = serializers.CharField(read_only=True)  # property 사용
    has_parallel    = serializers.SerializerMethodField()

    class Meta:
        model  = JesusSaying
        fields = [
            'id', 'book', 'book_display',
            'chapter', 'verse_start', 'verse_end',
            'reference', 'size', 'size_display',
            'text_ko_krv', 'text_ko_new',
            'themes', 'audience', 'audience_display',
            'occasion', 'season', 'season_display',
            'has_parallel',
        ]

    def get_has_parallel(self, obj):
        return obj.parallel_groups.exists()


# ── 상세용 (풀 버전) ─────────────────────────────────────────
class JesusSayingDetailSerializer(serializers.ModelSerializer):
    """말씀 상세 페이지용 — 병행구절·키워드·관련말씀 포함"""
    book_display     = serializers.CharField(source='get_book_display', read_only=True)
    size_display     = serializers.CharField(source='get_size_display', read_only=True)
    audience_display = serializers.CharField(source='get_audience_display', read_only=True)
    season_display   = serializers.CharField(source='get_season_display', read_only=True)
    themes           = ThemeSerializer(many=True, read_only=True)
    reference        = serializers.CharField(read_only=True)
    parallels        = serializers.SerializerMethodField()
    related_sayings  = serializers.SerializerMethodField()

    class Meta:
        model  = JesusSaying
        fields = [
            'id', 'book', 'book_display',
            'chapter', 'verse_start', 'verse_end',
            'reference', 'size', 'size_display',
            # 번역본
            'text_ko_krv', 'text_ko_new',
            'text_en', 'text_de', 'text_zh', 'text_es',
            # 배경·키워드
            'context_ko', 'context_en', 'keywords',
            # 분류
            'themes', 'audience', 'audience_display',
            'occasion', 'season', 'season_display',
            # 연결 데이터
            'parallels', 'related_sayings',
        ]

    def get_parallels(self, obj):
        """같은 사건의 다른 복음서 말씀 반환 (4복음서 구조로)"""
        groups = obj.parallel_groups.prefetch_related('sayings').all()
        if not groups.exists():
            return []

        result = []
        for group in groups:
            # 현재 말씀을 제외한 병행 말씀들
            others = group.sayings.exclude(id=obj.id).filter(is_active=True)
            for other in others:
                result.append({
                    'id':           other.id,
                    'book':         other.book,
                    'book_display': other.get_book_display(),
                    'reference':    other.reference,
                    'text_ko_krv':  other.text_ko_krv,
                    'group_name':   group.name,
                })
        return result

    def get_related_sayings(self, obj):
        """같은 주제 태그를 가진 말씀 최대 4개 (자기 자신 제외)"""
        theme_ids = obj.themes.values_list('id', flat=True)
        if not theme_ids:
            return []

        related = (
            JesusSaying.objects
            .filter(themes__in=theme_ids, is_active=True)
            .exclude(id=obj.id)
            .distinct()[:4]
        )
        return [
            {
                'id':          s.id,
                'reference':   s.reference,
                'text_ko_krv': s.text_ko_krv[:60] + '…' if len(s.text_ko_krv) > 60 else s.text_ko_krv,
            }
            for s in related
        ]


# ── 슬라이드용 (홈 화면 3개) ─────────────────────────────────
class JesusSayingSlideSerializer(serializers.ModelSerializer):
    """홈 슬라이드용 — 본문 + 배경 + 키워드만"""
    book_display = serializers.CharField(source='get_book_display', read_only=True)
    season_display = serializers.CharField(source='get_season_display', read_only=True)
    themes       = ThemeSerializer(many=True, read_only=True)
    reference    = serializers.CharField(read_only=True)

    class Meta:
        model  = JesusSaying
        fields = [
            'id', 'book', 'book_display', 'reference',
            'text_ko_krv', 'text_ko_new',
            'context_ko', 'keywords',
            'themes', 'occasion', 'season_display',
            'slide_order',
        ]


# ── 병행구절 그룹 ────────────────────────────────────────────
class ParallelGroupSerializer(serializers.ModelSerializer):
    """병행구절 비교 페이지용"""
    sayings = serializers.SerializerMethodField()

    class Meta:
        model  = ParallelGroup
        fields = ['id', 'name', 'sayings']

    def get_sayings(self, obj):
        """4복음서 순서로 정렬해서 반환. 없는 복음서는 None"""
        book_order = ['MAT', 'MRK', 'LUK', 'JHN']
        saying_map = {s.book: s for s in obj.sayings.filter(is_active=True)}
        result = []
        for book in book_order:
            s = saying_map.get(book)
            if s:
                result.append({
                    'book':         s.book,
                    'book_display': s.get_book_display(),
                    'id':           s.id,
                    'reference':    s.reference,
                    'text_ko_krv':  s.text_ko_krv,
                    'text_ko_new':  s.text_ko_new,
                })
            else:
                result.append({
                    'book':         book,
                    'book_display': dict(JesusSaying.BOOK_CHOICES).get(book, ''),
                    'id':           None,
                    'reference':    None,
                    'text_ko_krv':  None,
                    'text_ko_new':  None,
                })
        return result


# ── 묵상 노트 ────────────────────────────────────────────────
class MeditationSerializer(serializers.ModelSerializer):
    """묵상 노트 CRUD"""
    username      = serializers.CharField(source='user.username', read_only=True)
    saying_ref    = serializers.CharField(source='saying.reference', read_only=True)
    saying_text   = serializers.CharField(source='saying.text_ko_krv', read_only=True)

    class Meta:
        model  = Meditation
        fields = [
            'id', 'saying', 'saying_ref', 'saying_text',
            'username', 'content', 'is_private',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'username', 'saying_ref', 'saying_text',
                            'created_at', 'updated_at']