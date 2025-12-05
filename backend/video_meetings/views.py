# backend/video_meetings/views.py (수정 버전)

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Q
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import json

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
    
    def retrieve(self, request, *args, **kwargs):
        """
        회의실 상세 조회 - 방장이 처음 입장하면 자동으로 회의 시작
        """
        room = self.get_object()
        
        # ⭐ 방장이 처음 입장하면 자동으로 active 상태로 변경
        if room.host == request.user and room.status == 'waiting':
            room.status = 'active'
            room.started_at = timezone.now()
            room.save()
            print(f"🎬 방장 입장 - 회의 자동 시작: {room.title}")
        
        serializer = self.get_serializer(room)
        return Response(serializer.data)
    
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
        """
        회의 참가 요청 - 요청 즉시 방장에게 WebSocket 알림 전송
        """
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
            return Response(
                {'detail': '방장은 자동으로 참가됩니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        existing = room.participants.filter(user=user).first()
        if existing:
            if existing.status == 'approved':
                return Response(
                    {'detail': '이미 승인되었습니다.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            elif existing.status == 'pending':
                serializer = ParticipantSerializer(existing)
                return Response(serializer.data, status=status.HTTP_200_OK)
        
        try:
            participant, created = RoomParticipant.objects.get_or_create(
                room=room,
                user=user,
                defaults={'status': 'pending'}
            )
            
            print(f"✅ 참가 요청 생성: {participant.id}")
            
            # WebSocket을 통해 방장에게 즉시 알림 전송
            channel_layer = get_channel_layer()
            room_group_name = f'video_room_{room.id}'
            
            async_to_sync(channel_layer.group_send)(
                room_group_name,
                {
                    'type': 'join_request_notification',
                    'participant_id': participant.id,
                    'username': user.username,
                    'message': f'{user.username}님이 참가를 요청했습니다.'
                }
            )
            
            print(f"📢 WebSocket 알림 전송 완료: {user.username} → 방장")
            
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
        """
        참가 승인 - 승인 즉시 참가자에게 WebSocket 알림 전송
        """
        room = self.get_object()
        
        print(f"\n{'='*60}")
        print(f"✅ 승인 요청")
        print(f"   방장: {request.user.username}")
        print(f"   방 ID: {room.id}")
        print(f"{'='*60}\n")
        
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
        
        print(f"✅ 승인 완료: {participant.user.username}")
        
        # WebSocket을 통해 참가자에게 즉시 승인 알림 전송
        channel_layer = get_channel_layer()
        room_group_name = f'video_room_{room.id}'
        
        async_to_sync(channel_layer.group_send)(
            room_group_name,
            {
                'type': 'approval_notification',
                'participant_username': participant.user.username,
                'message': '참가가 승인되었습니다.'
            }
        )
        
        print(f"📢 WebSocket 승인 알림 전송 완료: {participant.user.username}")
        
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
        
        # WebSocket 알림 전송
        channel_layer = get_channel_layer()
        room_group_name = f'video_room_{room.id}'
        
        async_to_sync(channel_layer.group_send)(
            room_group_name,
            {
                'type': 'rejection_notification',
                'participant_username': participant.user.username,
                'message': '참가가 거부되었습니다.'
            }
        )
        
        print(f"✅ 거부 완료: {participant.user.username}")
        
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
        
        if room.host != request.user:
            return Response(
                {'detail': '방장만 조회할 수 있습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        pending = room.participants.filter(status='pending')
        serializer = ParticipantSerializer(pending, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def send_signal(self, request, pk=None):
        """WebRTC 신호 전송"""
        room = self.get_object()
        
        is_authorized = (
            room.host == request.user or
            room.participants.filter(user=request.user, status='approved').exists()
        )
        
        if not is_authorized:
            return Response(
                {'detail': '참가자만 신호를 전송할 수 있습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        message_type = request.data.get('message_type')
        payload = request.data.get('payload')
        receiver_username = request.data.get('receiver_username')
        
        print(f"\n{'='*60}")
        print(f"📤 시그널 전송 요청")
        print(f"   Type: {message_type}")
        print(f"   From: {request.user.username}")
        print(f"   To: {receiver_username or 'all'}")
        print(f"   Payload Type: {type(payload)}")
        print(f"   Payload: {str(payload)[:100]}...")
        print(f"{'='*60}\n")
        
        # ⭐⭐⭐ 핵심 수정: payload가 None이거나 'undefined' 문자열인 경우 처리
        if payload is None or payload == 'undefined' or payload == '':
            print(f"⚠️ Payload가 비어있음 - 빈 객체로 설정")
            payload = {}
        
        # ⭐⭐⭐ payload가 문자열이면 파싱 시도, 아니면 그대로 사용
        if isinstance(payload, str):
            try:
                payload_data = json.loads(payload)
            except json.JSONDecodeError:
                print(f"⚠️ Payload JSON 파싱 실패 - 빈 객체로 설정")
                payload_data = {}
        else:
            payload_data = payload
        
        receiver = None
        if receiver_username:
            from django.contrib.auth.models import User
            try:
                receiver = User.objects.get(username=receiver_username)
            except User.DoesNotExist:
                print(f"   ⚠️ Receiver 없음: {receiver_username}")
        
        try:
            signal = SignalMessage.objects.create(
                room=room,
                sender=request.user,
                receiver=receiver,
                message_type=message_type,
                data=payload_data  # ⭐ 이미 파싱된 딕셔너리 저장
            )
            
            print(f"✅ 시그널 저장 완료: ID={signal.id}")
            
            serializer = SignalMessageSerializer(signal)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            print(f"❌ 시그널 저장 실패: {e}")
            import traceback
            traceback.print_exc()
            return Response(
                {'detail': f'시그널 전송 실패: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def get_signals(self, request, pk=None):
        """신호 메시지 조회"""
        room = self.get_object()
        
        is_authorized = (
            room.host == request.user or
            room.participants.filter(user=request.user, status='approved').exists()
        )
        
        if not is_authorized:
            return Response(
                {'detail': '참가자만 신호를 조회할 수 있습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # 최근 1시간 이내의 시그널 조회
        since = timezone.now() - timezone.timedelta(hours=1)
        
        signals = room.signals.filter(
            Q(receiver=request.user) | Q(receiver__isnull=True),
            created_at__gte=since
        ).order_by('created_at')
        
        serializer = SignalMessageSerializer(signals, many=True)
        return Response(serializer.data)