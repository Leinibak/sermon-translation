# backend/video_meetings/consumers.py (개선 버전)
import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.core.cache import cache
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class VideoMeetingConsumer(AsyncWebsocketConsumer):
    """
    개선된 WebSocket Consumer
    - 메모리 누수 방지
    - 연결 상태 추적
    - 에러 핸들링 강화
    """
    
    async def connect(self):
        """WebSocket 연결 수립"""
        self.room_id = self.scope['url_route']['kwargs']['room_id']
        self.room_group_name = f'video_room_{self.room_id}'
        self.user = self.scope.get('user')
        self.user_id = None
        self.username = None
        self.connection_time = datetime.now()
        
        # 인증 확인
        if not self.user or not self.user.is_authenticated:
            logger.warning(f"❌ 비인증 사용자의 WebSocket 연결 시도: Room {self.room_id}")
            await self.close(code=4001)
            return
        
        self.user_id = str(self.user.id)
        self.username = self.user.username
        
        # 중복 연결 체크 및 방지
        connection_key = f"ws_conn_{self.room_id}_{self.user_id}"
        existing_connection = cache.get(connection_key)
        
        if existing_connection:
            logger.info(f"⚠️ 기존 연결 발견 - 교체: {self.username} in Room {self.room_id}")
            # 기존 연결에 종료 신호 전송
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'force_disconnect',
                    'user_id': self.user_id,
                    'reason': 'duplicate_connection'
                }
            )
        
        # 연결 정보 저장 (1시간 TTL)
        cache.set(connection_key, {
            'channel_name': self.channel_name,
            'connected_at': self.connection_time.isoformat(),
            'username': self.username
        }, timeout=3600)
        
        # 그룹에 참가
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        await self.accept()
        
        # 연결 성공 로그
        logger.info(f"✅ WebSocket 연결: {self.username} → Room {self.room_id}")
        
        # 현재 참가자 목록 전송
        await self.send_current_participants()
    
    async def disconnect(self, close_code):
        """WebSocket 연결 종료"""
        if not hasattr(self, 'room_group_name'):
            return
        
        # 연결 시간 계산
        duration = datetime.now() - self.connection_time if hasattr(self, 'connection_time') else timedelta(0)
        
        logger.info(
            f"❌ WebSocket 연결 종료: {self.username if hasattr(self, 'username') else 'Unknown'} "
            f"(코드: {close_code}, 지속시간: {duration.total_seconds():.1f}초)"
        )
        
        # 캐시에서 연결 정보 제거
        if hasattr(self, 'user_id'):
            connection_key = f"ws_conn_{self.room_id}_{self.user_id}"
            cache.delete(connection_key)
        
        # 퇴장 알림 전송
        if hasattr(self, 'user_id') and hasattr(self, 'username'):
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'user_left',
                    'user_id': self.user_id,
                    'username': self.username
                }
            )
        
        # 그룹에서 제거
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
    
    async def receive(self, text_data):
        """메시지 수신 및 처리"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            if not message_type:
                logger.warning(f"⚠️ 메시지 타입 없음: {self.username}")
                await self.send_error('message_type_required')
                return
            
            # Rate limiting 체크
            if not await self.check_rate_limit(message_type):
                logger.warning(f"⚠️ Rate limit 초과: {self.username} - {message_type}")
                await self.send_error('rate_limit_exceeded')
                return
            
            logger.debug(f"📨 메시지 수신: {message_type} from {self.username}")
            
            # 메시지 타입별 라우팅
            handler = {
                'join': self.handle_join,
                'offer': self.handle_webrtc_signal,
                'answer': self.handle_webrtc_signal,
                'ice_candidate': self.handle_webrtc_signal,
                'chat': self.handle_chat_message,
                'reaction': self.handle_reaction,
                'raise_hand': self.handle_raise_hand,
                'lower_hand': self.handle_lower_hand,
                'screen_share_start': self.handle_screen_share,
                'screen_share_stop': self.handle_screen_share,
                'ping': self.handle_ping,
            }.get(message_type)
            
            if handler:
                await handler(data)
            else:
                logger.warning(f"⚠️ 알 수 없는 메시지 타입: {message_type}")
                await self.send_error('unknown_message_type')
        
        except json.JSONDecodeError as e:
            logger.error(f"❌ JSON 파싱 실패: {e}")
            await self.send_error('invalid_json')
        except Exception as e:
            logger.error(f"❌ 메시지 처리 오류: {e}", exc_info=True)
            await self.send_error('internal_error')
    
    # =========================================================================
    # 메시지 핸들러
    # =========================================================================
    
    async def handle_join(self, data):
        """참가 알림 처리"""
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'user_joined',
                'user_id': self.user_id,
                'username': self.username,
                'timestamp': datetime.now().isoformat()
            }
        )
    
    async def handle_webrtc_signal(self, data):
        """WebRTC 시그널링 처리"""
        signal_type = data.get('type')
        to_user_id = data.get('to_user_id')
        
        # 페이로드 검증
        if 'sdp' in data or 'candidate' in data:
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'webrtc_signal',
                    'signal_type': signal_type,
                    'from_user_id': self.user_id,
                    'from_username': self.username,
                    'to_user_id': to_user_id,
                    'data': data,
                    'timestamp': datetime.now().isoformat()
                }
            )
        else:
            logger.warning(f"⚠️ 잘못된 WebRTC 시그널: {signal_type}")
    
    async def handle_chat_message(self, data):
        """채팅 메시지 처리"""
        content = data.get('content', '').strip()
        
        if not content or len(content) > 1000:
            await self.send_error('invalid_message_content')
            return
        
        # DB에 저장
        message_id = await self.save_chat_message(content)
        
        # 브로드캐스트
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'chat_message_notification',
                'message_id': message_id,
                'sender': self.username,
                'content': content,
                'created_at': datetime.now().isoformat()
            }
        )
    
    async def handle_reaction(self, data):
        """반응 처리"""
        reaction_type = data.get('reaction_type')
        
        if not reaction_type:
            return
        
        # DB에 저장
        await self.save_reaction(reaction_type)
        
        # 브로드캐스트
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'reaction_notification',
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
                'type': 'hand_raise_notification',
                'action': 'raise',
                'username': self.username,
                'timestamp': datetime.now().isoformat()
            }
        )
    
    async def handle_lower_hand(self, data):
        """손내리기 처리"""
        await self.save_raise_hand(False)
        
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'hand_raise_notification',
                'action': 'lower',
                'username': self.username,
                'timestamp': datetime.now().isoformat()
            }
        )
    
    async def handle_screen_share(self, data):
        """화면 공유 처리"""
        action = 'start' if data.get('type') == 'screen_share_start' else 'stop'
        
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'screen_share_notification',
                'action': action,
                'username': self.username,
                'message': f'{self.username}님이 화면 공유를 {"시작" if action == "start" else "종료"}했습니다.'
            }
        )
    
    async def handle_ping(self, data):
        """핑 응답"""
        await self.send(text_data=json.dumps({
            'type': 'pong',
            'timestamp': datetime.now().isoformat()
        }))
    
    # =========================================================================
    # 그룹 메시지 핸들러
    # =========================================================================
    
    async def user_joined(self, event):
        """참가 알림"""
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
        
        # 수신자 확인
        if to_user_id and to_user_id != self.user_id:
            return
        
        await self.send(text_data=json.dumps({
            'type': event['signal_type'],
            'from_user_id': event['from_user_id'],
            'from_username': event['from_username'],
            **event['data']
        }))
    
    async def chat_message_notification(self, event):
        """채팅 메시지 알림"""
        await self.send(text_data=json.dumps({
            'type': 'chat_message',
            'message_id': event['message_id'],
            'sender': event['sender'],
            'content': event['content'],
            'created_at': event['created_at']
        }))
    
    async def reaction_notification(self, event):
        """반응 알림"""
        await self.send(text_data=json.dumps({
            'type': 'reaction',
            'username': event['username'],
            'reaction': event['reaction'],
            'timestamp': event.get('timestamp')
        }))
    
    async def hand_raise_notification(self, event):
        """손들기 알림"""
        await self.send(text_data=json.dumps({
            'type': 'hand_raise',
            'action': event['action'],
            'username': event['username'],
            'timestamp': event.get('timestamp')
        }))
    
    async def screen_share_notification(self, event):
        """화면 공유 알림"""
        await self.send(text_data=json.dumps({
            'type': 'screen_share',
            'action': event['action'],
            'username': event['username'],
            'message': event['message']
        }))
    
    async def force_disconnect(self, event):
        """강제 연결 종료"""
        if event['user_id'] == self.user_id:
            logger.info(f"🔄 중복 연결로 인한 강제 종료: {self.username}")
            await self.send(text_data=json.dumps({
                'type': 'force_disconnect',
                'reason': event['reason']
            }))
            await self.close(code=4002)
    
    # =========================================================================
    # 유틸리티 메서드
    # =========================================================================
    
    async def send_error(self, error_type):
        """에러 메시지 전송"""
        await self.send(text_data=json.dumps({
            'type': 'error',
            'error': error_type
        }))
    
    async def check_rate_limit(self, message_type):
        """Rate limiting 체크"""
        rate_key = f"rate_{self.room_id}_{self.user_id}_{message_type}"
        count = cache.get(rate_key, 0)
        
        # 타입별 제한
        limits = {
            'chat': 10,  # 10개/초
            'reaction': 5,
            'default': 20
        }
        
        limit = limits.get(message_type, limits['default'])
        
        if count >= limit:
            return False
        
        cache.set(rate_key, count + 1, timeout=1)
        return True
    
    async def send_current_participants(self):
        """현재 참가자 목록 전송"""
        participants = await self.get_participants()
        
        await self.send(text_data=json.dumps({
            'type': 'participants_list',
            'participants': participants
        }))
    
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