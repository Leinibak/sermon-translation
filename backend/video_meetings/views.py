# backend/video_meetings/views.py (개선 버전)

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

from .models import (
    VideoRoom, RoomParticipant, SignalMessage,
    ChatMessage, Reaction, RaisedHand
)
from .serializers import (
    VideoRoomListSerializer,
    VideoRoomDetailSerializer,
    VideoRoomCreateSerializer,
    ParticipantSerializer,
    SignalMessageSerializer,
    ChatMessageSerializer,
    ReactionSerializer,
    RaisedHandSerializer
)


class VideoRoomViewSet(viewsets.ModelViewSet):
    """화상회의방 ViewSet"""
    queryset = VideoRoom.objects.all()
    permission_classes = [IsAuthenticated]
    pagination_class = None  # Pagination 비활성화
    
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
        """
        회의실 생성 시 방장 자동 설정
        ⭐ 빈 문자열 처리 개선
        """
        try:
            # ⭐ 빈 문자열을 None으로 변환
            validated_data = serializer.validated_data.copy()
            
            # description이 빈 문자열이면 제거
            if 'description' in validated_data and not validated_data['description']:
                validated_data['description'] = ''
            
            # password가 빈 문자열이면 제거
            if 'password' in validated_data and not validated_data['password']:
                validated_data.pop('password', None)
            
            # scheduled_time이 빈 문자열이면 제거
            if 'scheduled_time' in validated_data and not validated_data['scheduled_time']:
                validated_data.pop('scheduled_time', None)
            
            # max_participants 기본값 설정
            if 'max_participants' not in validated_data or validated_data['max_participants'] is None:
                validated_data['max_participants'] = 10
            
            print(f"✅ 회의실 생성 데이터: {validated_data}")
            
            # 회의실 생성 (host는 현재 사용자)
            room = serializer.save(host=self.request.user, **validated_data)
            
            print(f"✅ 회의실 생성 완료: {room.id} - {room.title}")
            
        except Exception as e:
            print(f"❌ 회의실 생성 실패: {str(e)}")
            raise
    
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
        """회의 종료 (방장만 가능)"""
        room = self.get_object()
        
        # 권한 확인
        if room.host != request.user:
            return Response(
                {'detail': '방장만 회의를 종료할 수 있습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # ⭐ 상태 업데이트
        room.status = 'ended'
        room.ended_at = timezone.now()
        room.save()
        
        print(f'✅ 회의 종료: {room.title} (상태: {room.status})')
        
        # 모든 참가자 퇴장 처리
        updated_count = room.participants.filter(status='approved').update(
            status='left',
            left_at=timezone.now()
        )
        
        print(f'📤 {updated_count}명의 참가자 퇴장 처리 완료')
        
        # WebSocket 알림
        channel_layer = get_channel_layer()
        room_group_name = f'video_room_{room.id}'
        
        try:
            async_to_sync(channel_layer.group_send)(
                room_group_name,
                {
                    'type': 'meeting_ended',
                    'message': '회의가 종료되었습니다.',
                    'ended_by': request.user.username
                }
            )
            print('📡 회의 종료 알림 전송 완료')
        except Exception as e:
            print(f"⚠️ WebSocket 알림 실패: {e}")
        
        serializer = self.get_serializer(room)
        return Response(serializer.data)
        
    @action(detail=True, methods=['post'])  # ⭐ 누락된 데코레이터 추가!
    def reject_participant(self, request, pk=None):
        """⭐ 참가 거부 (WebSocket 알림 수정)"""
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
        
        print(f"✅ 참가 거부: {participant.user.username}")
        
        # WebSocket 알림
        channel_layer = get_channel_layer()
        room_group_name = f'video_room_{room.id}'
        
        try:
            async_to_sync(channel_layer.group_send)(
                room_group_name,
                {
                    'type': 'rejection_notification',
                    'participant_username': participant.user.username,
                    'message': '참가가 거부되었습니다.'
                }
            )
            print(f"📡 거부 알림 전송 완료: {participant.user.username}")
        except Exception as e:
            print(f"⚠️ WebSocket 알림 실패: {e}")
        
        serializer = ParticipantSerializer(participant)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def join_request(self, request, pk=None):
        """회의 참가 요청"""
        room = self.get_object()
        user = request.user
        
        # ⭐ 방장은 자동 참가 (요청 불필요)
        if room.host == user:
            return Response(
                {'detail': '방장은 자동으로 참가됩니다.'},
                status=status.HTTP_200_OK
            )
        
        # ⭐ 기존 요청 확인 (개선)
        existing = room.participants.filter(user=user).first()
        
        if existing:
            # 이미 승인된 경우
            if existing.status == 'approved':
                serializer = ParticipantSerializer(existing)
                return Response(serializer.data, status=status.HTTP_200_OK)
            
            # 대기 중인 경우
            elif existing.status == 'pending':
                serializer = ParticipantSerializer(existing)
                return Response(serializer.data, status=status.HTTP_200_OK)
            
            # 거부된 경우 - 새로 요청 가능하도록 상태 변경
            elif existing.status == 'rejected':
                existing.status = 'pending'
                existing.save()
                
                serializer = ParticipantSerializer(existing)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            
            # 퇴장한 경우 - 재참가 요청
            elif existing.status == 'left':
                existing.status = 'pending'
                existing.joined_at = None
                existing.left_at = None
                existing.save()
                
                serializer = ParticipantSerializer(existing)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
        
        # ⭐ 최대 참가자 수 확인 (대기 중인 사람은 제외)
        approved_count = room.participants.filter(status='approved').count()
        if approved_count >= room.max_participants:
            return Response(
                {'detail': '최대 참가자 수를 초과했습니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # ⭐ 새 참가 요청 생성
            participant = RoomParticipant.objects.create(
                room=room,
                user=user,
                status='pending'
            )
            
            print(f"✅ 참가 요청 생성: {user.username} → {room.title}")
            
            # ⭐ WebSocket 알림
            channel_layer = get_channel_layer()
            room_group_name = f'video_room_{room.id}'
            
            try:
                async_to_sync(channel_layer.group_send)(
                    room_group_name,
                    {
                        'type': 'join_request_notification',
                        'participant_id': participant.id,
                        'username': user.username,
                        'message': f'{user.username}님이 참가를 요청했습니다.'
                    }
                )
                print(f"📡 참가 요청 알림 전송 완료")
            except Exception as e:
                print(f"⚠️ WebSocket 알림 실패: {e}")
            
            serializer = ParticipantSerializer(participant)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            print(f"❌ 참가 요청 생성 중 오류: {str(e)}")
            return Response(
                {'detail': f'참가 요청 생성 실패: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def approve_participant(self, request, pk=None):
        """참가 승인 (로그 강화 + 알림 개선)"""
        room = self.get_object()
        
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
        
        # 최대 참가자 수 확인
        approved_count = room.participants.filter(status='approved').count()
        if approved_count >= room.max_participants:
            return Response(
                {'detail': '최대 참가자 수를 초과했습니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # ⭐ 승인 처리
        participant.status = 'approved'
        participant.joined_at = timezone.now()
        participant.save()
        
        print(f"\n{'='*60}")
        print(f"✅ 참가 승인 완료")
        print(f"   User: {participant.user.username}")
        print(f"   User ID: {participant.user.id}")
        print(f"   Room: {room.title}")
        print(f"   Room ID: {room.id}")
        print(f"{'='*60}\n")
        
        # ⭐⭐⭐ WebSocket 알림 개선
        channel_layer = get_channel_layer()
        room_group_name = f'video_room_{room.id}'
        
        try:
            print(f"📡 WebSocket 알림 전송 시작")
            print(f"   Group: {room_group_name}")
            print(f"   Target User: {participant.user.username} (ID: {participant.user.id})")
            
            # ⭐ 1. 참가자 본인에게 승인 알림
            async_to_sync(channel_layer.group_send)(
                room_group_name,
                {
                    'type': 'approval_notification',
                    'participant_user_id': str(participant.user.id),
                    'participant_username': participant.user.username,
                    'message': '참가가 승인되었습니다. 잠시 후 자동으로 입장됩니다.',
                    'room_id': str(room.id),
                    'host_username': room.host.username
                }
            )
            print(f"✅ 1. 승인 알림 전송 완료 → {participant.user.username}")
            
            # ⭐ 2. 짧은 대기 (참가자가 준비할 시간)
            time.sleep(0.3)
            
            # ⭐ 3. 방장에게 새 참가자 알림
            async_to_sync(channel_layer.group_send)(
                room_group_name,
                {
                    'type': 'new_participant_approved',
                    'participant_username': participant.user.username,
                    'participant_user_id': str(participant.user.id),
                    'host_username': room.host.username
                }
            )
            print(f"✅ 2. 방장 알림 전송 완료")
            
            # ⭐ 4. 전체 참가자에게 입장 알림 (선택사항)
            time.sleep(0.2)
            async_to_sync(channel_layer.group_send)(
                room_group_name,
                {
                    'type': 'user_joined',
                    'user_id': str(participant.user.id),
                    'username': participant.user.username,
                    'timestamp': datetime.now().isoformat()
                }
            )
            print(f"✅ 3. 전체 입장 알림 전송 완료")
            
        except Exception as e:
            print(f"⚠️ WebSocket 알림 실패: {e}")
            import traceback
            traceback.print_exc()
        
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
        
        # 권한 확인
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
        payload = request.data.get('payload', '{}')
        receiver_username = request.data.get('receiver_username')
        
        # payload 검증 및 변환
        if payload is None or payload == 'undefined' or payload == '':
            payload_data = {}
        elif isinstance(payload, str):
            try:
                payload_data = json.loads(payload)
            except json.JSONDecodeError:
                payload_data = {}
        else:
            payload_data = payload
        
        # receiver 확인
        receiver = None
        if receiver_username:
            from django.contrib.auth.models import User
            try:
                receiver = User.objects.get(username=receiver_username)
            except User.DoesNotExist:
                pass
        
        try:
            signal = SignalMessage.objects.create(
                room=room,
                sender=request.user,
                receiver=receiver,
                message_type=message_type,
                data=payload_data
            )
            
            serializer = SignalMessageSerializer(signal)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            print(f"❌ 시그널 저장 실패: {e}")
            return Response(
                {'detail': f'시그널 전송 실패: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def get_signals(self, request, pk=None):
        """신호 메시지 조회"""
        room = self.get_object()
        
        # 권한 확인
        is_authorized = (
            room.host == request.user or
            room.participants.filter(user=request.user, status='approved').exists()
        )
        
        if not is_authorized:
            return Response(
                {'detail': '참가자만 신호를 조회할 수 있습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # 최근 5분 이내의 시그널만 조회 (성능 개선)
        since = timezone.now() - timezone.timedelta(minutes=5)
        
        signals = room.signals.filter(
            Q(receiver=request.user) | Q(receiver__isnull=True),
            created_at__gte=since
        ).order_by('created_at')
        
        serializer = SignalMessageSerializer(signals, many=True)
        return Response(serializer.data)
    
    # =========================================================================
    # ⭐⭐⭐ 채팅 기능 (신규 추가)
    # =========================================================================
    
    @action(detail=True, methods=['get'], url_path='chat/messages')
    def get_chat_messages(self, request, pk=None):
        """채팅 메시지 목록 조회"""
        room = self.get_object()
        
        messages = room.chat_messages.filter(
            message_type='text'
        ).order_by('created_at')
        
        serializer = ChatMessageSerializer(
            messages, 
            many=True, 
            context={'request': request}
        )
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], url_path='chat/send')
    def send_chat_message(self, request, pk=None):
        """채팅 메시지 전송"""
        room = self.get_object()
        content = request.data.get('content', '').strip()
        
        if not content:
            return Response(
                {'detail': '메시지 내용이 필요합니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        message = ChatMessage.objects.create(
            room=room,
            sender=request.user,
            message_type='text',
            content=content
        )
        
        # WebSocket 알림
        channel_layer = get_channel_layer()
        room_group_name = f'video_room_{room.id}'
        
        try:
            async_to_sync(channel_layer.group_send)(
                room_group_name,
                {
                    'type': 'chat_message_notification',
                    'message_id': message.id,
                    'sender': request.user.username,
                    'content': content,
                    'created_at': message.created_at.isoformat()
                }
            )
        except Exception as e:
            print(f"⚠️ 채팅 WebSocket 알림 실패: {e}")
        
        serializer = ChatMessageSerializer(message, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    # =========================================================================
    # ⭐⭐⭐ 반응 기능 (신규 추가)
    # =========================================================================
    
    @action(detail=True, methods=['post'], url_path='reactions/send')
    def send_reaction(self, request, pk=None):
        """반응 전송"""
        room = self.get_object()
        reaction_type = request.data.get('reaction_type')
        
        if not reaction_type:
            return Response(
                {'detail': '반응 타입이 필요합니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        reaction = Reaction.objects.create(
            room=room,
            user=request.user,
            reaction_type=reaction_type
        )
        
        # WebSocket 알림
        channel_layer = get_channel_layer()
        room_group_name = f'video_room_{room.id}'
        
        try:
            async_to_sync(channel_layer.group_send)(
                room_group_name,
                {
                    'type': 'reaction_notification',
                    'username': request.user.username,
                    'reaction': reaction_type
                }
            )
        except Exception as e:
            print(f"⚠️ 반응 WebSocket 알림 실패: {e}")
        
        serializer = ReactionSerializer(reaction)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    # =========================================================================
    # ⭐⭐⭐ 손들기 기능 (신규 추가)
    # =========================================================================
    
    @action(detail=True, methods=['get'], url_path='raised-hands')
    def get_raised_hands(self, request, pk=None):
        """손든 사용자 목록 조회"""
        room = self.get_object()
        
        raised_hands = room.raised_hands.filter(
            is_active=True
        ).order_by('raised_at')
        
        serializer = RaisedHandSerializer(raised_hands, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], url_path='raise-hand')
    def raise_hand(self, request, pk=None):
        """손들기"""
        room = self.get_object()
        
        # 이미 손을 들었는지 확인
        existing = room.raised_hands.filter(
            user=request.user,
            is_active=True
        ).first()
        
        if existing:
            return Response(
                {'detail': '이미 손을 들었습니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 새로 손들기 또는 기존 레코드 재활성화
        raised_hand, created = RaisedHand.objects.update_or_create(
            room=room,
            user=request.user,
            defaults={
                'is_active': True,
                'raised_at': timezone.now(),
                'lowered_at': None
            }
        )
        
        # WebSocket 알림
        channel_layer = get_channel_layer()
        room_group_name = f'video_room_{room.id}'
        
        try:
            async_to_sync(channel_layer.group_send)(
                room_group_name,
                {
                    'type': 'hand_raise_notification',
                    'action': 'raise',
                    'username': request.user.username
                }
            )
        except Exception as e:
            print(f"⚠️ 손들기 WebSocket 알림 실패: {e}")
        
        serializer = RaisedHandSerializer(raised_hand)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'], url_path='lower-hand')
    def lower_hand(self, request, pk=None):
        """손내리기"""
        room = self.get_object()
        
        raised_hand = room.raised_hands.filter(
            user=request.user,
            is_active=True
        ).first()
        
        if not raised_hand:
            return Response(
                {'detail': '손을 들지 않았습니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        raised_hand.is_active = False
        raised_hand.lowered_at = timezone.now()
        raised_hand.save()
        
        # WebSocket 알림
        channel_layer = get_channel_layer()
        room_group_name = f'video_room_{room.id}'
        
        try:
            async_to_sync(channel_layer.group_send)(
                room_group_name,
                {
                    'type': 'hand_raise_notification',
                    'action': 'lower',
                    'username': request.user.username
                }
            )
        except Exception as e:
            print(f"⚠️ 손내리기 WebSocket 알림 실패: {e}")
        
        serializer = RaisedHandSerializer(raised_hand)
        return Response(serializer.data)