#!/bin/bash

# ================================================
# 안전한 프로덕션 배포 스크립트
# ================================================

set -e

COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
DEPLOY_HISTORY_FILE="./.deploy_history"
IMAGE_TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

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

# ⚠️ feature 브랜치에서 배포 시 경고
if [[ "$CURRENT_BRANCH" == feature/* ]]; then
    echo ""
    echo "⚠️  WARNING: You are deploying from a feature branch!"
    echo "   Branch: $CURRENT_BRANCH"
    echo "   Recommended: merge to 'main' or 'develop' before deploying to production."
    echo ""
    read -p "Deploy from feature branch anyway? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Deployment cancelled"
        echo "ℹ️  Tip: git checkout main && git merge $CURRENT_BRANCH && git push origin main"
        exit 1
    fi
fi

# main 브랜치가 아닌 경우 알림
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo "ℹ️  Note: Deploying from non-main branch: $CURRENT_BRANCH"
fi

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
REMOTE_COMMIT=$(git rev-parse origin/$CURRENT_BRANCH 2>/dev/null || echo "")

if [ -z "$REMOTE_COMMIT" ]; then
    echo "ℹ️  No remote tracking branch found for $CURRENT_BRANCH"
elif [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
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
        # Pull 후 태그 재계산
        IMAGE_TAG=$(git rev-parse --short HEAD)
    else
        echo "❌ Git pull failed!"
        echo "ℹ️  Please resolve conflicts manually and try again"
        exit 1
    fi
fi

echo "✅ Git update completed"
echo "🏷️  Image tag: $IMAGE_TAG"
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

# Frontend Dockerfile 확인
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

# .env 동기화
echo "🔄 Syncing .env.production → .env..."
cp .env.production .env
echo "✅ .env synced"
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
    echo "Image Tag: $IMAGE_TAG"
    echo "Git Message: $(git log -1 --pretty=%B)"
} > "$BACKUP_DIR/deploy_info.txt"

echo "✅ Backup completed: $BACKUP_DIR"
echo ""

# ================================================
# 4️⃣ 이미지 빌드 (버전 태그 포함)
# ================================================
echo "🔨 Building Docker images..."
echo "🏷️  Tagging as: $IMAGE_TAG (and latest)"
echo "⚠️  This may take a few minutes..."
echo ""

# mediasoup 이미지가 없을 때만 빌드
if docker image inspect webboard-mediasoup:latest > /dev/null 2>&1; then
    echo "✅ mediasoup image already exists — skipping build"
else
    echo "📦 Building mediasoup (first time or forced)..."
    docker build -t webboard-mediasoup:latest ./mediasoup
    echo "✅ mediasoup build complete"
fi

echo ""

# backend, frontend 빌드 후 버전 태그 부여
echo "📦 Building backend and frontend (no cache)..."

# ⚠️ 레이스 컨디션 방지:
# 기존 방식(latest로 빌드 → 재태깅)은 동시 배포 시 latest가 덮어씌워질 위험이 있음.
# IMAGE_TAG 환경변수를 compose에 넘겨 빌드 단계에서 직접 버전 태그로 빌드하고,
# 완료 후 latest도 별도로 태깅하여 두 태그를 원자적으로 관리.
export IMAGE_TAG   # docker-compose.prod.yml 내 ${IMAGE_TAG} 변수에서 참조 가능

if ! IMAGE_TAG=$IMAGE_TAG docker compose -f $COMPOSE_FILE build --no-cache backend frontend; then
    echo "❌ backend/frontend build failed!"
    exit 1
fi

# 버전 태그로 빌드된 이미지에 latest도 추가 태깅 (롤백 기준점 유지용)
echo "🏷️  Tagging images: $IMAGE_TAG → latest"
for SERVICE in backend frontend; do
    # docker compose config 파이프라인 대신 환경변수로 이미지명 관리해 오파싱 방지
    IMAGE_NAME=$(IMAGE_TAG=$IMAGE_TAG docker compose -f $COMPOSE_FILE config 2>/dev/null \
        | awk "/^  ${SERVICE}:/{found=1} found && /image:/{print \$2; exit}")
    if [ -n "$IMAGE_NAME" ]; then
        # 버전 태그가 정상 생성됐는지 먼저 확인 후 latest 태깅
        if docker image inspect "${IMAGE_NAME}:${IMAGE_TAG}" > /dev/null 2>&1; then
            docker tag "${IMAGE_NAME}:${IMAGE_TAG}" "${IMAGE_NAME}:latest"
            echo "   ✅ ${IMAGE_NAME}:${IMAGE_TAG} → ${IMAGE_NAME}:latest"
        else
            # 버전 태그 이미지가 없으면 latest → 버전 태그 역방향 태깅 (fallback)
            docker tag "${IMAGE_NAME}:latest" "${IMAGE_NAME}:${IMAGE_TAG}" 2>/dev/null && \
                echo "   ✅ (fallback) Tagged ${IMAGE_NAME}:${IMAGE_TAG}" || \
                echo "   ⚠️  Could not tag $SERVICE — check IMAGE_TAG in docker-compose.prod.yml"
        fi
    else
        echo "   ⚠️  Could not resolve image name for $SERVICE"
    fi
done

echo "✅ Docker images built and tagged successfully!"
echo ""

# ================================================
# 5️⃣ 배포 이력 저장 (롤백용)
# ================================================
echo "📝 Saving deploy history for rollback..."

PREV_TAG=""
if [ -f "$DEPLOY_HISTORY_FILE" ]; then
    PREV_TAG=$(head -1 "$DEPLOY_HISTORY_FILE" | awk '{print $1}')
fi

# 현재 배포를 이력 맨 앞에 추가 (최근 5개 유지)
HISTORY_ENTRY="$IMAGE_TAG $CURRENT_BRANCH $(date '+%Y-%m-%d %H:%M:%S') $(git log -1 --pretty=%s)"
if [ -f "$DEPLOY_HISTORY_FILE" ]; then
    TEMP_FILE=$(mktemp)
    echo "$HISTORY_ENTRY" > "$TEMP_FILE"
    head -4 "$DEPLOY_HISTORY_FILE" >> "$TEMP_FILE"
    mv "$TEMP_FILE" "$DEPLOY_HISTORY_FILE"
else
    echo "$HISTORY_ENTRY" > "$DEPLOY_HISTORY_FILE"
fi

echo "✅ Deploy history updated"
if [ -n "$PREV_TAG" ]; then
    echo "   Previous version: $PREV_TAG (rollback available)"
fi
echo ""

# ================================================
# 6️⃣ 컨테이너 중지 직전 — DB 최종 스냅샷 (롤백용)
# ================================================
# 배포 3단계에서 백업을 이미 만들었지만, 빌드하는 동안 새 데이터가 쌓였을 수 있음.
# 컨테이너를 내리기 직전 시점의 스냅샷을 database_final.sql 로 별도 저장해
# rollback.sh 가 이 파일을 기준으로 DB를 복구할 수 있도록 함.
echo "💾 Creating final DB snapshot before cutover (for rollback)..."
if docker ps --format '{{.Names}}' | grep -q "^webboard_db_prod$"; then
    POSTGRES_USER=${POSTGRES_USER:-postgres}
    POSTGRES_DB=${POSTGRES_DB:-webboard_db}
    if docker exec webboard_db_prod pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
            > "$BACKUP_DIR/database_final.sql" 2>/dev/null; then
        echo "✅ Final DB snapshot saved: $BACKUP_DIR/database_final.sql"
    else
        echo "⚠️  Final DB snapshot failed — rollback.sh 에서 DB 복구를 이용할 수 없을 수 있습니다"
    fi
else
    echo "ℹ️  DB container not running, skipping final snapshot"
fi
echo ""

# ================================================
# 6️⃣ 컨테이너 중지 및 제거
# ================================================
echo "🛑 Stopping old containers..."
docker compose -f $COMPOSE_FILE down --timeout 30
echo "✅ Old containers stopped"
echo ""

# ================================================
# 7️⃣ 새 컨테이너 시작
# ================================================
echo "🚀 Starting new containers..."
echo ""

if docker compose -f $COMPOSE_FILE up -d; then
    echo "✅ Containers started successfully!"
else
    echo "❌ Failed to start containers!"
    echo ""
    echo "🔄 Attempting automatic rollback..."
    if [ -n "$PREV_TAG" ]; then
        echo "   Rolling back to: $PREV_TAG"
        bash ./rollback.sh "$PREV_TAG" || echo "⚠️  Auto-rollback failed. Run: ./rollback.sh $PREV_TAG"
    else
        echo "   No previous version found for rollback."
    fi
    exit 1
fi
echo ""

# ================================================
# 8️⃣ 헬스체크
# ================================================
echo "🏥 Waiting for services to be healthy..."
echo ""

echo "⏳ Waiting for containers to initialize (30 seconds)..."
sleep 30

# Backend 헬스체크 (최대 2분 대기)
MAX_WAIT=120
WAITED=0
BACKEND_HEALTHY=false

echo "🔍 Checking backend health..."
while [ $WAITED -lt $MAX_WAIT ]; do
    BACKEND_STATUS=$(docker compose -f $COMPOSE_FILE ps backend --format "{{.Health}}" 2>/dev/null || echo "")

    if [ "$BACKEND_STATUS" = "healthy" ]; then
        echo "✅ Backend is healthy!"
        BACKEND_HEALTHY=true
        break
    elif [ "$BACKEND_STATUS" = "unhealthy" ]; then
        echo "❌ Backend is unhealthy!"
        break
    fi

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

    if [ -n "$PREV_TAG" ]; then
        echo "⚠️  Deployment failed. Auto-rollback option available."
        read -p "Rollback to previous version ($PREV_TAG)? (Y/n): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            bash ./rollback.sh "$PREV_TAG"
            exit 1
        fi
    fi

    read -p "Continue without rollback? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Deployment cancelled"
        echo ""
        echo "💡 Manual rollback: ./rollback.sh $PREV_TAG"
        exit 1
    fi
fi

# Mediasoup 헬스체크
echo "🔍 Checking mediasoup..."
if docker exec webboard_mediasoup wget -qO- http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ mediasoup is healthy!"
else
    echo "⚠️  mediasoup health check failed - check logs:"
    echo "    docker logs webboard_mediasoup"
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
# 9️⃣ 배포 후 작업
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

# 9. 데이터 로드 (JSON -> DB)
echo "📥 Loading Jesus sayings data from JSON..."

# 4개 복음서 데이터를 차례대로 로드 (이미 있으면 스킵함)
docker compose -f $COMPOSE_FILE exec -T backend python manage.py load_jesus_sayings

echo "✅ Data loading completed"

# ================================================
# 🔟 배포 완료
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
echo "  Branch:       $CURRENT_BRANCH"
echo "  Git Commit:   $(git rev-parse --short HEAD)"
echo "  Image Tag:    $IMAGE_TAG"
echo "  Backup:       $BACKUP_DIR"
echo ""
echo "🔄 Rollback command (if needed):"
echo "  ./rollback.sh $IMAGE_TAG     ← rollback to this version later"
if [ -n "$PREV_TAG" ]; then
    echo "  ./rollback.sh $PREV_TAG  ← rollback to previous version"
fi
echo ""
echo "📋 Deploy history:"
cat "$DEPLOY_HISTORY_FILE" 2>/dev/null | head -5 | nl
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