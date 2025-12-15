#!/bin/bash
# ===========================================
# FILE: backend/entrypoint.prod.sh (프로덕션 환경용)
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

# 슈퍼유저 생성 (선택사항)
# if [ -n "$DJANGO_SUPERUSER_USERNAME" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ]; then
#     echo "👤 슈퍼유저 확인 중..."
#     python manage.py shell <<EOF
# from django.contrib.auth import get_user_model
# User = get_user_model()
# username = "$DJANGO_SUPERUSER_USERNAME"
# email = "${DJANGO_SUPERUSER_EMAIL:-admin@example.com}"
# password = "$DJANGO_SUPERUSER_PASSWORD"

# if not User.objects.filter(username=username).exists():
#     User.objects.create_superuser(username, email, password)
#     print(f"✅ 슈퍼유저 '{username}' 생성 완료")
# else:
#     print(f"ℹ️ 슈퍼유저 '{username}' 이미 존재")
# EOF
# fi

# ========================================
# 3. 서버 시작
# ========================================

echo ""
echo "========================================"
echo "🎯 프로덕션 서버 설정"
echo "========================================"
echo "📌 Gunicorn (HTTP/WSGI)"
echo "   - 포트: 8000"
echo "   - Workers: ${GUNICORN_WORKERS:-4}"
echo "   - 일반 HTTP API 처리"
echo ""
echo "📌 Daphne (WebSocket/ASGI)"
echo "   - 포트: 8001"
echo "   - WebSocket 연결 처리"
echo "   - /ws/ 경로 전용"
echo "========================================"
echo ""

# Gunicorn 설정
GUNICORN_WORKERS=${GUNICORN_WORKERS:-4}
GUNICORN_THREADS=${GUNICORN_THREADS:-2}
GUNICORN_TIMEOUT=${GUNICORN_TIMEOUT:-60}
GUNICORN_MAX_REQUESTS=${GUNICORN_MAX_REQUESTS:-1000}
GUNICORN_MAX_REQUESTS_JITTER=${GUNICORN_MAX_REQUESTS_JITTER:-100}

# Daphne 설정
DAPHNE_WORKERS=${DAPHNE_WORKERS:-2}

echo "📊 Configuration:"
echo "   Gunicorn Workers: $GUNICORN_WORKERS"
echo "   Gunicorn Threads: $GUNICORN_THREADS"
echo "   Gunicorn Timeout: $GUNICORN_TIMEOUT"
echo "   Daphne Workers: $DAPHNE_WORKERS"
echo ""

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
    --websocket_timeout 3600 \
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

# 🆕 추가: 서버가 실제로 요청을 받을 수 있을 때까지 대기
echo "⏳ 서버 준비 상태 확인 중..."
READY=false
for i in {1..30}; do
    # Gunicorn 포트 체크
    if nc -z localhost 8000 2>/dev/null; then
        # 실제 HTTP 요청 테스트
        if curl -f http://localhost:8000/ > /dev/null 2>&1 || \
           curl -f http://localhost:8000/admin/ > /dev/null 2>&1; then
            echo "✅ Gunicorn이 요청을 받을 준비가 되었습니다!"
            READY=true
            break
        fi
    fi
    
    if [ $((i % 5)) -eq 0 ]; then
        echo "   대기 중... ($i/30초)"
    fi
    sleep 1
done

if [ "$READY" = false ]; then
    echo "⚠️ Gunicorn 준비 확인 실패 (타임아웃)"
    echo "📋 Gunicorn 로그:"
    tail -n 30 /app/logs/gunicorn-error.log 2>/dev/null || echo "로그 없음"
    # 경고만 하고 계속 진행 (프로세스는 실행 중이므로)
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
    if [ -n "$GUNICORN_PID" ] && kill -0 $GUNICORN_PID 2>/dev/null; then
        echo "   -> Gunicorn 종료 중 (PID: $GUNICORN_PID)"
        kill -TERM $GUNICORN_PID 2>/dev/null || true
        wait $GUNICORN_PID 2>/dev/null || true
    fi
    
    # Daphne 종료
    if [ -n "$DAPHNE_PID" ] && kill -0 $DAPHNE_PID 2>/dev/null; then
        echo "   -> Daphne 종료 중 (PID: $DAPHNE_PID)"
        kill -TERM $DAPHNE_PID 2>/dev/null || true
        wait $DAPHNE_PID 2>/dev/null || true
    fi
    
    echo "✅ 모든 서버가 안전하게 종료되었습니다."
    exit 0
}

# SIGTERM, SIGINT 신호 핸들러 등록
trap shutdown TERM INT

# ========================================
# 5. 프로세스 모니터링
# ========================================

monitor_interval=10

while true; do
    # Gunicorn 상태 확인
    if [ -n "$GUNICORN_PID" ] && ! kill -0 $GUNICORN_PID 2>/dev/null; then
        echo "❌ Gunicorn이 예기치 않게 종료되었습니다!"
        echo "📋 마지막 로그:"
        tail -n 20 /app/logs/gunicorn-error.log 2>/dev/null || echo "로그 파일 없음"
        if [ -n "$DAPHNE_PID" ]; then
            kill -TERM $DAPHNE_PID 2>/dev/null || true
        fi
        exit 1
    fi
    
    # Daphne 상태 확인
    if [ -n "$DAPHNE_PID" ] && ! kill -0 $DAPHNE_PID 2>/dev/null; then
        echo "❌ Daphne이 예기치 않게 종료되었습니다!"
        echo "📋 마지막 로그:"
        tail -n 20 /app/logs/daphne-access.log 2>/dev/null || echo "로그 파일 없음"
        if [ -n "$GUNICORN_PID" ]; then
            kill -TERM $GUNICORN_PID 2>/dev/null || true
        fi
        exit 1
    fi
    
    sleep $monitor_interval
done