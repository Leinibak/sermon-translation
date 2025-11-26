# backend/bible_verses/views.py
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.utils import timezone
from datetime import date
import random

from .models import BibleVerse
from .serializers import BibleVerseSerializer

class BibleVerseViewSet(viewsets.ReadOnlyModelViewSet):
    """성경 구절 API"""
    queryset = BibleVerse.objects.filter(is_active=True)
    serializer_class = BibleVerseSerializer
    permission_classes = [AllowAny]
    
    @action(detail=False, methods=['get'])
    def daily(self, request):
        """
        매일 랜덤하게 3개의 구절 반환
        같은 날짜에는 항상 같은 구절 조합
        """
        # 활성화된 구절들
        verses = list(self.queryset.all())
        
        if len(verses) < 3:
            # 구절이 3개 미만이면 있는 것만 반환
            serializer = self.get_serializer(verses, many=True)
            return Response(serializer.data)
        
        # 오늘 날짜를 시드로 사용 (매일 같은 조합)
        today = date.today()
        seed = int(today.strftime('%Y%m%d'))
        random.seed(seed)
        
        # 우선순위 가중치를 적용한 랜덤 선택
        # 우선순위가 낮을수록(숫자가 작을수록) 선택될 확률이 높음
        weights = [11 - min(verse.priority, 10) for verse in verses]
        
        # 3개 선택 (중복 없이)
        selected_verses = random.choices(
            verses,
            weights=weights,
            k=min(3, len(verses))
        )
        
        # 혹시 중복이 있으면 제거하고 다시 선택
        unique_verses = []
        used_ids = set()
        for verse in selected_verses:
            if verse.id not in used_ids:
                unique_verses.append(verse)
                used_ids.add(verse.id)
        
        # 3개가 안 되면 추가 선택
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