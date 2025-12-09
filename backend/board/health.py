# backend/api/health.py
# 헬스체크 엔드포인트

from django.http import JsonResponse
from django.db import connection
from django.core.cache import cache
import redis
from django.conf import settings

def health_check(request):
    """
    헬스체크 엔드포인트
    GET /api/health/
    """
    health_status = {
        'status': 'healthy',
        'checks': {}
    }
    
    # 1. 데이터베이스 연결 확인
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        health_status['checks']['database'] = 'ok'
    except Exception as e:
        health_status['status'] = 'unhealthy'
        health_status['checks']['database'] = f'error: {str(e)}'
    
    # 2. Redis 연결 확인
    try:
        cache.set('health_check', 'ok', 10)
        result = cache.get('health_check')
        if result == 'ok':
            health_status['checks']['redis'] = 'ok'
        else:
            health_status['status'] = 'unhealthy'
            health_status['checks']['redis'] = 'error: cache test failed'
    except Exception as e:
        health_status['status'] = 'unhealthy'
        health_status['checks']['redis'] = f'error: {str(e)}'
    
    # 3. WebSocket Redis 연결 확인 (Channels)
    try:
        redis_host = getattr(settings, 'REDIS_HOST', 'redis')
        redis_port = getattr(settings, 'REDIS_PORT', 6379)
        r = redis.Redis(host=redis_host, port=redis_port, db=0)
        r.ping()
        health_status['checks']['websocket_redis'] = 'ok'
    except Exception as e:
        health_status['status'] = 'unhealthy'
        health_status['checks']['websocket_redis'] = f'error: {str(e)}'
    
    status_code = 200 if health_status['status'] == 'healthy' else 503
    
    return JsonResponse(health_status, status=status_code)


# backend/api/urls.py에 추가:
# from .health import health_check
# 
# urlpatterns = [
#     path('health/', health_check, name='health_check'),
#     # ... 기타 URL 패턴
# ]