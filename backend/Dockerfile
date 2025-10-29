FROM python:3.14-slim

WORKDIR /app

# 시스템 패키지 설치
RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Python 패키지 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# jq 설치
RUN apt-get update && apt-get install -y jq curl

# 소스 복사
COPY . .

# 포트 노출
EXPOSE 8000

# 엔트리포인트 스크립트 실행 권한
RUN chmod +x /app/entrypoint.sh

# 엔트리포인트
ENTRYPOINT ["/app/entrypoint.sh"]