# backend/pastoral_letters/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PastoralLetterViewSet

router = DefaultRouter()
router.register(r'', PastoralLetterViewSet, basename='pastoral-letter')

urlpatterns = [
    path('', include(router.urls)),
]

# 생성되는 URL 패턴:
# GET    /api/pastoral-letters/                     - 목회서신 목록
# POST   /api/pastoral-letters/                     - 목회서신 생성 (관리자만)
# GET    /api/pastoral-letters/{id}/                - 목회서신 상세
# PUT    /api/pastoral-letters/{id}/                - 목회서신 수정 (관리자만)
# DELETE /api/pastoral-letters/{id}/                - 목회서신 삭제 (관리자만)
# GET    /api/pastoral-letters/recent/              - 최근 목회서신
# GET    /api/pastoral-letters/{id}/download_pdf/   - PDF 다운로드