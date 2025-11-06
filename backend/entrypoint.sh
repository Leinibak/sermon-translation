#!/bin/bash
set -e

echo "⏳ Waiting for PostgreSQL..."

# dev 환경이면 /app, prod 환경이면 /app/backend
if [ "$DJANGO_ENV" = "prod" ]; then
    cd /app/backend
else
    cd /app
fi

# PostgreSQL 준비 대기
while ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER"; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 1
done

echo "✅ PostgreSQL is up and running!"

# 필수 환경 변수 확인
: "${DJANGO_SETTINGS_MODULE:?DJANGO_SETTINGS_MODULE is not set!}"

echo "🔄 Running database migrations..."
python manage.py migrate --noinput

echo "📦 Collecting static files..."
python manage.py collectstatic --noinput

# 환경 구분 실행
if [ "$DJANGO_ENV" = "prod" ]; then
  echo "🚀 Starting Gunicorn (Production Mode)..."
  exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 3 \
    --access-logfile - \
    --error-logfile -
else
  echo "🧩 Starting Django development server..."
  exec python manage.py runserver 0.0.0.0:8000
fi
