#!/bin/sh
# ===========================================
# FILE: backend/entrypoint.dev.sh (개발 환경용)
# ===========================================

set -e

echo "🛠️  개발 환경 시작: DJANGO_ENV=${DJANGO_ENV:-dev}"

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

# 정적 파일 수집 (개발 환경에서는 선택사항)
echo "📦 정적 파일 수집..."
python manage.py collectstatic --noinput --clear

# 개발용 초기 데이터 로드 (선택사항)
# echo "📥 초기 데이터 로드..."
# python manage.py loaddata fixtures/dev_data.json

# Django 개발 서버 시작
echo "🚀 Django 개발 서버 시작 (0.0.0.0:8000)..."
echo "   📍 Hot-reload 활성화"
echo "   📍 디버그 모드: DEBUG=True"
echo "   📍 HTTP + WebSocket 통합 지원"
echo ""

# Django의 runserver는 자동으로 ASGI를 지원하므로
# WebSocket과 HTTP 요청을 모두 처리할 수 있습니다
exec python manage.py runserver 0.0.0.0:8000

# ===========================================