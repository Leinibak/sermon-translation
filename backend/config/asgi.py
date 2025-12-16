# backend/config/asgi.py (수정 버전)
import os
from django.core.asgi import get_asgi_application

# ⭐⭐⭐ 1. Django 설정 먼저 설정
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# ⭐⭐⭐ 2. Django ASGI application 초기화 (Django setup 포함)
django_asgi_app = get_asgi_application()

# ⭐⭐⭐ 3. Django 초기화 이후에 다른 모듈 임포트
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator
import video_meetings.routing
from video_meetings.middleware import JWTAuthMiddleware

# ⭐⭐⭐ 4. ASGI 라우팅 설정
application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AllowedHostsOriginValidator(
        JWTAuthMiddleware(
            AuthMiddlewareStack(
                URLRouter(
                    video_meetings.routing.websocket_urlpatterns
                )
            )
        )
    ),
})