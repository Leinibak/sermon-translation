# backend/video_meetings/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VideoRoomViewSet

router = DefaultRouter()
router.register(r'', VideoRoomViewSet, basename='video-meeting')

urlpatterns = [
    path('', include(router.urls)),
]

# 생성되는 URL:
# GET    /api/video-meetings/                              - 회의실 목록
# POST   /api/video-meetings/                              - 회의실 생성
# GET    /api/video-meetings/{id}/                         - 회의실 상세
# PUT    /api/video-meetings/{id}/                         - 회의실 수정
# DELETE /api/video-meetings/{id}/                         - 회의실 삭제
# POST   /api/video-meetings/{id}/start/                   - 회의 시작
# POST   /api/video-meetings/{id}/end/                     - 회의 종료
# POST   /api/video-meetings/{id}/join_request/            - 참가 요청
# POST   /api/video-meetings/{id}/approve_participant/     - 참가 승인
# POST   /api/video-meetings/{id}/reject_participant/      - 참가 거부
# POST   /api/video-meetings/{id}/leave/                   - 퇴장
# GET    /api/video-meetings/{id}/pending_requests/        - 대기 요청 목록
# POST   /api/video-meetings/{id}/send_signal/             - WebRTC 시그널 전송
# GET    /api/video-meetings/{id}/get_signals/             - 시그널 조회