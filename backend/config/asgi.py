# backend/config/asgi.py (수정 버전)
import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator
import video_meetings.routing
from video_meetings.middleware import JWTAuthMiddleware

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# Django ASGI application 초기화
django_asgi_app = get_asgi_application()

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AllowedHostsOriginValidator(
        JWTAuthMiddleware(  # ⭐ JWT Middleware 추가
            AuthMiddlewareStack(
                URLRouter(
                    video_meetings.routing.websocket_urlpatterns
                )
            )
        )
    ),
})