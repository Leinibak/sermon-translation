#!/bin/bash

# ================================================
# 안전한 프로덕션 배포 스크립트
# ================================================

set -e

COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"

echo "🚀 Starting deployment process..."
echo "================================================"
echo ""

# ================================================
# 1️⃣ Git 업데이트
# ================================================
echo "📥 Checking for updates from GitHub..."

# Git 상태 확인
if [ ! -d ".git" ]; then
    echo "❌ Not a git repository!"
    exit 1
fi

# 현재 브랜치 확인
CURRENT_BRANCH=$(git branch --show-current)
echo "📌 Current branch: $CURRENT_BRANCH"

# 커밋되지 않은 변경사항 확인
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    echo "⚠️  Uncommitted changes detected!"
    git status --short
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Deployment cancelled"
        exit 1
    fi
fi

# 원격 저장소 최신 정보 가져오기
echo "🔍 Fetching from remote..."
git fetch origin

# 현재 커밋과 원격 커밋 비교
LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/$CURRENT_BRANCH)

if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    echo "✅ Already up to date with origin/$CURRENT_BRANCH"
else
    echo "📦 New changes available"
    echo "   Local:  $LOCAL_COMMIT"
    echo "   Remote: $REMOTE_COMMIT"
    echo ""
    
    # Pull 실행
    echo "⬇️  Pulling latest changes..."
    if git pull origin "$CURRENT_BRANCH"; then
        echo "✅ Successfully pulled latest changes"
    else
        echo "❌ Git pull failed!"
        echo "ℹ️  Please resolve conflicts manually and try again"
        exit 1
    fi
fi

echo "✅ Git update completed"
echo ""

# ================================================
# 2️⃣ 사전 검증
# ================================================
echo "📋 Pre-deployment checks..."

# .env 파일 확인
if [ ! -f .env.production ]; then
    echo "❌ .env.production file not found!"
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
if [ -f "frontend/Dockerfile.prod" ]; then
    echo "✅ frontend/Dockerfile.prod found"
else
    echo "❌ frontend/Dockerfile.prod not found!"
    exit 1
fi

# Frontend nginx 설정 확인
if [ -f "frontend/nginx.prod.conf" ]; then
    echo "✅ frontend/nginx.prod.conf found"
elif [ -f "nginx/conf.d/default.conf" ]; then
    echo "✅ nginx configuration found"
else
    echo "⚠️  nginx configuration not found (will use default)"
fi

# Backend entrypoint 파일 확인 및 실행 권한 부여
if [ ! -f "backend/entrypoint.prod.sh" ]; then
    echo "❌ backend/entrypoint.prod.sh not found!"
    exit 1
fi
chmod +x backend/entrypoint.prod.sh
echo "✅ backend/entrypoint.prod.sh permissions set"

echo "✅ All pre-deployment checks passed!"
echo ""

# ================================================
# 3️⃣ 백업 생성
# ================================================
echo "💾 Creating backup..."
mkdir -p "$BACKUP_DIR"

# 데이터베이스 백업
if docker ps | grep -q webboard_db_prod; then
    echo "📦 Backing up database..."
    POSTGRES_USER=${POSTGRES_USER:-postgres}
    POSTGRES_DB=${POSTGRES_DB:-webboard_db}
    
    if docker exec webboard_db_prod pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_DIR/database.sql" 2>/dev/null; then
        echo "✅ Database backup created"
    else
        echo "⚠️  Database backup failed (container might not be running)"
    fi
else
    echo "ℹ️  Database container not running, skipping backup"
fi

# 미디어 파일 백업
if [ -d "./media" ] && [ "$(ls -A ./media)" ]; then
    echo "📦 Backing up media files..."
    cp -r ./media "$BACKUP_DIR/"
    echo "✅ Media files backup created"
else
    echo "ℹ️  No media files to backup"
fi

# 현재 배포 정보 저장
echo "📝 Saving deployment info..."
{
    echo "Deployment Time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "Git Branch: $CURRENT_BRANCH"
    echo "Git Commit: $(git rev-parse HEAD)"
    echo "Git Message: $(git log -1 --pretty=%B)"
} > "$BACKUP_DIR/deploy_info.txt"

echo "✅ Backup completed: $BACKUP_DIR"
echo ""

# ================================================
# 4️⃣ 이미지 빌드
# ================================================
echo "🔨 Building Docker images..."
echo "⚠️  This may take a few minutes..."
echo ""

if docker compose -f $COMPOSE_FILE build --no-cache; then
    echo "✅ Docker images built successfully!"
else
    echo "❌ Docker build failed!"
    echo "ℹ️  Rolling back is not needed (old containers still running)"
    exit 1
fi
echo ""

# ================================================
# 5️⃣ 컨테이너 중지 및 제거
# ================================================
echo "🛑 Stopping old containers..."
docker compose -f $COMPOSE_FILE down --timeout 30
echo "✅ Old containers stopped"
echo ""

# ================================================
# 6️⃣ 새 컨테이너 시작
# ================================================
echo "🚀 Starting new containers..."
echo ""

if docker compose -f $COMPOSE_FILE up -d; then
    echo "✅ Containers started successfully!"
else
    echo "❌ Failed to start containers!"
    exit 1
fi
echo ""

# ================================================
# 7️⃣ 헬스체크
# ================================================
echo "🏥 Waiting for services to be healthy..."
echo ""

# 서비스 시작 대기
echo "⏳ Waiting for containers to initialize (30 seconds)..."
sleep 30

