#!/bin/bash

# ================================================
# 롤백 스크립트
# 사용법:
#   ./rollback.sh              ← 이전 버전으로 자동 롤백
#   ./rollback.sh abc1234      ← 특정 커밋 태그로 롤백
#   ./rollback.sh --list       ← 배포 이력 확인
# ================================================

set -e

COMPOSE_FILE="docker-compose.prod.yml"
DEPLOY_HISTORY_FILE="./.deploy_history"

# ================================================
# 배포 이력 확인 옵션
# ================================================
if [ "$1" = "--list" ]; then
    echo "📋 Deploy history (most recent first):"
    echo ""
    if [ -f "$DEPLOY_HISTORY_FILE" ]; then
        nl "$DEPLOY_HISTORY_FILE"
    else
        echo "ℹ️  No deploy history found."
    fi
    exit 0
fi

# ================================================
# 롤백 대상 태그 결정
# ================================================
if [ -n "$1" ]; then
    TARGET_TAG="$1"
    echo "🎯 Target tag specified: $TARGET_TAG"
else
    # 이력 파일에서 이전 배포 태그 자동 선택 (2번째 줄 = 한 단계 이전)
    if [ ! -f "$DEPLOY_HISTORY_FILE" ]; then
        echo "❌ No deploy history found. Cannot auto-rollback."
        echo "ℹ️  Usage: ./rollback.sh <image_tag>"
        exit 1
    fi

    CURRENT_TAG=$(head -1 "$DEPLOY_HISTORY_FILE" | awk '{print $1}')
    TARGET_TAG=$(sed -n '2p' "$DEPLOY_HISTORY_FILE" | awk '{print $1}')

    if [ -z "$TARGET_TAG" ]; then
        echo "❌ No previous version found in deploy history."
        echo "ℹ️  Only one deployment on record. Nothing to roll back to."
        exit 1
    fi

    echo "🔄 Auto-rollback: $CURRENT_TAG → $TARGET_TAG"
fi

echo ""
echo "================================================"
echo "🔄 ROLLBACK PROCESS STARTING"
echo "================================================"
echo ""

# ================================================
# Docker 이미지 태그 롤백
# ================================================
echo "🔍 Checking Docker images for tag: $TARGET_TAG"

# compose config에서 서비스 이미지 이름 추출 후 태그 확인
SERVICES=("backend" "frontend")
ALL_IMAGES_FOUND=true

for SERVICE in "${SERVICES[@]}"; do
    IMAGE_NAME=$(docker compose -f $COMPOSE_FILE config 2>/dev/null | grep -A5 "  $SERVICE:" | grep "image:" | awk '{print $2}' || echo "")
    if [ -n "$IMAGE_NAME" ]; then
        if docker image inspect "${IMAGE_NAME}:${TARGET_TAG}" > /dev/null 2>&1; then
            echo "  ✅ Found: ${IMAGE_NAME}:${TARGET_TAG}"
        else
            echo "  ⚠️  Not found: ${IMAGE_NAME}:${TARGET_TAG}"
            ALL_IMAGES_FOUND=false
        fi
    fi
done

echo ""

# ================================================
# 롤백 방법 선택
# ================================================
if [ "$ALL_IMAGES_FOUND" = true ]; then
    echo "✅ All images found. Using Docker image tag rollback (fast)."
    ROLLBACK_METHOD="docker"
else
    echo "⚠️  Some images not found locally."
    echo "   Falling back to Git checkout rollback."
    ROLLBACK_METHOD="git"
fi

# ================================================
# DB 롤백 (컨테이너 중지 전에 먼저 결정)
# ================================================
# deploy.sh 는 컨테이너를 내리기 직전 database_final.sql 을 저장함.
# 코드만 롤백하고 DB 스키마가 그대로면 구버전 코드와 충돌할 수 있으므로
# 마이그레이션이 포함된 배포를 되돌릴 때는 DB도 함께 복구하는 것을 권장.
echo "================================================"
echo "🗄️  DB ROLLBACK CHECK"
echo "================================================"

