FROM python:3.14-slim

WORKDIR /app

# 시스템 패키지 설치
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-client \
        netcat-traditional \
        # 'tr' 명령은 coreutils에 포함되어 있으나, netcat 설치 시 이미 패키지 관리자가 작동하므로 추가하지 않습니다.
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Python 패키지 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# jq 설치
RUN apt-get update && apt-get install -y jq curl

RUN mkdir -p /app/logs && chmod 777 /app/logs

# 소스 복사
COPY . .


# 포트 노출
EXPOSE 8000

# 엔트리포인트 스크립트 실행 권한 부여는 유지하되, ENTRYPOINT는 YAML에서 처리
RUN chmod +x /app/entrypoint.sh

# ENTRYPOINT 명령은 docker-compose.dev.yml로 이동하여 오류를 우회합니다.
# ENTRYPOINT ["/app/entrypoint.sh"]
ENTRYPOINT ["/app/entrypoint.sh"]
