# deploy.sh (배포 스크립트)
#!/bin/bash
set -e
# 실패 시 메시지 출력 함수
error_exit() {
    echo "❌ Deployment failed at line $1"
}
# ERR 시 error_exit 함수 호출, $LINENO로 어느 줄에서 실패했는지 표시
trap 'error_exit $LINENO' ERR

echo "🚀 Starting deployment..."

# 환경 변수 로드
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
else
  echo ".env 파일을 찾을 수 없습니다!"
  exit 1
fi

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

# 최신 코드 가져오기
if [ ! -d .git ]; then
  echo "Git 저장소가 없으므로 새로 클론합니다."
  git clone git@github.com:Leinibak/sermon-translation.git .
else
  echo "Git pull로 최신 코드 가져오기"
  git reset --hard
  git pull origin main
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