#!/bin/bash

# ============================================
# 완전한 Frontend-Backend 통신 테스트 스크립트
# ============================================

echo "🚀 Frontend-Backend 통신 테스트 시작"
echo "===================================="

# API URL 설정
API_URL="http://localhost:8000/api/board/posts"

echo ""
echo "📝 1단계: 게시글 생성 (CREATE)"
echo "----------------------------"
RESPONSE=$(curl -s -X POST $API_URL/ \
  -H "Content-Type: application/json" \
  -d '{
    "title": "자동 테스트 게시글",
    "content": "이 게시글은 테스트 스크립트로 생성되었습니다.",
    "author": "테스트봇"
  }')

echo "$RESPONSE" | jq
POST_ID=$(echo "$RESPONSE" | jq -r '.id')
echo "✅ 생성된 게시글 ID: $POST_ID"

echo ""
echo "📖 2단계: 게시글 목록 조회 (READ ALL)"
echo "----------------------------"
curl -s $API_URL/ | jq '.results[] | {id, title, author, view_count}'

echo ""
echo "🔍 3단계: 특정 게시글 조회 (READ ONE)"
echo "----------------------------"
echo "게시글 ID $POST_ID 조회 중..."
curl -s $API_URL/$POST_ID/ | jq

echo ""
echo "👀 조회수 증가 확인"
echo "다시 조회..."
RESPONSE2=$(curl -s $API_URL/$POST_ID/)
VIEW_COUNT=$(echo "$RESPONSE2" | jq -r '.view_count')
echo "✅ 현재 조회수: $VIEW_COUNT"

echo ""
echo "✏️ 4단계: 게시글 수정 (UPDATE)"
echo "----------------------------"
UPDATED=$(curl -s -X PUT $API_URL/$POST_ID/ \
  -H "Content-Type: application/json" \
  -d '{
    "title": "수정된 테스트 게시글",
    "content": "내용이 수정되었습니다!",
    "author": "테스트봇"
  }')

echo "$UPDATED" | jq
echo "✅ 게시글이 수정되었습니다"

echo ""
echo "🗑️ 5단계: 게시글 삭제 (DELETE)"
echo "----------------------------"
DELETE_RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE $API_URL/$POST_ID/)
HTTP_CODE=$(echo "$DELETE_RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" = "204" ]; then
    echo "✅ 게시글이 삭제되었습니다 (HTTP 204)"
else
    echo "❌ 삭제 실패 (HTTP $HTTP_CODE)"
fi

echo ""
echo "🔍 삭제 확인"
DELETED_CHECK=$(curl -s -w "\n%{http_code}" $API_URL/$POST_ID/)
CHECK_CODE=$(echo "$DELETED_CHECK" | tail -n 1)

if [ "$CHECK_CODE" = "404" ]; then
    echo "✅ 게시글이 정상적으로 삭제되었습니다 (HTTP 404)"
else
    echo "⚠️ 예상치 못한 결과 (HTTP $CHECK_CODE)"
fi

echo ""
echo "📊 6단계: Health Check"
echo "----------------------------"
curl -s $API_URL/health/ | jq

echo ""
echo "🎉 테스트 완료!"
echo "===================================="

echo ""
echo "💾 PostgreSQL 데이터베이스 확인:"
docker-compose exec -T db psql -U postgres -d webboard -c \
  "SELECT COUNT(*) as total_posts FROM board_post;"

echo ""
echo "🌐 웹 브라우저로 확인:"
echo "   Frontend: http://localhost"
echo "   Backend API: http://localhost:8000/api/board/posts/"
echo "   Django Admin: http://localhost:8000/admin"