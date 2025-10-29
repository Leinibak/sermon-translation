# deploy.sh (배포 스크립트)
#!/bin/bash

echo "🚀 Starting deployment..."

# Git pull
echo "📥 Pulling latest changes..."
git pull origin main

# Backend 환경변수 확인
if [ ! -f backend/.env ]; then
    echo "❌ backend/.env not found! Please create it."
    exit 1
fi

# Frontend 환경변수 확인
if [ ! -f frontend/.env ]; then
    echo "❌ frontend/.env not found! Please create it."
    exit 1
fi

# Docker Compose로 재빌드 및 재시작
echo "🔨 Building and starting containers..."
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# 마이그레이션 실행
echo "🗄️  Running migrations..."
docker-compose -f docker-compose.prod.yml exec -T backend python manage.py migrate

# Static 파일 수집
echo "📦 Collecting static files..."
docker-compose -f docker-compose.prod.yml exec -T backend python manage.py collectstatic --noinput

echo "✅ Deployment completed!"
echo "🌐 Your application should be available at your domain/IP"

# 로그 확인
echo "📝 Showing logs (Ctrl+C to exit)..."
docker-compose -f docker-compose.prod.yml logs -f