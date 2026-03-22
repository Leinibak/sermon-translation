# mediasoup/Dockerfile
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    gcc \
    g++ \
    make \
    cmake \
    ninja-build \
    pkg-config \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# prebuilt 다운로드 끄고 무조건 로컬 컴파일
ENV MEDIASOUP_SKIP_WORKER_PREBUILT_DOWNLOAD=true

RUN npm install --omit=dev

COPY src/ ./src/

EXPOSE 3000

# wget 대신 node로 헬스체크 (외부 도구 의존 없음)
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]