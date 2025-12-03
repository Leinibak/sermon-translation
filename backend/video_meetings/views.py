# backend/video_meetings/views.py (수정)

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Q

from .models import VideoRoom, RoomParticipant, SignalMessage
from .serializers import (
    VideoRoomListSerializer,
    VideoRoomDetailSerializer,
    VideoRoomCreateSerializer,
    ParticipantSerializer,
    SignalMessageSerializer
)


class VideoRoomViewSet(viewsets.ModelViewSet):
    """화상회의방 ViewSet"""
    queryset = VideoRoom.objects.all()
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'list':
            return VideoRoomListSerializer
        elif self.action == 'create':
            return VideoRoomCreateSerializer
        return VideoRoomDetailSerializer
       
    def get_queryset(self):
        """활성 회의실만 조회"""
        return VideoRoom.objects.filter(
            status__in=['waiting', 'active']
        ).order_by('-created_at')
    
    def perform_create(self, serializer):
        """방 생성 시 방장 자동 설정"""
        serializer.save(host=self.request.user)
    
    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """회의 시작"""
        room = self.get_object()
        
        if room.host != request.user:
            return Response(
                {'detail': '방장만 회의를 시작할 수 있습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        room.status = 'active'
        room.started_at = timezone.now()
        room.save()
        
        serializer = self.get_serializer(room)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def end(self, request, pk=None):
        """회의 종료"""
        room = self.get_object()
        
        if room.host != request.user:
            return Response(
                {'detail': '방장만 회의를 종료할 수 있습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        room.status = 'ended'
        room.ended_at = timezone.now()
        room.save()
        
        room.participants.filter(status='approved').update(
            status='left',
            left_at=timezone.now()
        )
        
        serializer = self.get_serializer(room)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def join_request(self, request, pk=None):
        """회의 참가 요청"""
        room = self.get_object()
        user = request.user
        
        print(f"\n{'='*60}")
        print(f"🔔 참가 요청 시작")
        print(f"   방 ID: {room.id}")
        print(f"   방 제목: {room.title}")
        print(f"   방장: {room.host.username}")
        print(f"   요청자: {user.username}")
        print(f"{'='*60}\n")
        
        if room.host == user:
            print("❌ 방장은 참가 요청 불가")
            return Response(
                {'detail': '방장은 자동으로 참가됩니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        existing = room.participants.filter(user=user).first()
        if existing:
            print(f"⚠️ 기존 참가자 발견: ID={existing.id}, Status={existing.status}")
            if existing.status == 'approved':
                return Response(
                    {'detail': '이미 승인되었습니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            elif existing.status == 'pending':
                # 이미 대기중이면 기존 객체 반환
                serializer = ParticipantSerializer(existing)
                return Response(serializer.data, status=status.HTTP_200_OK)
        
        try:
            participant, created = RoomParticipant.objects.get_or_create(
                room=room,
                user=user,
                defaults={'status': 'pending'}
            )
            
            print(f"\n{'='*60}")
            print(f"✅ 참가 요청 처리 완료")
            print(f"   Created: {created}")
            print(f"   Participant ID: {participant.id}")
            print(f"   Status: {participant.status}")
            print(f"   Username: {participant.user.username}")
            print(f"   Room: {participant.room.title}")
            print(f"{'='*60}\n")
            
            # DB에 실제로 저장되었는지 확인
            saved_participant = RoomParticipant.objects.filter(
                room=room, 
                user=user,
                status='pending'
            ).first()
            
            if saved_participant:
                print(f"✅ DB 확인: 참가자가 정상적으로 저장됨 (ID: {saved_participant.id})")
            else:
                print(f"❌ DB 확인: 참가자를 찾을 수 없음!")
            
            serializer = ParticipantSerializer(participant)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            print(f"❌ 참가 요청 생성 중 오류: {str(e)}")
            import traceback
            traceback.print_exc()
            return Response(
                {'detail': f'참가 요청 생성 실패: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def approve_participant(self, request, pk=None):
        """참가 승인"""
        room = self.get_object()
        
        print(f"✅ 승인 요청: 방장={request.user.username}")  # 디버깅
        
        if room.host != request.user:
            return Response(
                {'detail': '방장만 참가를 승인할 수 있습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        participant_id = request.data.get('participant_id')
        if not participant_id:
            return Response(
                {'detail': 'participant_id가 필요합니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        participant = get_object_or_404(
            RoomParticipant,
            id=participant_id,
            room=room
        )
        
        approved_count = room.participants.filter(status='approved').count()
        if approved_count >= room.max_participants:
            return Response(
                {'detail': '최대 참가자 수를 초과했습니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        participant.status = 'approved'
        participant.joined_at = timezone.now()
        participant.save()
        
        print(f"✅ 승인 완료: {participant.user.username}")  # 디버깅
        
        serializer = ParticipantSerializer(participant)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def reject_participant(self, request, pk=None):
        """참가 거부"""
        room = self.get_object()
        
        if room.host != request.user:
            return Response(
                {'detail': '방장만 참가를 거부할 수 있습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        participant_id = request.data.get('participant_id')
        participant = get_object_or_404(
            RoomParticipant,
            id=participant_id,
            room=room
        )
        
        participant.status = 'rejected'
        participant.save()
        
        serializer = ParticipantSerializer(participant)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def leave(self, request, pk=None):
        """회의 퇴장"""
        room = self.get_object()
        user = request.user
        
        participant = get_object_or_404(
            RoomParticipant,
            room=room,
            user=user
        )
        
        participant.status = 'left'
        participant.left_at = timezone.now()
        participant.save()
        
        return Response({'detail': '퇴장했습니다.'})
    
    @action(detail=True, methods=['get'])
    def pending_requests(self, request, pk=None):
        """승인 대기중인 참가 요청 목록"""
        room = self.get_object()
        
        print(f"\n{'='*60}")
        print(f"📋 대기 요청 조회 시작")
        print(f"   방 ID: {room.id}")
        print(f"   방 제목: {room.title}")
        print(f"   요청자: {request.user.username}")
        print(f"   방장 여부: {room.host == request.user}")
        print(f"{'='*60}\n")
        
        if room.host != request.user:
            return Response(
                {'detail': '방장만 조회할 수 있습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # 전체 참가자 확인
        all_participants = room.participants.all()
        print(f"📊 전체 참가자 수: {all_participants.count()}")
        for p in all_participants:
            print(f"   - {p.user.username}: {p.status} (ID: {p.id})")
        
        # pending 상태만 필터링
        pending = room.participants.filter(status='pending')
        print(f"\n⏳ Pending 참가자 수: {pending.count()}")
        for p in pending:
            print(f"   - {p.user.username}: {p.status} (ID: {p.id}, Created: {p.created_at})")
        
        print(f"{'='*60}\n")
        
        serializer = ParticipantSerializer(pending, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def send_signal(self, request, pk=None):
        """WebRTC 신호 전송"""
        room = self.get_object()
        
        if not room.participants.filter(
            user=request.user,
            status='approved'
        ).exists() and room.host != request.user:
            return Response(
                {'detail': '참가자만 신호를 전송할 수 있습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = SignalMessageSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                room=room,
                sender=request.user
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['get'])
    def get_signals(self, request, pk=None):
        """신호 메시지 조회"""
        room = self.get_object()
        
        if not room.participants.filter(
            user=request.user,
            status='approved'
        ).exists() and room.host != request.user:
            return Response(
                {'detail': '참가자만 신호를 조회할 수 있습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        since = timezone.now() - timezone.timedelta(hours=1)
        signals = room.signals.filter(
            Q(receiver=request.user) | Q(receiver__isnull=True),
            created_at__gte=since
        )
        
        serializer = SignalMessageSerializer(signals, many=True)
        return Response(serializer.data)