# ===========================================
# FILE: backend/Dockerfile.dev (개발 환경용)
# ===========================================
FROM python:3.11-slim

# 작업 디렉토리 설정
WORKDIR /app

# 환경 변수 설정
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# 시스템 패키지 설치
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        # 데이터베이스 클라이언트
        postgresql-client \
        # 네트워크 유틸리티 (연결 대기용)
        netcat-traditional \
        # JSON 파싱 도구
        jq \
        # HTTP 클라이언트
        curl \
        # Git (개발용 - 선택사항)
        git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app/logs
# Python 패키지 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 개발용 추가 패키지 설치 (선택사항)
# COPY requirements.dev.txt .
# RUN pip install --no-cache-dir -r requirements.dev.txt

# 로그 디렉토리 생성
RUN mkdir -p /app/logs && chmod 777 /app/logs

# 미디어 및 정적 파일 디렉토리 생성 (개발용)
RUN mkdir -p /app/media /app/staticfiles && \
    chmod 777 /app/media /app/staticfiles

# 소스 코드 복사
# 개발 환경에서는 docker-compose.yml에서 volume으로 마운트하므로
# 여기서는 기본 구조만 복사
COPY . .

# 엔트리포인트 스크립트 권한 부여
RUN chmod +x /app/entrypoint.dev.sh

# 포트 노출
EXPOSE 8000

# 엔트리포인트 설정
ENTRYPOINT ["/app/entrypoint.dev.sh"]

# ===========================================