# 가장 최근 final 스냅샷 파일 탐색
LATEST_BACKUP=$(ls -t ./backups/*/database_final.sql 2>/dev/null | head -1)
DB_ROLLBACK=false

if [ -n "$LATEST_BACKUP" ]; then
    BACKUP_TIME=$(stat -c '%y' "$LATEST_BACKUP" 2>/dev/null | cut -d'.' -f1)
    echo "📂 Found DB snapshot: $LATEST_BACKUP"
    echo "   Snapshot time: $BACKUP_TIME"
    echo ""
    echo "⚠️  주의: DB를 복구하면 스냅샷 이후 생성된 데이터는 유실됩니다."
    echo "   마이그레이션이 없는 배포였다면 'n' 을 선택하세요."
    echo ""
    read -p "DB도 함께 롤백할까요? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        DB_ROLLBACK=true
        echo "✅ DB 롤백 예약됨 — 컨테이너 중지 후 복구를 진행합니다."
    else
        echo "ℹ️  DB 롤백 건너뜀 — 코드만 롤백합니다."
        echo "   ⚠️  마이그레이션이 포함된 배포였다면 수동으로 migrate를 확인하세요."
    fi
else
    echo "ℹ️  DB 스냅샷을 찾을 수 없습니다 (./backups/*/database_final.sql)."
    echo "   코드 롤백만 진행합니다."
fi

echo ""

# ================================================
# 방법 A: Docker 이미지 태그 롤백 (빠름)
# ================================================
if [ "$ROLLBACK_METHOD" = "docker" ]; then
    echo "🐳 Rolling back Docker images to tag: $TARGET_TAG"
    echo ""

    for SERVICE in "${SERVICES[@]}"; do
        IMAGE_NAME=$(docker compose -f $COMPOSE_FILE config 2>/dev/null | grep -A5 "  $SERVICE:" | grep "image:" | awk '{print $2}' || echo "")
        if [ -n "$IMAGE_NAME" ]; then
            docker tag "${IMAGE_NAME}:${TARGET_TAG}" "${IMAGE_NAME}:latest"
            echo "  ✅ Restored ${IMAGE_NAME}:latest ← ${IMAGE_NAME}:${TARGET_TAG}"
        fi
    done

    echo ""
    echo "🛑 Stopping current containers..."
    docker compose -f $COMPOSE_FILE down --timeout 30

    echo "🚀 Starting containers with previous images..."
    # 기동 성공 여부를 변수로 받아 이력 업데이트 조건 판단에 사용 (Critical #3)
    set +e
    docker compose -f $COMPOSE_FILE up -d
    CONTAINER_START_OK=$?
    set -e

    if [ $CONTAINER_START_OK -ne 0 ]; then
        echo "❌ Failed to start containers after rollback!"
        echo "   Deploy history NOT updated to avoid corrupting rollback chain."
        echo "   Check logs: docker compose -f $COMPOSE_FILE logs --tail=50"
        exit 1
    fi

# ================================================
# 방법 B: Git checkout 롤백
# ================================================
else
    echo "📁 Rolling back via Git to commit: $TARGET_TAG"
    echo ""

    # 현재 상태 임시 저장
    CURRENT_COMMIT=$(git rev-parse HEAD)
    echo "   Current commit: $CURRENT_COMMIT"
    echo "   Target commit:  $TARGET_TAG"
    echo ""

    read -p "Checkout $TARGET_TAG and rebuild? (Y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        git checkout "$TARGET_TAG" -- .
        echo "✅ Checked out $TARGET_TAG"

        echo ""
        echo "🔨 Rebuilding images from previous code..."
        docker compose -f $COMPOSE_FILE build --no-cache backend frontend

        echo ""
        echo "🛑 Stopping current containers..."
        docker compose -f $COMPOSE_FILE down --timeout 30

        echo "🚀 Starting containers with rebuilt images..."
        set +e
        docker compose -f $COMPOSE_FILE up -d
        CONTAINER_START_OK=$?
        set -e

        if [ $CONTAINER_START_OK -ne 0 ]; then
            echo "❌ Failed to start containers after rollback!"
            echo "   Deploy history NOT updated to avoid corrupting rollback chain."
            echo "   Check logs: docker compose -f $COMPOSE_FILE logs --tail=50"
            exit 1
        fi
    else
        echo "❌ Rollback cancelled"
        exit 1
    fi
fi

