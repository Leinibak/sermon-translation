# backend/sermons/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SermonViewSet

router = DefaultRouter()
router.register(r'', SermonViewSet, basename='sermon')

urlpatterns = [
    path('', include(router.urls)),
]

# 생성되는 URL 패턴:
# GET    /api/sermons/                          - 설교 목록
# POST   /api/sermons/                          - 설교 생성 (관리자만)
# GET    /api/sermons/{id}/                     - 설교 상세
# PUT    /api/sermons/{id}/                     - 설교 수정 (관리자만)
# DELETE /api/sermons/{id}/                     - 설교 삭제 (관리자만)
# GET    /api/sermons/categories/               - 카테고리 목록
# GET    /api/sermons/bible_books/              - 성경 목록
# GET    /api/sermons/recent/                   - 최근 설교
# GET    /api/sermons/popular/                  - 인기 설교
# GET    /api/sermons/{id}/download_audio/      - 오디오 다운로드
# GET    /api/sermons/{id}/download_original_pdf/  - 원본 PDF 다운로드
# GET    /api/sermons/{id}/download_translated_pdf/ - 번역 PDF 다운로드