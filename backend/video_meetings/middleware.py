# backend/video_meetings/middleware.py (새로 생성)
from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import TokenError
from urllib.parse import parse_qs
import logging

logger = logging.getLogger(__name__)
User = get_user_model()

@database_sync_to_async
def get_user_from_token(token_key):
    """토큰으로부터 사용자 가져오기"""
    try:
        access_token = AccessToken(token_key)
        user_id = access_token['user_id']
        user = User.objects.get(id=user_id)
        logger.info(f"✅ JWT 인증 성공: {user.username}")
        return user
    except TokenError as e:
        logger.warning(f"⚠️ JWT 토큰 오류: {e}")
        return AnonymousUser()
    except User.DoesNotExist:
        logger.warning(f"⚠️ 사용자 없음: {user_id}")
        return AnonymousUser()
    except Exception as e:
        logger.error(f"❌ 인증 오류: {e}")
        return AnonymousUser()

class JWTAuthMiddleware(BaseMiddleware):
    """WebSocket JWT 인증 Middleware"""
    
    async def __call__(self, scope, receive, send):
        # Query string에서 토큰 추출
        query_string = scope.get('query_string', b'').decode()
        query_params = parse_qs(query_string)
        token = query_params.get('token', [None])[0]
        
        # 헤더에서 토큰 추출 (대안)
        if not token:
            headers = dict(scope.get('headers', []))
            auth_header = headers.get(b'authorization', b'').decode()
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]
        
        if token:
            scope['user'] = await get_user_from_token(token)
            logger.info(f"🔐 WebSocket 인증: {scope['user']}")
        else:
            logger.warning("⚠️ 토큰 없음 - 세션 인증 시도")
            # 세션 인증은 AuthMiddlewareStack이 처리
        
        return await super().__call__(scope, receive, send)