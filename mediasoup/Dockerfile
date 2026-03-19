# mediasoup/Dockerfile
FROM node:20-alpine

# mediasoup 빌드에 필요한 네이티브 도구
RUN apk add --no-cache python3 make g++ linux-headers

WORKDIR /app

# 의존성 먼저 복사 (레이어 캐시 활용)
COPY package*.json ./
RUN npm install --omit=dev

COPY src/ ./src/

# 비루트 유저로 실행
RUN addgroup -S sfu && adduser -S sfu -G sfu
USER sfu

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
