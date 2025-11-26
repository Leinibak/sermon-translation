# backend/bible_verses/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BibleVerseViewSet

router = DefaultRouter()
router.register(r'', BibleVerseViewSet, basename='bible-verse')

urlpatterns = [
    path('', include(router.urls)),
]

# 생성되는 URL:
# GET /api/bible-verses/          - 전체 구절 목록
# GET /api/bible-verses/daily/    - 매일 3개 랜덤 구절
# GET /api/bible-verses/categories/ - 카테고리 목록