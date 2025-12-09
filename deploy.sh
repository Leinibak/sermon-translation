#!/bin/bash

# ================================================
# 안전한 프로덕션 배포 스크립트
# ================================================

set -e

COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"

echo "🚀 Starting deployment process..."

# ================================================
# 1️⃣ 사전 검증
# ================================================
echo "📋 Pre-deployment checks..."

# .env 파일 확인
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    exit 1
fi

# Docker 실행 확인
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running!"
    exit 1
fi

# 필수 디렉토리 확인
required_dirs=("backend" "frontend" "nginx")
for dir in "${required_dirs[@]}"; do
    if [ ! -d "$dir" ]; then
        echo "❌ Required directory not found: $dir"
        exit 1
    fi
done

# Frontend Dockerfile에서 참조하는 파일 확인
if [ ! -f "frontend/nginx.prod.conf" ]; then
    echo "❌ frontend/nginx.prod.conf not found!"
    exit 1
fi

# Backend entrypoint 파일 확인 및 실행 권한 부여
if [ ! -f "backend/entrypoint.prod.sh" ]; then
    echo "❌ backend/entrypoint.prod.sh not found!"
    exit 1
fi
chmod +x backend/entrypoint.prod.sh

echo "✅ All pre-deployment checks passed!"

# ================================================
# 2️⃣ 백업 생성
# ================================================
echo "💾 Creating backup..."
mkdir -p "$BACKUP_DIR"

# 데이터베이스 백업
if docker ps | grep -q webboard_db_prod; then
    echo "Backing up database..."
    docker exec webboard_db_prod pg_dump -U ${POSTGRES_USER:-postgres} ${POSTGRES_DB:-webboard_db} > "$BACKUP_DIR/database.sql"
    echo "✅ Database backup created"
fi

# 미디어 파일 백업
if [ -d "./media" ]; then
    echo "Backing up media files..."
    cp -r ./media "$BACKUP_DIR/"
    echo "✅ Media files backup created"
fi

echo "✅ Backup completed: $BACKUP_DIR"

# ================================================
# 3️⃣ 이미지 빌드
# ================================================
echo "🔨 Building Docker images..."

if docker compose -f $COMPOSE_FILE build --no-cache; then
    echo "✅ Docker images built successfully!"
else
    echo "❌ Docker build failed!"
    echo "ℹ️  Rolling back is not needed (old containers still running)"
    exit 1
fi

# ================================================
# 4️⃣ 컨테이너 중지 및 제거
# ================================================
echo "🛑 Stopping old containers..."
docker compose -f $COMPOSE_FILE down

# ================================================
# 5️⃣ 새 컨테이너 시작
# ================================================
echo "🚀 Starting new containers..."

docker compose -f $COMPOSE_FILE up -d

# ================================================
# 6️⃣ 헬스체크
# ================================================
echo "🏥 Waiting for services to be healthy..."

# Backend 헬스체크 (최대 2분 대기)
MAX_WAIT=120
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if docker compose -f $COMPOSE_FILE ps backend | grep -q "healthy"; then
        echo "✅ Backend is healthy!"
        break
    fi
    
    if docker compose -f $COMPOSE_IF ps backend | grep -q "unhealthy"; then
        echo "❌ Backend is unhealthy!"
        echo "📋 Backend logs:"
        docker compose -f $COMPOSE_FILE logs --tail=50 backend
        exit 1
    fi
    
    echo "Waiting for backend... ($WAITED/$MAX_WAIT seconds)"
    sleep 5
    WAITED=$((WAITED + 5))
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo "❌ Backend health check timeout!"
    echo "📋 Backend logs:"
    docker compose -f $COMPOSE_FILE logs --tail=50 backend
    exit 1
fi

# Nginx 헬스체크
sleep 5
if curl -f http://localhost/health > /dev/null 2>&1; then
    echo "✅ Nginx is responding!"
else
    echo "⚠️  Nginx health check failed, but continuing..."
fi

# ================================================
# 7️⃣ 배포 완료
# ================================================
echo ""
echo "✅ ======================================"
echo "✅  Deployment completed successfully!"
echo "✅ ======================================"
echo ""
echo "📊 Container status:"
docker compose -f $COMPOSE_FILE ps

echo ""
echo "📝 Useful commands:"
echo "  View logs:     docker compose -f $COMPOSE_FILE logs -f [service]"
echo "  Restart:       docker compose -f $COMPOSE_FILE restart [service]"
echo "  Stop all:      docker compose -f $COMPOSE_FILE down"
echo "  Backup location: $BACKUP_DIR"
echo ""