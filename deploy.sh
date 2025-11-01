# ============================================
# deploy.sh (수정된 배포 스크립트)
# ============================================

set -e  # 에러 발생 시 중단

echo "🚀 배포 시작..."

# 환경변수 파일 확인
if [ ! -f .env.production ]; then
    echo "❌ .env.production 파일이 없습니다!"
    exit 1
fi

if [ ! -f backend/.env.production ]; then
    echo "❌ backend/.env.production 파일이 없습니다!"
    exit 1
fi

if [ ! -f frontend/.env.production ]; then
    echo "❌ frontend/.env.production 파일이 없습니다!"
    exit 1
fi

echo "✅ 환경변수 파일 확인 완료"

# Git Pull
echo "📥 Git Pull..."
git pull origin main

# 기존 컨테이너 중지
echo "🛑 기존 컨테이너 중지..."
docker compose -f docker-compose.prod.yml down

# Docker 이미지 빌드
echo "🔨 Docker 이미지 빌드..."
docker compose -f docker-compose.prod.yml build --no-cache

# 컨테이너 시작
echo "▶️ 컨테이너 시작..."
docker compose -f docker-compose.prod.yml up -d

# 컨테이너 준비 대기
echo "⏳ 컨테이너 준비 대기 (10초)..."
sleep 10

# 마이그레이션 실행
echo "🗄️ 마이그레이션 실행..."
docker compose -f docker-compose.prod.yml exec -T backend python manage.py migrate --noinput

# Static 파일 수집
echo "📦 Static 파일 수집..."
docker compose -f docker-compose.prod.yml exec -T backend python manage.py collectstatic --noinput

echo "✅ 배포 완료!"
echo ""
echo "📊 컨테이너 상태:"
docker compose -f docker-compose.prod.yml ps

echo ""
echo "🌐 접속 정보:"
echo "Frontend: http://89.168.102.116"
echo "Backend API: http://89.168.102.116:8000/api"
echo "Django Admin: http://89.168.102.116:8000/admin"