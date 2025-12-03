#!/bin/sh
# backend/entrypoint.sh

set -e

echo "🔍 환경 확인: DJANGO_ENV=${DJANGO_ENV}"

# DB가 준비될 때까지 대기
echo "⏳ PostgreSQL 연결 대기 중..."
while ! nc -z db 5432; do
  sleep 0.5
done
echo "✅ PostgreSQL 연결 성공"

# Redis가 준비될 때까지 대기
echo "⏳ Redis 연결 대기 중..."
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
    echo "🚀 프로덕션 모드: Daphne ASGI 서버 시작..."
    # ✅ Daphne로 ASGI 서버 실행 (WebSocket 지원)
    exec daphne -b 0.0.0.0 -p 8000 config.asgi:application
else
    echo "🛠️ 개발 모드: Django 개발 서버 시작..."
    exec python manage.py runserver 0.0.0.0:8000
fi