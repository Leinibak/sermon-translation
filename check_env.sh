#!/bin/bash

echo "🔍 환경변수 파일 확인..."

echo ""
echo "=== .env.production (루트) ==="
if [ -f .env.production ]; then
    echo "✅ 존재"
    echo "내용:"
    cat .env.production | grep -v "PASSWORD"
else
    echo "❌ 없음"
fi

echo ""
echo "=== backend/.env.production ==="
if [ -f backend/.env.production ]; then
    echo "✅ 존재"
    echo "내용:"
    cat backend/.env.production | grep -v "PASSWORD"
else
    echo "❌ 없음"
fi

echo ""
echo "=== frontend/.env.production ==="
if [ -f frontend/.env.production ]; then
    echo "✅ 존재"
    echo "내용:"
    cat frontend/.env.production
else
    echo "❌ 없음"
fi

echo ""
echo "🐳 Docker Compose 환경변수 검증..."
docker compose -f docker-compose.prod.yml config
