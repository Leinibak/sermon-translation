#!/bin/sh
# ===========================================
# FILE: backend/entrypoint.prod.sh (프로덕션 환경용 - 슈퍼유저 로직 제거)
# ===========================================

set -e

echo "🚀 프로덕션 환경 시작: DJANGO_ENV=${DJANGO_ENV:-prod}"

# ========================================
# 1. 서비스 연결 대기
# ========================================

wait_for_service() {
    local host=$1
    local port=$2
    local service=$3
    local max_attempts=30
    local attempt=0

    echo "⏳ $service 연결 대기 중 ($host:$port)..."
    
    while ! nc -z "$host" "$port"; do
        attempt=$((attempt + 1))
        if [ $attempt -ge $max_attempts ]; then
            echo "❌ $service 연결 실패 (타임아웃)"
            exit 1
        fi
        sleep 1
    done
    
    echo "✅ $service 연결 성공"
}

wait_for_service db 5432 "PostgreSQL"
wait_for_service redis 6379 "Redis"

# ========================================
# 2. 데이터베이스 초기화
# ========================================

echo "🔄 데이터베이스 마이그레이션 실행..."
python manage.py migrate --noinput

echo "📦 정적 파일 수집..."
python manage.py collectstatic --noinput --clear

# ⚠️ 슈퍼유저 생성 로직이 이 섹션에서 제거되었습니다.
# 관리자 계정은 수동으로 생성해야 합니다:
# docker compose exec backend python manage.py createsuperuser

# ========================================
# 3. 서버 시작
# ========================================

echo ""
echo "========================================"
echo "🎯 프로덕션 서버 설정"
echo "========================================"
echo "📌 Gunicorn (HTTP/WSGI)"
echo "   - 포트: 8000"
echo "   - Workers: ${GUNICORN_WORKERS:-4}"
echo "   - 일반 HTTP API 처리"
echo ""
echo "📌 Daphne (WebSocket/ASGI)"
echo "   - 포트: 8001"
echo "   - WebSocket 연결 처리"
echo "   - /ws/ 경로 전용"
echo "========================================"
echo ""

# Gunicorn 설정
GUNICORN_WORKERS=${GUNICORN_WORKERS:-4}
GUNICORN_THREADS=${GUNICORN_THREADS:-2}
GUNICORN_TIMEOUT=${GUNICORN_TIMEOUT:-60}

# Gunicorn 시작 (백그라운드)
echo "🔧 Gunicorn 시작..."
gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "$GUNICORN_WORKERS" \
    --threads "$GUNICORN_THREADS" \
    --worker-class sync \
    --max-requests 1000 \
    --max-requests-jitter 50 \
    --timeout "$GUNICORN_TIMEOUT" \
    --graceful-timeout 30 \
    --keep-alive 5 \
    --log-level info \
    --access-logfile /app/logs/gunicorn-access.log \
    --error-logfile /app/logs/gunicorn-error.log \
    --capture-output &

GUNICORN_PID=$!
echo "✅ Gunicorn 시작됨 (PID: $GUNICORN_PID)"

# Gunicorn 시작 확인
sleep 2
if ! kill -0 $GUNICORN_PID 2>/dev/null; then
    echo "❌ Gunicorn 시작 실패!"
    exit 1
fi

# Daphne 시작 (백그라운드)
echo "🔧 Daphne 시작..."
daphne -b 0.0.0.0 -p 8001 \
    --verbosity 1 \
    --proxy-headers \
    --websocket-timeout 3600 \
    --application-close-timeout 10 \
    --access-log /app/logs/daphne-access.log \
    config.asgi:application &

DAPHNE_PID=$!
echo "✅ Daphne 시작됨 (PID: $DAPHNE_PID)"

# Daphne 시작 확인
sleep 2
if ! kill -0 $DAPHNE_PID 2>/dev/null; then
    echo "❌ Daphne 시작 실패!"
    kill -TERM $GUNICORN_PID 2>/dev/null
    exit 1
fi

echo ""
echo "✨ 모든 서버가 성공적으로 시작되었습니다!"
echo ""

# ========================================
# 4. Graceful Shutdown 핸들러
# ========================================

shutdown() {
    echo ""
    echo "🛑 종료 신호 수신. 서버를 안전하게 종료합니다..."
    
    # Gunicorn 종료
    if kill -0 $GUNICORN_PID 2>/dev/null; then
        echo "   -> Gunicorn 종료 중 (PID: $GUNICORN_PID)"
        kill -TERM $GUNICORN_PID
        wait $GUNICORN_PID 2>/dev/null || true
    fi
    
    # Daphne 종료
    if kill -0 $DAPHNE_PID 2>/dev/null; then
        echo "   -> Daphne 종료 중 (PID: $DAPHNE_PID)"
        kill -TERM $DAPHNE_PID
        wait $DAPHNE_PID 2>/dev/null || true
    fi
    
    echo "✅ 모든 서버가 안전하게 종료되었습니다."
    exit 0
}

trap shutdown SIGTERM SIGINT

# ========================================
# 5. 프로세스 모니터링
# ========================================

monitor_interval=10

while true; do
    # Gunicorn 상태 확인
    if ! kill -0 $GUNICORN_PID 2>/dev/null; then
        echo "❌ Gunicorn이 예기치 않게 종료되었습니다!"
        echo "📋 마지막 로그:"
        tail -n 20 /app/logs/gunicorn-error.log 2>/dev/null || echo "로그 파일 없음"
        kill -TERM $DAPHNE_PID 2>/dev/null
        exit 1
    fi
    
    # Daphne 상태 확인
    if ! kill -0 $DAPHNE_PID 2>/dev/null; then
        echo "❌ Daphne이 예기치 않게 종료되었습니다!"
        echo "📋 마지막 로그:"
        tail -n 20 /app/logs/daphne-access.log 2>/dev/null || echo "로그 파일 없음"
        kill -TERM $GUNICORN_PID 2>/dev/null
        exit 1
    fi
    
    sleep $monitor_interval
done