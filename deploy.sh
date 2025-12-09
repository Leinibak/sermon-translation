#!/bin/bash
# ============================================
# deploy.sh (개선된 배포 스크립트)
# ============================================

set -e  # 에러 발생 시 중단

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 로깅 함수
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 배포 시작
echo "======================================"
echo "🚀 웹보드 프로덕션 배포 시작"
echo "======================================"
echo "시작 시간: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ========================================
# 1. 환경변수 파일 확인
# ========================================

log_info "환경변수 파일 확인 중..."

ENV_FILES=(
    ".env.production"
    "backend/.env.production"
    "frontend/.env.production"
)

missing_files=()
for file in "${ENV_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        missing_files+=("$file")
    fi
done

if [ ${#missing_files[@]} -gt 0 ]; then
    log_error "다음 환경변수 파일이 없습니다:"
    for file in "${missing_files[@]}"; do
        echo "  - $file"
    done
    exit 1
fi

log_success "모든 환경변수 파일 확인 완료"

# ========================================
# 2. Git 업데이트 (선택사항)
# ========================================

read -p "Git Pull을 실행하시겠습니까? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Git Pull 실행 중..."
    
    # 현재 브랜치 확인
    CURRENT_BRANCH=$(git branch --show-current)
    log_info "현재 브랜치: $CURRENT_BRANCH"
    
    # 변경사항 확인
    if ! git diff-index --quiet HEAD --; then
        log_warning "커밋되지 않은 변경사항이 있습니다."
        read -p "계속하시겠습니까? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_error "배포 취소됨"
            exit 1
        fi
    fi
    
    # Pull 실행
    git pull origin "$CURRENT_BRANCH"
    log_success "Git Pull 완료"
else
    log_warning "Git Pull 건너뜀"
fi

# ========================================
# 3. 백업 생성
# ========================================

log_info "현재 컨테이너 상태 백업 중..."

BACKUP_DIR="backups"
BACKUP_TIME=$(date '+%Y%m%d_%H%M%S')
BACKUP_FILE="$BACKUP_DIR/backup_$BACKUP_TIME.txt"

mkdir -p "$BACKUP_DIR"

# 현재 실행 중인 컨테이너 정보 저장
docker compose -f docker-compose.prod.yml ps > "$BACKUP_FILE" 2>&1 || true

log_success "백업 생성 완료: $BACKUP_FILE"

# ========================================
# 4. 기존 컨테이너 중지
# ========================================

log_info "기존 컨테이너 중지 중..."

# 타임아웃 설정 (30초)
docker compose -f docker-compose.prod.yml down --timeout 30

log_success "기존 컨테이너 중지 완료"

# ========================================
# 5. Docker 이미지 빌드
# ========================================

log_info "Docker 이미지 빌드 중..."

# 빌드 옵션 확인
read -p "캐시를 사용하지 않고 빌드하시겠습니까? (y/N): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    BUILD_ARGS="--no-cache"
    log_warning "캐시 없이 빌드합니다 (시간이 더 걸립니다)"
else
    BUILD_ARGS=""
    log_info "캐시를 사용하여 빌드합니다"
fi

# 빌드 실행
if ! docker compose -f docker-compose.prod.yml build $BUILD_ARGS; then
    log_error "Docker 이미지 빌드 실패!"
    log_info "이전 상태로 롤백을 시도합니다..."
    docker compose -f docker-compose.prod.yml up -d
    exit 1
fi

log_success "Docker 이미지 빌드 완료"

# ========================================
# 6. 컨테이너 시작
# ========================================

log_info "컨테이너 시작 중..."

if ! docker compose -f docker-compose.prod.yml up -d; then
    log_error "컨테이너 시작 실패!"
    exit 1
fi

log_success "컨테이너 시작 완료"

# ========================================
# 7. 서비스 준비 대기
# ========================================

log_info "서비스 준비 대기 중..."

MAX_WAIT=60  # 최대 60초 대기
WAIT_INTERVAL=5
elapsed=0

while [ $elapsed -lt $MAX_WAIT ]; do
    # 백엔드 헬스체크
    if docker compose -f docker-compose.prod.yml exec -T backend curl -f http://localhost:8000/api/health/ > /dev/null 2>&1; then
        log_success "백엔드 서비스 준비 완료"
        break
    fi
    
    echo -n "."
    sleep $WAIT_INTERVAL
    elapsed=$((elapsed + WAIT_INTERVAL))
done

echo ""

if [ $elapsed -ge $MAX_WAIT ]; then
    log_warning "백엔드 헬스체크 타임아웃 (계속 진행)"
fi

# ========================================
# 8. 데이터베이스 마이그레이션
# ========================================

log_info "데이터베이스 마이그레이션 실행 중..."

if ! docker compose -f docker-compose.prod.yml exec -T backend python manage.py migrate --noinput; then
    log_error "마이그레이션 실패!"
    log_info "컨테이너 로그:"
    docker compose -f docker-compose.prod.yml logs --tail=50 backend
    exit 1
fi

log_success "마이그레이션 완료"

# ========================================
# 9. 정적 파일 수집
# ========================================

log_info "정적 파일 수집 중..."

if ! docker compose -f docker-compose.prod.yml exec -T backend python manage.py collectstatic --noinput; then
    log_error "정적 파일 수집 실패!"
    exit 1
fi

log_success "정적 파일 수집 완료"

# ========================================
# 10. 배포 검증
# ========================================

log_info "배포 검증 중..."

# 컨테이너 상태 확인
echo ""
echo "📊 컨테이너 상태:"
docker compose -f docker-compose.prod.yml ps

# 실행 중인 컨테이너 개수 확인
RUNNING_CONTAINERS=$(docker compose -f docker-compose.prod.yml ps --status running --format json | wc -l)
EXPECTED_CONTAINERS=5  # db, redis, backend, frontend, nginx

if [ "$RUNNING_CONTAINERS" -lt "$EXPECTED_CONTAINERS" ]; then
    log_warning "일부 컨테이너가 실행되지 않았습니다."
    read -p "배포를 계속하시겠습니까? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_error "배포 취소됨"
        exit 1
    fi
fi

# ========================================
# 11. 로그 확인 옵션
# ========================================

echo ""
read -p "컨테이너 로그를 확인하시겠습니까? (y/N): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "최근 로그 (Ctrl+C로 종료):"
    docker compose -f docker-compose.prod.yml logs -f --tail=50
fi

# ========================================
# 12. 배포 완료
# ========================================

echo ""
echo "======================================"
log_success "배포 완료!"
echo "======================================"
echo "완료 시간: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
echo "🌐 접속 정보:"
echo "  Frontend: http://89.168.85.29"
echo "  Backend API: http://89.168.85.29/api"
echo "  Django Admin: http://89.168.85.29/admin"
echo "  HTTPS: https://jounsori.org (SSL 설정 후)"
echo ""
echo "📝 유용한 명령어:"
echo "  로그 확인: docker compose -f docker-compose.prod.yml logs -f"
echo "  상태 확인: docker compose -f docker-compose.prod.yml ps"
echo "  재시작: docker compose -f docker-compose.prod.yml restart"
echo "  중지: docker compose -f docker-compose.prod.yml down"
echo ""

# 배포 정보 저장
DEPLOY_LOG="$BACKUP_DIR/deploy_$BACKUP_TIME.log"
{
    echo "배포 시간: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "Git 커밋: $(git rev-parse HEAD)"
    echo "Git 브랜치: $(git branch --show-current)"
    echo ""
    docker compose -f docker-compose.prod.yml ps
} > "$DEPLOY_LOG"

log_success "배포 로그 저장: $DEPLOY_LOG"