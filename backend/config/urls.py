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
    
    # Auth endpoints (registration)
    path('api/auth/', include('accounts.urls')),  # ✅ 추가 This makes /api/auth/register/ available

    # 🔹 board 앱 API 라우팅
    path('api/board/', include('board.urls')),

    # JWT 토큰 엔드포인트
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)