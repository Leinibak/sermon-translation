# ============================================
# backend/board/urls.py (댓글 URL 포함)
# ============================================
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PostViewSet
from .health import health_check  # board/health.py에서 함수 가져오기

router = DefaultRouter()
router.register(r'posts', PostViewSet, basename='post')

urlpatterns = [
    path('', include(router.urls)),
    path('health/', health_check, name='health_check'),
]

# 생성되는 URL 패턴:
# GET    /api/board/posts/                    - 게시글 목록
# POST   /api/board/posts/                    - 게시글 작성
# GET    /api/board/posts/{id}/               - 게시글 상세
# PUT    /api/board/posts/{id}/               - 게시글 수정
# DELETE /api/board/posts/{id}/               - 게시글 삭제
# GET    /api/board/posts/{id}/comments/      - 댓글 목록
# POST   /api/board/posts/{id}/comments/      - 댓글 작성
# DELETE /api/board/posts/{id}/comments/{cid}/ - 댓글 삭제