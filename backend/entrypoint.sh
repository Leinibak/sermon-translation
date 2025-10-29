#!/bin/bash
set -e

echo "⏳ Waiting for PostgreSQL..."

# PostgreSQL이 준비될 때까지 대기
while ! pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 1
done

echo "✅ PostgreSQL is up and running!"

# 데이터베이스 마이그레이션
echo "🔄 Running migrations..."
python manage.py migrate --noinput

# Static 파일 수집
echo "📦 Collecting static files..."
python manage.py collectstatic --noinput

# Gunicorn으로 서버 실행
echo "🚀 Starting Gunicorn..."
gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3