from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from django.conf import settings
from django.conf.urls.static import static


# 환경변수에서 Admin URL 가져오기
ADMIN_URL = os.getenv('ADMIN_URL', 'admin')

# Admin 사이트 커스터마이징
admin.site.site_header = "설교 번역 관리자"
admin.site.site_title = "설교 번역 Admin"
admin.site.index_title = "관리 대시보드"

urlpatterns = [
    # 환경변수를 사용한 동적 Admin URL
    path(f'{ADMIN_URL}/', admin.site.urls),
    
    # Auth endpoints (registration)
    path('api/auth/', include('accounts.urls')),  # ✅ 추가 This makes /api/auth/register/ available

    # 🔹 board 앱 API 라우팅
    path('api/board/', include('board.urls')),

    # Sermons API (추가)
    path('api/sermons/', include('sermons.urls')),

    # JWT 토큰 엔드포인트
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]

# Static 및 Media 파일 서빙
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)