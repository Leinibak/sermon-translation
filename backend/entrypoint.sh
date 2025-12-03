# ===========================================
# FILE: backend/entrypoint.sh (배포 버젼 정정)
# ===========================================
#!/bin/sh

set -e

echo "🔍 환경 확인: DJANGO_ENV=${DJANGO_ENV}"

# DB가 준비될 때까지 대기
echo "⏳ PostgreSQL 연결 대기 중..."
# DB 호스트 이름과 포트가 'db 5432'로 가정
while ! nc -z db 5432; do
  sleep 0.5
done
echo "✅ PostgreSQL 연결 성공"

# Redis가 준비될 때까지 대기
echo "⏳ Redis 연결 대기 중..."
# Redis 호스트 이름과 포트가 'redis 6379'로 가정
while ! nc -z redis 6379; do
  sleep 0.5
done
echo "✅ Redis 연결 성공"

# 마이그레이션 실행
echo "🔄 데이터베이스 마이그레이션 실행..."
python manage.py migrate --noinput

# 정적 파일 수집
echo "📦 정적 파일 수집..."
python manage.py collectstatic --noinput

# 환경에 따라 서버 실행
if [ "$DJANGO_ENV" = "prod" ]; then
    echo "🚀 프로덕션 모드: Gunicorn (WSGI) 및 Daphne (ASGI) 서버 시작..."
    
    # 1. Gunicorn (HTTP/WSGI) 서버 실행 (백그라운드)
    # - WSGI 요청 (일반 HTTP API) 처리를 담당합니다.
    # - --workers는 서버 CPU 코어 수에 맞게 조정해야 합니다. (예: 2n+1)
    echo "   -> Gunicorn 시작 (HTTP/WSGI: 0.0.0.0:8000)"
    gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 4 --log-level info &

    # 2. Daphne (WebSocket/ASGI) 서버 실행 (백그라운드)
    # - ASGI 요청 (화상 회의 WebSocket) 처리를 담당합니다.
    # - Gunicorn과 포트를 분리합니다 (8001). Nginx에서 /ws/ 경로를 이곳으로 전달해야 합니다.
    echo "   -> Daphne 시작 (WebSocket/ASGI: 0.0.0.0:8001)"
    daphne -b 0.0.0.0 -p 8001 config.asgi:application &

    # 3. 두 백그라운드 프로세스가 종료될 때까지 대기
    # 컨테이너가 종료되지 않고 Gunicorn/Daphne이 계속 실행되도록 유지합니다.
    wait -n
    
    # 프로세스 중 하나라도 오류로 종료되면 컨테이너도 종료
    exit $?

else
    echo "🛠️ 개발 모드: Django 개발 서버 시작..."
    # 개발 모드에서는 내장 서버를 사용하여 HTTP/ASGI를 모두 처리합니다.
    exec python manage.py runserver 0.0.0.0:8000
fi

# ===========================================