# ================================================
# DB 복구 실행 (컨테이너 기동 성공 후)
# 컨테이너가 정상 기동된 시점에 DB를 복구해야
# Django가 마이그레이션 상태를 올바르게 인식함
# ================================================
if [ "$DB_ROLLBACK" = true ] && [ -n "$LATEST_BACKUP" ]; then
    echo "🗄️  Restoring database from snapshot..."
    echo "   Source: $LATEST_BACKUP"
    echo ""

    POSTGRES_USER=${POSTGRES_USER:-postgres}
    POSTGRES_DB=${POSTGRES_DB:-webboard_db}

    # 기존 연결 강제 종료 후 DB 재생성
    set +e
    docker compose -f $COMPOSE_FILE exec -T db psql -U "$POSTGRES_USER" -d postgres \
        -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$POSTGRES_DB' AND pid <> pg_backend_pid();" \
        > /dev/null 2>&1

    docker compose -f $COMPOSE_FILE exec -T db psql -U "$POSTGRES_USER" -d postgres \
        -c "DROP DATABASE IF EXISTS $POSTGRES_DB;" > /dev/null 2>&1

    docker compose -f $COMPOSE_FILE exec -T db psql -U "$POSTGRES_USER" -d postgres \
        -c "CREATE DATABASE $POSTGRES_DB;" > /dev/null 2>&1

    # 스냅샷 복구
    docker compose -f $COMPOSE_FILE exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB" \
        < "$LATEST_BACKUP" > /dev/null 2>&1
    DB_RESTORE_OK=$?
    set -e

    if [ $DB_RESTORE_OK -eq 0 ]; then
        echo "✅ DB 복구 완료"
        echo "   Snapshot time: $(stat -c '%y' "$LATEST_BACKUP" | cut -d'.' -f1)"
    else
        echo "❌ DB 복구 실패! 수동으로 복구가 필요합니다:"
        echo "   psql -U $POSTGRES_USER $POSTGRES_DB < $LATEST_BACKUP"
    fi
    echo ""
fi

# ================================================
# 롤백 후 헬스체크
# ================================================
echo ""
echo "⏳ Waiting for services to start (loop, max 60 seconds)..."

# set -e 환경에서 curl 실패 시 스크립트가 중단되는 것을 방지
# 헬스체크 구간만 set +e 로 격리하고, 결과는 변수로 판단
set +e
MAX_WAIT=60
WAITED=0
HEALTH_OK=false

while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -f http://localhost:8000/api/health/ > /dev/null 2>&1 || \
       curl -f http://localhost:8000/ > /dev/null 2>&1; then
        HEALTH_OK=true
        break
    fi
    if [ $((WAITED % 15)) -eq 0 ] && [ $WAITED -gt 0 ]; then
        echo "⏳ Still waiting... ($WAITED/$MAX_WAIT seconds)"
    fi
    sleep 5
    WAITED=$((WAITED + 5))
done
set -e

echo "🏥 Health check after rollback..."
if [ "$HEALTH_OK" = true ]; then
    echo "✅ Service is responding! (after ${WAITED}s)"
else
    echo "⚠️  Service may not be ready yet. Check manually:"
    echo "   docker compose -f $COMPOSE_FILE ps"
    echo "   docker compose -f $COMPOSE_FILE logs --tail=30 backend"
fi

# ================================================
# 롤백 이력 업데이트
# 컨테이너 기동 성공이 확인된 이후에만 실행 (Critical #3)
# 기동 실패 시 이미 위에서 exit 처리됐으므로 여기까지 오면 성공 상태
# ================================================
if [ -f "$DEPLOY_HISTORY_FILE" ]; then
    TEMP_FILE=$(mktemp)
    ROLLBACK_ENTRY="$TARGET_TAG [ROLLBACK] $(date '+%Y-%m-%d %H:%M:%S')"
    echo "$ROLLBACK_ENTRY" > "$TEMP_FILE"
    head -4 "$DEPLOY_HISTORY_FILE" >> "$TEMP_FILE"
    mv "$TEMP_FILE" "$DEPLOY_HISTORY_FILE"
fi

# ================================================
# 완료
# ================================================
echo ""
echo "================================================"
echo "✅  ROLLBACK COMPLETED"
echo "================================================"
echo ""
echo "📊 Container status:"
docker compose -f $COMPOSE_FILE ps
echo ""
echo "📝 Rollback info:"
echo "  Time:       $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Rolled to:  $TARGET_TAG"
echo ""
echo "💡 Next steps:"
echo "  - Verify the app is working correctly"
echo "  - Fix the issue in a new branch before redeploying"
echo "  - View deploy history: ./rollback.sh --list"
echo ""