# backend/video_meetings/consumers.py (수정 버전)
import asyncio
import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from datetime import datetime

logger = logging.getLogger(__name__)

class VideoMeetingConsumer(AsyncWebsocketConsumer):
    """WebSocket Consumer - 모든 시그널링 통합"""
    
    async def connect(self):
        """WebSocket 연결 수립"""
        try:
            self.room_id = self.scope['url_route']['kwargs']['room_id']
            self.room_group_name = f'video_room_{self.room_id}'
            self.user = self.scope.get('user')
            
            self.user_id = None
            self.username = None
            
            if not self.user or not self.user.is_authenticated:
                logger.warning(f"❌ 비인증 사용자 연결 시도: Room {self.room_id}")
                await self.close(code=4001)
                return
            
            self.user_id = str(self.user.id)
            self.username = self.user.username
            
            logger.info(f"🔗 WebSocket 연결 시도: {self.username} → Room {self.room_id}")
            
            # 그룹에 참가
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )
            
            await self.accept()
            logger.info(f"✅ WebSocket 연결 성공: {self.username} → Room {self.room_id}")
            
            # 현재 참가자 목록 전송
            await self.send_current_participants()
            
        except Exception as e:
            logger.error(f"❌ 연결 오류: {e}", exc_info=True)
            await self.close(code=4000)
    
    async def disconnect(self, close_code):
        """WebSocket 연결 종료"""
        try:
            username = getattr(self, 'username', 'Unknown')
            user_id = getattr(self, 'user_id', None)
            room_group_name = getattr(self, 'room_group_name', None)
            
            logger.info(f"❌ WebSocket 종료: {username} (코드: {close_code})")
            
            # 퇴장 알림
            if user_id and room_group_name:
                await self.channel_layer.group_send(
                    room_group_name,
                    {
                        'type': 'user_left',
                        'user_id': user_id,
                        'username': username
                    }
                )
            
            # 그룹에서 제거
            if room_group_name:
                await self.channel_layer.group_discard(
                    room_group_name,
                    self.channel_name
                )
        except Exception as e:
            logger.error(f"❌ 연결 종료 오류: {e}", exc_info=True)
    
    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            if not message_type:
                logger.warning(f"⚠️ 메시지 타입 없음")
                return
            
            logger.debug(f"📨 수신: {message_type} from {self.username}")
            
            # WebRTC 시그널링
            if message_type in ['offer', 'answer', 'ice_candidate']:
                await self.handle_webrtc_signal(data)
            
            # ⭐ join_ready 처리
            elif message_type == 'join_ready':
                await self.handle_join_ready(data)
            
            # join
            elif message_type == 'join':
                await self.handle_join(data)
            
            # 채팅
            elif message_type == 'chat':
                await self.handle_chat_message(data)
            
            # 반응
            elif message_type == 'reaction':
                await self.handle_reaction(data)
            
            # 손들기
            elif message_type == 'raise_hand':
                await self.handle_raise_hand(data)
            elif message_type == 'lower_hand':
                await self.handle_lower_hand(data)
            
            # ping
            elif message_type == 'ping':
                await self.handle_ping()
            
            else:
                logger.warning(f"⚠️ 알 수 없는 타입: {message_type}")
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ JSON 파싱 실패: {e}")
        except Exception as e:
            logger.error(f"❌ 메시지 처리 오류: {e}", exc_info=True)

    # =========================================================================
    # WebRTC 시그널링
    # =========================================================================
    
    async def handle_webrtc_signal(self, data):
        """WebRTC 시그널 처리 (Offer, Answer, ICE)"""
        signal_type = data.get('type')
        to_user_id = data.get('to_user_id')
        
        logger.info(f"📡 WebRTC 시그널: {signal_type} from {self.username} to {to_user_id or 'all'}")
        
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'webrtc_signal',
                'signal_type': signal_type,
                'from_user_id': self.username,
                'to_user_id': to_user_id,
                'data': data,
                'timestamp': datetime.now().isoformat()
            }
        )
    
    # =========================================================================
    # 메시지 핸들러
    # =========================================================================
    
    async def handle_join(self, data):
        """참가 알림 처리"""
        logger.info(f"👋 사용자 입장: {self.username}")
        
        # 모든 참가자에게 입장 알림
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'user_joined',
                'user_id': self.user_id,
                'username': self.username,
                'timestamp': datetime.now().isoformat()
            }
        )
    
    async def handle_chat_message(self, data):
        """채팅 메시지 처리"""
        content = data.get('content', '').strip()
        
        if not content or len(content) > 1000:
            return
        
        message_id = await self.save_chat_message(content)
        
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'chat_message',
                'message_id': message_id,
                'sender': self.username,
                'sender_id': self.user_id,
                'content': content,
                'created_at': datetime.now().isoformat()
            }
        )
    
    async def handle_reaction(self, data):
        """반응 처리"""
        reaction_type = data.get('reaction_type')
        
        if not reaction_type:
            return
        
        await self.save_reaction(reaction_type)
        
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'reaction',
                'username': self.username,
                'reaction': reaction_type,
                'timestamp': datetime.now().isoformat()
            }
        )
    
    async def handle_raise_hand(self, data):
        """손들기 처리"""
        await self.save_raise_hand(True)
        
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'hand_raise',
                'action': 'raise',
                'username': self.username,
                'user_id': self.user_id,
                'timestamp': datetime.now().isoformat()
            }
        )
    
    async def handle_lower_hand(self, data):
        """손내리기 처리"""
        await self.save_raise_hand(False)
        
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'hand_raise',
                'action': 'lower',
                'username': self.username,
                'user_id': self.user_id,
                'timestamp': datetime.now().isoformat()
            }
        )
    
    async def handle_ping(self):
        """핑 응답"""
        await self.send(text_data=json.dumps({
            'type': 'pong',
            'timestamp': datetime.now().isoformat()
        }))
            
    # ⭐⭐⭐ join_ready 핸들러
    async def handle_join_ready(self, data):
        """
        참가자가 준비 완료 시그널 전송
        방장에게만 전달
        """
        to_user_id = data.get('to_user_id') or data.get('to_username')
        from_user_id = data.get('from_user_id', self.username)
        
        logger.info(f"📥 join_ready: {from_user_id} → {to_user_id}")
        
        # ⭐ 방장에게만 전달
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'join_ready_notification',
                'from_user_id': from_user_id,
                'to_user_id': to_user_id,
                'timestamp': datetime.now().isoformat()
            }
        )
        
        logger.info(f"✅ join_ready 전달 완료")
    
    # =========================================================================
    # 그룹 메시지 핸들러
    # =========================================================================
    
    async def user_joined(self, event):
        """참가 알림 - 자신 제외"""
        if event['user_id'] != self.user_id:
            await self.send(text_data=json.dumps({
                'type': 'user_joined',
                'user_id': event['user_id'],
                'username': event['username'],
                'timestamp': event.get('timestamp')
            }))
    
    async def user_left(self, event):
        """퇴장 알림"""
        if event['user_id'] != self.user_id:
            await self.send(text_data=json.dumps({
                'type': 'user_left',
                'user_id': event['user_id'],
                'username': event['username']
            }))
    
    async def webrtc_signal(self, event):
        """WebRTC 시그널 전달"""
        to_user_id = event.get('to_user_id')
        from_user_id = event.get('from_user_id')
        
        # 자신의 시그널은 무시
        if from_user_id == self.username:
            return
        
        # 수신자 확인
        if to_user_id and to_user_id != self.username:
            return
        
        await self.send(text_data=json.dumps({
            'type': event['signal_type'],
            'from_user_id': from_user_id,
            'to_user_id': to_user_id,
            **event['data']
        }))
    
    async def chat_message(self, event):
        """채팅 메시지 알림"""
        await self.send(text_data=json.dumps({
            'type': 'chat_message',
            'message_id': event['message_id'],
            'sender': event['sender'],
            'sender_id': event['sender_id'],
            'content': event['content'],
            'created_at': event['created_at'],
            'is_mine': event['sender_id'] == self.user_id
        }))
    
    async def reaction(self, event):
        """반응 알림"""
        await self.send(text_data=json.dumps({
            'type': 'reaction',
            'username': event['username'],
            'reaction': event['reaction'],
            'timestamp': event.get('timestamp')
        }))
    
    async def hand_raise(self, event):
        """손들기 알림"""
        await self.send(text_data=json.dumps({
            'type': 'hand_raise',
            'action': event['action'],
            'username': event['username'],
            'user_id': event['user_id'],
            'timestamp': event.get('timestamp')
        }))

    # ⭐ 그룹 메시지 핸들러
    async def join_ready_notification(self, event):
        """join_ready 알림 - 방장에게만"""
        to_user_id = event.get('to_user_id')
        
        # ⭐ 방장 여부 확인
        if self.username == to_user_id:
            logger.info(f"👑 방장에게 join_ready 전달: from {event['from_user_id']}")
            
            await self.send(text_data=json.dumps({
                'type': 'join_ready',
                'from_username': event['from_user_id'],
                'timestamp': event.get('timestamp')
            }))
        else:
            logger.debug(f"⚠️ 방장 아님: {self.username} vs {to_user_id}")

    async def approval_notification(self, event):
        """참가 승인 알림"""
        participant_user_id = event.get('participant_user_id')
        room_id = event.get('room_id')
        
        logger.info(f"📬 approval_notification")
        logger.info(f"   Room: {room_id} (current: {self.room_id})")
        logger.info(f"   Participant: {participant_user_id}")
        logger.info(f"   Current User: {self.user.id}")
        
        # ⭐ 방 ID 검증
        if str(room_id) != str(self.room_id):
            logger.warning(f"⚠️ 방 ID 불일치 - 알림 무시")
            return
        
        # ⭐ 사용자 ID 검증
        if str(self.user.id) == str(participant_user_id):
            logger.info(f"🎉 승인 대상자 - 알림 전송")
            
            await self.send(text_data=json.dumps({
                'type': 'approval_notification',
                'approved': True,
                'message': event['message'],
                'room_id': str(room_id),
                'host_username': event.get('host_username'),
                'timestamp': datetime.now().isoformat(),
                'participant_username': event.get('participant_username'),
                'participant_user_id': str(participant_user_id),
                'should_initialize': True
            }))
            
            logger.info(f"✅ 승인 알림 전송 완료")
        else:
            logger.debug(f"⚠️ 승인 대상 아님")
            
    async def new_participant_approved(self, event):
        """⭐ 새 참가자 승인 알림 (방장용)"""
        # 방장인지 확인
        is_host = await self.check_is_host()
        
        if is_host:
            await self.send(text_data=json.dumps({
                'type': 'new_participant_approved',
                'participant_username': event['participant_username'],
                'participant_user_id': event['participant_user_id'],
                'message': f"{event['participant_username']}님이 참가했습니다.",
                'timestamp': datetime.now().isoformat()
            }))
            logger.info(f"📡 방장에게 알림 전송: {event['participant_username']}")                    

    async def rejection_notification(self, event):
        """참가 거부 알림"""
        participant_user_id = event.get('participant_user_id')
        
        if str(self.user.id) == str(participant_user_id):
            await self.send(text_data=json.dumps({
                'type': 'rejection_notification',
                'rejected': True,
                'message': event['message']
            }))
    
    async def join_request_notification(self, event):
        """참가 요청 알림 (방장에게만)"""
        is_host = await self.check_is_host()
        
        if is_host:
            await self.send(text_data=json.dumps({
                'type': 'join_request_notification',
                'participant_id': event['participant_id'],
                'username': event['username'],
                'message': event['message']
            }))
    
    async def meeting_ended(self, event):
        """회의 종료 알림"""
        await self.send(text_data=json.dumps({
            'type': 'meeting_ended',
            'message': event['message'],
            'ended_by': event.get('ended_by')
        }))
    
    # =========================================================================
    # 유틸리티 메서드
    # =========================================================================
    
    async def send_current_participants(self):
        """현재 참가자 목록 전송"""
        participants = await self.get_participants()
        
        await self.send(text_data=json.dumps({
            'type': 'participants_list',
            'participants': participants
        }))
    
    @database_sync_to_async
    def check_is_host(self):
        """방장 여부 확인"""
        from .models import VideoRoom
        try:
            room = VideoRoom.objects.get(id=self.room_id)
            return room.host == self.user
        except:
            return False
    
    @database_sync_to_async
    def get_participants(self):
        """참가자 목록 조회"""
        from .models import RoomParticipant
        
        return list(
            RoomParticipant.objects.filter(
                room_id=self.room_id,
                status='approved'
            ).values('user__username', 'user__id')
        )
    
    @database_sync_to_async
    def save_chat_message(self, content):
        """채팅 메시지 DB 저장"""
        from .models import ChatMessage
        
        message = ChatMessage.objects.create(
            room_id=self.room_id,
            sender=self.user,
            content=content,
            message_type='text'
        )
        return message.id
    
    @database_sync_to_async
    def save_reaction(self, reaction_type):
        """반응 DB 저장"""
        from .models import Reaction
        
        Reaction.objects.create(
            room_id=self.room_id,
            user=self.user,
            reaction_type=reaction_type
        )
    
    @database_sync_to_async
    def save_raise_hand(self, is_raised):
        """손들기 상태 저장"""
        from .models import RaisedHand
        from django.utils import timezone
        
        obj, created = RaisedHand.objects.update_or_create(
            room_id=self.room_id,
            user=self.user,
            defaults={
                'is_active': is_raised,
                'raised_at': timezone.now() if is_raised else None,
                'lowered_at': None if is_raised else timezone.now()
            }
        )