# Backend 헬스체크 (최대 2분 대기)
MAX_WAIT=120
WAITED=0
BACKEND_HEALTHY=false

echo "🔍 Checking backend health..."
while [ $WAITED -lt $MAX_WAIT ]; do
    # Docker 헬스체크 상태 확인
    BACKEND_STATUS=$(docker compose -f $COMPOSE_FILE ps backend --format "{{.Health}}" 2>/dev/null || echo "")
    
    if [ "$BACKEND_STATUS" = "healthy" ]; then
        echo "✅ Backend is healthy!"
        BACKEND_HEALTHY=true
        break
    elif [ "$BACKEND_STATUS" = "unhealthy" ]; then
        echo "❌ Backend is unhealthy!"
        break
    fi
    
    # HTTP 헬스체크 시도 - 여러 엔드포인트 확인
    if curl -f http://localhost:8000/api/health/ > /dev/null 2>&1; then
        echo "✅ Backend health endpoint is responding!"
        BACKEND_HEALTHY=true
        break
    elif curl -f http://localhost:8000/admin/ > /dev/null 2>&1; then
        echo "✅ Backend admin endpoint is responding!"
        BACKEND_HEALTHY=true
        break
    elif curl -f http://localhost:8000/ > /dev/null 2>&1; then
        echo "✅ Backend root endpoint is responding!"
        BACKEND_HEALTHY=true
        break
    fi
    
    if [ $((WAITED % 10)) -eq 0 ]; then
        echo "⏳ Waiting for backend... ($WAITED/$MAX_WAIT seconds)"
    fi
    
    sleep 5
    WAITED=$((WAITED + 5))
done

if [ "$BACKEND_HEALTHY" = false ]; then
    echo "❌ Backend health check failed or timed out!"
    echo ""
    echo "📋 Container status:"
    docker compose -f $COMPOSE_FILE ps backend
    echo ""
    echo "📋 Backend logs (last 50 lines):"
    docker compose -f $COMPOSE_FILE logs --tail=50 backend
    echo ""
    echo "🔍 Testing connectivity:"
    echo "   Port 8000: $(nc -zv localhost 8000 2>&1 || echo 'not reachable')"
    echo "   Port 8001: $(nc -zv localhost 8001 2>&1 || echo 'not reachable')"
    echo ""
    echo "⚠️  Deployment may have issues. Check logs above."
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Deployment cancelled"
        echo ""
        echo "💡 Troubleshooting tips:"
        echo "  1. Check if health endpoint exists: docker compose -f $COMPOSE_FILE exec backend curl http://localhost:8000/api/health/"
        echo "  2. View detailed logs: docker compose -f $COMPOSE_FILE logs backend"
        echo "  3. Check container status: docker compose -f $COMPOSE_FILE ps"
        exit 1
    fi
fi

# Nginx 헬스체크
echo ""
echo "🔍 Checking nginx..."
sleep 5

if curl -f http://localhost/health > /dev/null 2>&1; then
    echo "✅ Nginx health endpoint is responding!"
elif curl -f http://localhost/ > /dev/null 2>&1; then
    echo "✅ Nginx is responding!"
else
    echo "⚠️  Nginx health check warning"
    echo "ℹ️  This might be normal if:"
    echo "    - SSL is required (HTTPS only)"
    echo "    - Nginx is configured for specific domains"
    echo "    - Health endpoint is not configured"
fi

echo ""

# ================================================
# 8️⃣ 배포 후 작업
# ================================================
echo "🔧 Running post-deployment tasks..."

# 마이그레이션 실행
echo "📊 Running database migrations..."
if docker compose -f $COMPOSE_FILE exec -T backend python manage.py migrate --noinput; then
    echo "✅ Migrations completed"
else
    echo "⚠️  Migration warning (might already be applied)"
fi

# Static 파일 수집
echo "📦 Collecting static files..."
if docker compose -f $COMPOSE_FILE exec -T backend python manage.py collectstatic --noinput; then
    echo "✅ Static files collected"
else
    echo "⚠️  Static files collection warning"
fi

echo ""

# ================================================
# 9️⃣ 배포 완료
# ================================================
echo ""
echo "================================================"
echo "✅  DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo "================================================"
echo ""
echo "📊 Container status:"
docker compose -f $COMPOSE_FILE ps
echo ""
echo "🌐 Access points:"
echo "  Frontend:     http://$(hostname -I | awk '{print $1}')"
echo "  Backend API:  http://$(hostname -I | awk '{print $1}')/api"
echo "  Admin:        http://$(hostname -I | awk '{print $1}')/admin"
echo ""
echo "📝 Deployment info:"
echo "  Time:         $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Git Commit:   $(git rev-parse --short HEAD)"
echo "  Backup:       $BACKUP_DIR"
echo ""
echo "📝 Useful commands:"
echo "  View all logs:        docker compose -f $COMPOSE_FILE logs -f"
echo "  View backend logs:    docker compose -f $COMPOSE_FILE logs -f backend"
echo "  View nginx logs:      docker compose -f $COMPOSE_FILE logs -f nginx"
echo "  Restart service:      docker compose -f $COMPOSE_FILE restart [service]"
echo "  Stop all:             docker compose -f $COMPOSE_FILE down"
echo ""
echo "💾 Backup location: $BACKUP_DIR"
echo ""

# 로그 보기 옵션
read -p "📋 View logs now? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Press Ctrl+C to exit logs"
    sleep 2
    docker compose -f $COMPOSE_FILE logs -f --tail=100
fi