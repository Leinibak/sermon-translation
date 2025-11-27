# backend/config/urls.py (업데이트)
from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # Auth endpoints
    path('api/auth/', include('accounts.urls')),

    # Board API
    path('api/board/', include('board.urls')),

    # Sermons API
    path('api/sermons/', include('sermons.urls')),

    # Bible Verses API
    path('api/bible-verses/', include('bible_verses.urls')),

    # ✅ Pastoral Letters API
    path('api/pastoral-letters/', include('pastoral_letters.urls')),

    # JWT 토큰 엔드포인트
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]

# Static 및 Media 파일 서빙
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)