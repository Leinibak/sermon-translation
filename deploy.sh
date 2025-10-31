#!/bin/bash
set -e

BRANCH=${1:-main}   # 기본 브랜치는 main
echo "🚀 Deploying branch: $BRANCH"

# 에러 핸들링
trap 'echo "❌ Deployment failed at line $LINENO"' ERR

# === 환경 변수 로드 ===
if [ -f .env.production ]; then
  export $(grep -v '^#' .env.production | xargs)
else
  echo "❌ .env.production not found!"
  exit 1
fi

# === 필수 env 파일 존재 확인 ===
for file in .env.production ; do
  if [ ! -f "$file" ]; then
    echo "❌ Missing $file"
    exit 1
  fi
done

# === 최신 코드 가져오기 ===
if [ ! -d .git ]; then
  echo "📦 Cloning repository..."
  git clone git@github.com:Leinibak/sermon-translation.git .
fi

echo "📥 Pulling latest code..."
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"


sudo usermod -aG docker $USER

# === Docker Compose 재빌드 및 실행 ===
echo "🔨 Building & starting containers..."
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

# === Django 마이그레이션 & 정적파일 ===
echo "🗄️  Running database migrations..."
docker compose -f docker-compose.prod.yml exec -T backend python manage.py migrate

echo "📦 Collecting static files..."
docker compose -f docker-compose.prod.yml exec -T backend python manage.py collectstatic --noinput

# === 헬스체크 ===
echo "🔍 Checking app health..."
sleep 5
if curl -fs http://localhost:8000/health/ > /dev/null; then
  echo "✅ Deployment successful!"
else
  echo "⚠️  Warning: App may not be responding yet."
fi

# === 로그 보기 ===
echo "📝 Showing logs (Ctrl+C to exit)..."
docker compose -f docker-compose.prod.yml logs -f
