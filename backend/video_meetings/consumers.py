# backend/video_meetings/consumers.py (핵심 수정)
import asyncio
import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from datetime import datetime
from django.utils import timezone

logger = logging.getLogger(__name__)

class VideoMeetingConsumer(AsyncWebsocketConsumer):
    """WebSocket Consumer - 참가자 간 연결 수정"""
    
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
            
            self.user_id = self.user.id
            self.username = self.user.username
            
            logger.info(f"🔗 WebSocket 연결: {self.username} (ID: {self.user_id}) → Room {self.room_id}")
            
            # 그룹에 참가
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )
            
            await self.accept()
            logger.info(f"✅ 연결 성공: {self.username}")
            
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
            if username and room_group_name:
                await self.channel_layer.group_send(
                    room_group_name,
                    {
                        'type': 'user_left',
                        'username': username,
                        'user_id': user_id,
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
            
            # ⭐⭐⭐ 새로 추가: track 상태 변경
            elif message_type == 'track_state':
                await self.handle_track_state(data)
            
            # join_ready 처리
            elif message_type == 'join_ready':
                await self.handle_join_ready(data)
            
            # join 처리
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

   
    # ⭐⭐⭐ 그룹 메시지 핸들러 추가
    async def track_state_changed(self, event):
        """
        Track 상태 변경 알림 - 자신 제외
        """
        if event['username'] != self.username:
            await self.send(text_data=json.dumps({
                'type': 'track_state',
                'username': event['username'],
                'user_id': event['user_id'],
                'kind': event['kind'],
                'enabled': event['enabled'],
                'timestamp': event.get('timestamp')
            }))
    
    # =========================================================================
    # ⭐⭐⭐ WebRTC 시그널링 (핵심 수정)
    # =========================================================================
    
    async def handle_webrtc_signal(self, data):
        """
        WebRTC 신호 처리 (Offer, Answer, ICE)
        """
        signal_type = data.get('type')
        to_username = data.get('to_username')
        
        logger.info(f"📡 WebRTC 시그널: {signal_type}")
        logger.info(f"   From: {self.username} (ID: {self.user_id})")
        logger.info(f"   To: {to_username or 'ALL'}")
        
        # ⭐⭐⭐ 명확한 필드명 사용
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'webrtc_signal',
                'signal_type': signal_type,
                'from_username': self.username,
                'from_user_id': self.user_id,
                'to_username': to_username,
                'data': data,
                'timestamp': datetime.now().isoformat()
            }
        )
    
    # ⭐⭐⭐ 새로 추가: Track 상태 동기화
    async def handle_track_state(self, data):
        """
        마이크/비디오 상태 변경을 모든 참가자에게 브로드캐스트
        """
        track_kind = data.get('kind')  # 'audio' or 'video'
        enabled = data.get('enabled')  # True or False
        
        logger.info(f"🎚️ Track 상태 변경: {self.username}")
        logger.info(f"   Kind: {track_kind}")
        logger.info(f"   Enabled: {enabled}")
        
        # 모든 참가자에게 브로드캐스트
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'track_state_changed',
                'username': self.username,
                'user_id': self.user_id,
                'kind': track_kind,
                'enabled': enabled,
                'timestamp': datetime.now().isoformat()
            }
        )

    # =========================================================================
    # ⭐⭐⭐ join_ready 처리 (핵심 수정)
    # =========================================================================
       
    async def handle_join_ready(self, data):
        """
        참가자가 준비 완료 시그널 전송
        ⭐ 모든 참가자에게 브로드캐스트 (방장 포함)
        """
        to_username = data.get('to_username')  # 방장 username
        
        logger.info(f"\n{'='*60}")
        logger.info(f"🔥 join_ready 수신")
        logger.info(f"   From: {self.username} (참가자)")
        logger.info(f"   To: {to_username} (방장)")
        logger.info(f"{'='*60}\n")
        
        # ⭐⭐⭐ 방장 확인
        is_host = await self.check_is_host_by_username(to_username)
        
        if not is_host:
            logger.warning(f"⚠️ {to_username}은 방장이 아님")
            return
        
        # ⭐⭐⭐ 그룹 전송 (방장만 수신하도록 필터링)
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'join_ready_notification',
                'from_username': self.username,
                'from_user_id': self.user_id,
                'to_username': to_username,
                'timestamp': datetime.now().isoformat()
            }
        )
        
        logger.info(f"✅ join_ready 전송 완료: {self.username} → {to_username}")

    # ⭐⭐⭐ 핵심 수정: join 핸들러
    async def handle_join(self, data):
        """
        참가 알림 처리
        ⭐⭐⭐ 모든 승인된 참가자에게 브로드캐스트
        """
        logger.info(f"\n{'='*60}")
        logger.info(f"👋 사용자 입장: {self.username} (ID: {self.user_id})")
        logger.info(f"{'='*60}\n")
        
        # ⭐⭐⭐ 승인된 참가자인지 확인
        is_approved = await self.check_is_approved()
        
        if not is_approved:
            logger.warning(f"⚠️ {self.username}은 아직 승인되지 않음")
            return
        
        # ⭐⭐⭐ 모든 참가자에게 입장 알림 브로드캐스트
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'user_joined',
                'username': self.username,
                'user_id': self.user_id,
                'timestamp': datetime.now().isoformat()
            }
        )
        
        logger.info(f"✅ 입장 알림 브로드캐스트 완료: {self.username}")
        
        # ⭐⭐⭐ 기존 참가자 목록 전송 (자신 제외)
        current_participants = await self.get_approved_participants()
        
        other_participants = [
            p for p in current_participants 
            if p['user__username'] != self.username
        ]
        
        if other_participants:
            logger.info(f"📋 기존 참가자 {len(other_participants)}명에게 알림")
            
            for participant in other_participants:
                peer_username = participant['user__username']
                logger.info(f"   → {peer_username}")
    
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
                'sender_username': self.username,
                'sender_user_id': self.user_id,
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
        try:
            await self.save_raise_hand(True)
            
            logger.info(f"✋ {self.username} 손들기 완료")
            
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
            
        except Exception as e:
            logger.error(f"❌ 손들기 실패: {e}", exc_info=True)

    async def handle_lower_hand(self, data):
        """손내리기 처리"""
        try:
            await self.save_raise_hand(False)
            
            logger.info(f"👋 {self.username} 손내리기 완료")
            
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
            
        except Exception as e:
            logger.error(f"❌ 손내리기 실패: {e}", exc_info=True)
  
    async def handle_ping(self):
        """핑 응답"""
        await self.send(text_data=json.dumps({
            'type': 'pong',
            'timestamp': datetime.now().isoformat()
        }))
    
    # =========================================================================
    # ⭐⭐⭐ 그룹 메시지 핸들러 (수정)
    # =========================================================================
    
    async def user_joined(self, event):
        """
        참가 알림 - 자신 제외
        ⭐ username 비교
        """
        if event['username'] != self.username:
            logger.info(f"📢 {event['username']} 입장 알림 수신")
            
            await self.send(text_data=json.dumps({
                'type': 'user_joined',
                'username': event['username'],
                'user_id': event['user_id'],
                'timestamp': event.get('timestamp')
            }))
    
    async def user_left(self, event):
        """
        퇴장 알림
        ⭐ username 비교
        """
        if event['username'] != self.username:
            await self.send(text_data=json.dumps({
                'type': 'user_left',
                'username': event['username'],
                'user_id': event['user_id']
            }))
    
    async def webrtc_signal(self, event):
        """
        WebRTC 시그널 전달
        ⭐⭐⭐ username 기반 필터링
        """
        from_username = event.get('from_username')
        to_username = event.get('to_username')
        
        # 자신의 시그널은 무시
        if from_username == self.username:
            return
        
        # 수신자 확인 (브로드캐스트 또는 특정 수신자)
        if to_username and to_username != self.username:
            return
        
        logger.info(f"📤 WebRTC 시그널 전달: {event['signal_type']}")
        logger.info(f"   From: {from_username} → To: {self.username}")
        
        # ⭐⭐⭐ 클라이언트에 전달
        await self.send(text_data=json.dumps({
            'type': event['signal_type'],
            'from_username': from_username,
            'from_user_id': event.get('from_user_id'),
            'to_username': to_username,
            **event['data']  # SDP, candidate 등
        }))
    
    async def chat_message(self, event):
        """채팅 메시지 알림"""
        await self.send(text_data=json.dumps({
            'type': 'chat_message',
            'message_id': event['message_id'],
            'sender_username': event['sender_username'],
            'sender_user_id': event['sender_user_id'],
            'content': event['content'],
            'created_at': event['created_at'],
            'is_mine': event['sender_username'] == self.username
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
        """손들기/내리기 알림"""
        await self.send(text_data=json.dumps({
            'type': 'hand_raise',
            'action': event['action'],
            'username': event['username'],
            'user_id': event['user_id'],
            'timestamp': event.get('timestamp'),
            'is_me': event['username'] == self.username
        }))

    async def join_ready_notification(self, event):
        """
        join_ready 알림 - 방장에게만
        ⭐ username 비교로 필터링
        """
        to_username = event.get('to_username')
        from_username = event.get('from_username')
        
        logger.info(f"\n{'='*60}")
        logger.info(f"📬 join_ready_notification 처리")
        logger.info(f"   Current User: {self.username}")
        logger.info(f"   Target (방장): {to_username}")
        logger.info(f"   From (참가자): {from_username}")
        logger.info(f"{'='*60}\n")
        
        # ⭐⭐⭐ 방장인지 확인 (username 비교)
        if self.username == to_username:
            logger.info(f"👑 방장 확인 - join_ready 전달")
            
            await self.send(text_data=json.dumps({
                'type': 'join_ready',
                'from_username': from_username,
                'from_user_id': event.get('from_user_id'),
                'timestamp': event.get('timestamp')
            }))
            
            logger.info(f"✅ join_ready 전송 완료: {from_username} → {self.username}")
        else:
            logger.debug(f"⚠️ 방장 아님 - 무시")

    async def approval_notification(self, event):
        """
        참가 승인 알림
        ⭐ DB ID로 비교
        """
        participant_user_id = event.get('participant_user_id')
        room_id = event.get('room_id')
        
        logger.info(f"\n{'='*60}")
        logger.info(f"📬 approval_notification 수신")
        logger.info(f"   Room: {room_id}")
        logger.info(f"   Target User ID: {participant_user_id}")
        logger.info(f"   Current User ID: {self.user_id}")
        logger.info(f"   Current Username: {self.username}")
        logger.info(f"{'='*60}\n")
        
        # 방 ID 검증
        if str(room_id) != str(self.room_id):
            logger.warning(f"⚠️ 방 ID 불일치")
            return
        
        # ⭐⭐⭐ DB ID로 비교
        try:
            if int(participant_user_id) == int(self.user_id):
                logger.info(f"🎉 승인 대상자 확인 - 알림 전송")
                
                notification = {
                    'type': 'approval_notification',
                    'approved': True,
                    'message': event['message'],
                    'room_id': str(room_id),
                    'host_username': event.get('host_username'),
                    'timestamp': event.get('timestamp') or datetime.now().isoformat(),
                    'participant_username': event.get('participant_username'),
                    'participant_user_id': participant_user_id,
                    'should_initialize': True,
                }
                
                # 3회 전송
                for i in range(3):
                    notification['retry_count'] = i
                    await self.send(text_data=json.dumps(notification))
                    logger.info(f"✅ 승인 알림 전송 ({i+1}/3)")
                    
                    if i < 2:
                        await asyncio.sleep(0.5)
            else:
                logger.debug(f"⚠️ 승인 대상 아님")
                
        except (ValueError, TypeError) as e:
            logger.error(f"❌ ID 비교 오류: {e}")

    async def new_participant_approved(self, event):
        """새 참가자 승인 알림 (방장용)"""
        is_host = await self.check_is_host()
        
        if is_host:
            await self.send(text_data=json.dumps({
                'type': 'new_participant_approved',
                'participant_username': event['participant_username'],
                'participant_user_id': event['participant_user_id'],
                'message': f"{event['participant_username']}님이 참가했습니다.",
                'timestamp': datetime.now().isoformat()
            }))

    async def rejection_notification(self, event):
        """참가 거부 알림"""
        participant_user_id = event.get('participant_user_id')
        
        if int(participant_user_id) == int(self.user_id):
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
        participants = await self.get_approved_participants()
        
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
    def check_is_host_by_username(self, username):
        """특정 사용자가 방장인지 확인"""
        from .models import VideoRoom
        from django.contrib.auth.models import User
        try:
            room = VideoRoom.objects.get(id=self.room_id)
            user = User.objects.get(username=username)
            return room.host == user
        except:
            return False
        
    @database_sync_to_async
    def check_is_approved(self):
        """⭐⭐⭐ 승인된 참가자인지 확인"""
        from .models import RoomParticipant, VideoRoom
        try:
            # 방장은 자동 승인
            room = VideoRoom.objects.get(id=self.room_id)
            if room.host == self.user:
                return True
            
            # 참가자는 승인 상태 확인
            participant = RoomParticipant.objects.filter(
                room_id=self.room_id,
                user=self.user,
                status='approved'
            ).exists()
            
            return participant
        except:
            return False
    
    @database_sync_to_async
    def get_approved_participants(self):
        """⭐⭐⭐ 승인된 참가자 목록 조회"""
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
        
        try:
            if is_raised:
                obj, created = RaisedHand.objects.update_or_create(
                    room_id=self.room_id,
                    user=self.user,
                    defaults={
                        'is_active': True,
                        'raised_at': timezone.now(),
                        'lowered_at': None
                    }
                )
                logger.info(f"✅ DB 저장: {self.username} 손들기")
            else:
                obj, created = RaisedHand.objects.update_or_create(
                    room_id=self.room_id,
                    user=self.user,
                    defaults={
                        'is_active': False,
                        'lowered_at': timezone.now()
                    }
                )
                logger.info(f"✅ DB 저장: {self.username} 손내리기")
                
        except Exception as e:
            logger.error(f"❌ DB 저장 실패: {e}", exc_info=True)
            raise