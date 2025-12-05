# video_meetings/consumers.py (알림 핸들러 추가)
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

class VideoMeetingConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_id = self.scope['url_route']['kwargs']['room_id']
        self.room_group_name = f'video_room_{self.room_id}'
        self.user = self.scope.get('user')
        
        # 그룹에 참가
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        await self.accept()
        
        print(f"✅ WebSocket 연결: {self.user.username if self.user.is_authenticated else 'Anonymous'} → Room {self.room_id}")
    
    async def disconnect(self, close_code):
        # 그룹에서 나가기
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
        
        print(f"❌ WebSocket 연결 종료: {self.user.username if self.user.is_authenticated else 'Anonymous'}")
    
    async def receive(self, text_data):
        data = json.loads(text_data)
        message_type = data.get('type')
        
        if message_type == 'join':
            self.user_id = data.get('user_id')
            self.username = data.get('username')
            
            # 참가 알림
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'user_joined',
                    'user_id': self.user_id,
                    'username': self.username
                }
            )
        
        elif message_type in ['offer', 'answer', 'ice_candidate']:
            # WebRTC 시그널링 메시지 전달
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'webrtc_signal',
                    'signal_type': message_type,
                    'from_user_id': self.user_id,
                    'from_username': self.username,
                    'to_user_id': data.get('to_user_id'),
                    'data': data
                }
            )
    
    # =========================================================================
    # 알림 핸들러
    # =========================================================================
    
    async def join_request_notification(self, event):
        """참가 요청 알림 (방장에게)"""
        await self.send(text_data=json.dumps({
            'type': 'join_request',
            'participant_id': event['participant_id'],
            'username': event['username'],
            'message': event['message']
        }))
        print(f"📢 참가 요청 알림 전송: {event['username']}")
    
    async def approval_notification(self, event):
        """승인 알림 (참가자에게)"""
        # 해당 참가자에게만 전송
        if self.user.is_authenticated and self.user.username == event['participant_username']:
            await self.send(text_data=json.dumps({
                'type': 'approval',
                'message': event['message']
            }))
            print(f"📢 승인 알림 전송: {event['participant_username']}")
    
    # =========================================================================
    # 기존 핸들러
    # =========================================================================
    
    async def user_joined(self, event):
        """참가 메시지 전송"""
        if hasattr(self, 'user_id') and event['user_id'] != self.user_id:
            await self.send(text_data=json.dumps({
                'type': 'user_joined',
                'user_id': event['user_id'],
                'username': event['username']
            }))
    
    async def user_left(self, event):
        """퇴장 메시지 전송"""
        if hasattr(self, 'user_id') and event['user_id'] != self.user_id:
            await self.send(text_data=json.dumps({
                'type': 'user_left',
                'user_id': event['user_id'],
                'username': event['username']
            }))
    
    async def webrtc_signal(self, event):
        """WebRTC 시그널 전달"""
        to_user_id = event.get('to_user_id')
        
        if to_user_id and to_user_id != self.user_id:
            if to_user_id == self.user_id or not to_user_id:
                await self.send(text_data=json.dumps({
                    'type': event['signal_type'],
                    'from_user_id': event['from_user_id'],
                    'from_username': event['from_username'],
                    **event['data']
                }))