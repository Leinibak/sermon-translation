# backend/bible_verses/views.py

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from datetime import date
import random

from .models import BibleVerse, Theme, JesusSaying, ParallelGroup, Meditation
from .serializers import (
    BibleVerseSerializer,
    ThemeSerializer,
    JesusSayingListSerializer,
    JesusSayingDetailSerializer,
    JesusSayingSlideSerializer,
    ParallelGroupSerializer,
    MeditationSerializer,
)


# ============================================================
# 기존 뷰 — 절대 수정하지 않음
# ============================================================

class BibleVerseViewSet(viewsets.ReadOnlyModelViewSet):
    """성경 구절 API (기존 슬라이드용)"""
    queryset           = BibleVerse.objects.filter(is_active=True)
    serializer_class   = BibleVerseSerializer
    permission_classes = [AllowAny]

    @action(detail=False, methods=['get'])
    def daily(self, request):
        """매일 랜덤하게 3개의 구절 반환 — 같은 날짜에는 항상 같은 조합"""
        verses = list(self.queryset.all())

        if len(verses) < 3:
            serializer = self.get_serializer(verses, many=True)
            return Response(serializer.data)

        today  = date.today()
        seed   = int(today.strftime('%Y%m%d'))
        random.seed(seed)

        weights        = [11 - min(verse.priority, 10) for verse in verses]
        selected_verses = random.choices(verses, weights=weights, k=min(3, len(verses)))

        unique_verses = []
        used_ids      = set()
        for verse in selected_verses:
            if verse.id not in used_ids:
                unique_verses.append(verse)
                used_ids.add(verse.id)

        while len(unique_verses) < 3 and len(used_ids) < len(verses):
            remaining = [v for v in verses if v.id not in used_ids]
            if remaining:
                verse = random.choice(remaining)
                unique_verses.append(verse)
                used_ids.add(verse.id)
            else:
                break

        serializer = self.get_serializer(unique_verses, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def categories(self, request):
        """카테고리 목록 반환"""
        categories = [
            {'value': choice[0], 'label': choice[1]}
            for choice in BibleVerse.CATEGORY_CHOICES
        ]
        return Response(categories)


# ============================================================
# 신규 뷰 — 주님의 음성
# ============================================================

class ThemeViewSet(viewsets.ReadOnlyModelViewSet):
    """주제 태그 API
    GET /api/sayings/themes/              — 전체 주제 목록 (말씀 수 포함)
    GET /api/sayings/themes/{key}/        — 주제 상세
    GET /api/sayings/themes/{key}/sayings/ — 해당 주제 말씀 목록
    """
    queryset           = Theme.objects.all()
    serializer_class   = ThemeSerializer
    permission_classes = [AllowAny]
    lookup_field       = 'key'

    @action(detail=True, methods=['get'])
    def sayings(self, request, key=None):
        theme = self.get_object()
        qs    = theme.sayings.filter(is_active=True)
        serializer = JesusSayingListSerializer(qs, many=True)
        return Response(serializer.data)


class JesusSayingViewSet(viewsets.ReadOnlyModelViewSet):
    """예수님 말씀 API
    GET /api/sayings/                    — 전체 목록 (필터/검색 가능)
    GET /api/sayings/{id}/               — 상세 (병행구절·관련말씀 포함)
    GET /api/sayings/slide/              — 홈 슬라이드용 오늘의 3개 말씀
    GET /api/sayings/books/              — 복음서별 말씀 수 통계
    """
    queryset           = JesusSaying.objects.filter(is_active=True).prefetch_related('themes')
    permission_classes = [AllowAny]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    # 필터 필드
    filterset_fields = {
        'book':     ['exact'],           # ?book=JHN
        'chapter':  ['exact'],           # ?chapter=3
        'size':     ['exact'],           # ?size=S
        'audience': ['exact'],           # ?audience=disciples
        'season':   ['exact'],           # ?season=easter
        'themes__key': ['exact'],        # ?themes__key=i_am
    }

    # 키워드 검색
    search_fields = ['text_ko_krv', 'text_ko_new', 'occasion', 'context_ko']

    # 정렬
    ordering_fields  = ['book', 'chapter', 'verse_start', 'slide_order']
    ordering         = ['book', 'chapter', 'verse_start']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return JesusSayingDetailSerializer
        if self.action == 'slide':
            return JesusSayingSlideSerializer
        return JesusSayingListSerializer

    # ── 홈 슬라이드: 오늘의 말씀 3개 ─────────────────────────
    @action(detail=False, methods=['get'], url_path='slide')
    def slide(self, request):
        """
        날짜 기반으로 매일 3개 말씀을 고정 반환.
        절기(season)가 오늘 날짜와 맞으면 우선 선택.
        """
        today       = date.today()
        day_of_year = today.timetuple().tm_yday   # 1~365
        seed        = int(today.strftime('%Y%m%d'))

        # 오늘 절기 계산 (간략 버전 — 추후 정교화 가능)
        season = _get_current_season(today)

        qs = JesusSaying.objects.filter(is_active=True).prefetch_related('themes')

        # 절기 말씀 우선
        season_qs = qs.filter(season=season)
        other_qs  = qs.exclude(season=season)

        season_list = list(season_qs)
        other_list  = list(other_qs)

        random.seed(seed)

        selected = []
        used_ids = set()

        # 절기 말씀에서 최대 2개
        if season_list:
            picks = random.sample(season_list, min(2, len(season_list)))
            for p in picks:
                selected.append(p)
                used_ids.add(p.id)

        # 나머지를 평시 말씀에서 채움
        remaining_needed = 3 - len(selected)
        if remaining_needed > 0 and other_list:
            available = [s for s in other_list if s.id not in used_ids]
            if available:
                picks = random.sample(available, min(remaining_needed, len(available)))
                selected.extend(picks)

        # 3개 미만이면 전체에서 다시 채움
        if len(selected) < 3:
            all_list  = list(qs)
            available = [s for s in all_list if s.id not in used_ids]
            if available:
                picks = random.sample(available, min(3 - len(selected), len(available)))
                selected.extend(picks)

        serializer = self.get_serializer(selected[:3], many=True)
        return Response(serializer.data)

    # ── 복음서별 통계 ─────────────────────────────────────────
    @action(detail=False, methods=['get'], url_path='books')
    def books(self, request):
        """복음서별 말씀 수 반환"""
        from django.db.models import Count
        stats = (
            JesusSaying.objects
            .filter(is_active=True)
            .values('book')
            .annotate(count=Count('id'))
            .order_by('book')
        )
        book_display = dict(JesusSaying.BOOK_CHOICES)
        result = [
            {
                'book':         s['book'],
                'book_display': book_display.get(s['book'], ''),
                'count':        s['count'],
            }
            for s in stats
        ]
        return Response(result)

 
    # ── 복음서별 장 요약 (pagination 없이 전체 반환) ─────────────
    @action(detail=False, methods=['get'], url_path='chapter-summary')
    def chapter_summary(self, request):
        """
        특정 복음서의 '장별 말씀 수'를 페이지네이션 없이 한 번에 반환.
        BibleExplorer 장 마킹용.
 
        GET /api/sayings/chapter-summary/?book=JHN
        → { "1": 2, "3": 3, "14": 4, ... }
        """
        from django.db.models import Count
 
        book = request.query_params.get('book')
        if not book:
            return Response({'detail': 'book 파라미터가 필요합니다.'}, status=400)
 
        stats = (
            JesusSaying.objects
            .filter(is_active=True, book=book)
            .values('chapter')
            .annotate(count=Count('id'))
            .order_by('chapter')
        )
        # { "1": 2, "3": 3, ... } 형태로 반환 — 프론트 chSummary와 동일한 구조
        result = {str(s['chapter']): s['count'] for s in stats}
        return Response(result)
 

class ParallelGroupViewSet(viewsets.ReadOnlyModelViewSet):
    """병행구절 그룹 API
    GET /api/sayings/parallels/           — 전체 그룹 목록 (이름만)
    GET /api/sayings/parallels/{id}/      — 그룹 상세 (4복음서 나란히)
    """
    queryset           = ParallelGroup.objects.prefetch_related('sayings').all()
    serializer_class   = ParallelGroupSerializer
    permission_classes = [AllowAny]


class MeditationViewSet(viewsets.ModelViewSet):
    """개인 묵상 노트 API — 로그인 필요
    GET    /api/sayings/meditations/      — 내 묵상 목록
    POST   /api/sayings/meditations/      — 묵상 작성
    GET    /api/sayings/meditations/{id}/ — 묵상 상세
    PUT    /api/sayings/meditations/{id}/ — 묵상 수정
    DELETE /api/sayings/meditations/{id}/ — 묵상 삭제
    """
    serializer_class   = MeditationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # 본인 묵상만 반환
        return Meditation.objects.filter(user=self.request.user).select_related('saying')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    # 특정 말씀에 달린 내 묵상 조회
    @action(detail=False, methods=['get'], url_path='by-saying/(?P<saying_id>[0-9]+)')
    def by_saying(self, request, saying_id=None):
        qs = self.get_queryset().filter(saying_id=saying_id)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


# ============================================================
# 유틸: 날짜 → 절기 계산
# ============================================================

def _get_current_season(today: date) -> str:
    """간단한 절기 계산 (그레고리력 기준 고정값)"""
    m, d = today.month, today.day

    if (m == 11 and d >= 27) or m == 12:
        return 'advent'
    if m == 12 and d >= 25 or (m == 1 and d <= 6):
        return 'christmas'
    if (m == 2 and d >= 14) or (m == 3) or (m == 4 and d <= 13):
        return 'lent'
    if (m == 4 and d >= 14 and d <= 30) or (m == 5 and d <= 25):
        return 'easter'
    if (m == 5 and d >= 26) or (m == 6 and d <= 15):
        return 'pentecost'
    return 'ordinary'