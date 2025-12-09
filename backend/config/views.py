# backend/config/views.py (새로 만들기)
from django.http import JsonResponse
from django.db import connection
from django.core.cache import cache

def health_check(request):
    """헬스체크 엔드포인트"""
    health_status = {
        'status': 'healthy',
        'checks': {}
    }
    
    # 데이터베이스 확인
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        health_status['checks']['database'] = 'ok'
    except Exception as e:
        health_status['status'] = 'unhealthy'
        health_status['checks']['database'] = f'error: {str(e)}'
    
    # Redis 확인
    try:
        cache.set('health_check', 'ok', 10)
        if cache.get('health_check') == 'ok':
            health_status['checks']['redis'] = 'ok'
        else:
            health_status['checks']['redis'] = 'error'
    except Exception as e:
        health_status['checks']['redis'] = f'error: {str(e)}'
    
    status_code = 200 if health_status['status'] == 'healthy' else 503
    return JsonResponse(health_status, status=status_code)