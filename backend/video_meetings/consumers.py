# backend/video_meetings/consumers.py
"""
VideoMeetingConsumer — SFU(mediasoup) 연동 버전

[수정 내역 — 이번 패치]
FIX-B2: handle_sfu_join — producers 키 camelCase 정규화 방어 코드 추가
FIX-B3: consumeProducer 실패 시 Consumer에서 sfu_error 응답 (로그만 남기던 것 수정)
FIX-B4: user_left setState 중첩 제거 → peerId는 user_left 이벤트에서 직접 포함
FIX-B5: handle_join — SFU 모드에서 join_request_notification 대신 peer_joined 전송
"""
import asyncio
import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from datetime import datetime
from django.utils import timezone

from . import sfu_client

logger = logging.getLogger(__name__)


class VideoMeetingConsumer(AsyncWebsocketConsumer):

    # ──────────────────────────────────────────────────────────
    # 연결 / 종료
    # ──────────────────────────────────────────────────────────

    async def connect(self):
        try:
            self.room_id = self.scope['url_route']['kwargs']['room_id']
            self.room_group_name = f'video_room_{self.room_id}'
            self.user = self.scope.get('user')

            if not self.user or not self.user.is_authenticated:
                await self.close(code=4001)
                return

            self.user_id = self.user.id
            self.username = self.user.username
            self.peer_id = f"user_{self.user_id}"

            await self.channel_layer.group_add(self.room_group_name, self.channel_name)
            await self.accept()

            logger.info(f"WS connected: {self.username} → room {self.room_id}")
            await self.send_current_participants()

        except Exception as e:
            logger.error(f"connect error: {e}", exc_info=True)
            await self.close(code=4000)

    async def disconnect(self, close_code):
        try:
            username = getattr(self, 'username', None)
            peer_id  = getattr(self, 'peer_id',   None)

            if username and hasattr(self, 'room_group_name'):
                if peer_id:
                    await sfu_client.leave_room(self.room_id, peer_id)

                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type':    'user_left',
                        'username': username,
                        'user_id':  self.user_id,
                        # FIX-B4: disconnect 시점에 peerId를 함께 전송
                        # → user_left() 핸들러가 동적 생성하므로 여기선 없어도 되지만
                        #   명시적으로 포함해 두어 혼란 방지
                        'peerId':  peer_id,
                    }
                )
                await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

        except Exception as e:
            logger.error(f"disconnect error: {e}", exc_info=True)

    # ──────────────────────────────────────────────────────────
    # 메시지 수신 라우터
    # ──────────────────────────────────────────────────────────

    async def receive(self, text_data):
        try:
            data     = json.loads(text_data)
            msg_type = data.get('type')
            if not msg_type:
                return

            if   msg_type == 'sfu_get_rtp_capabilities': await self.handle_get_rtp_capabilities()
            elif msg_type == 'sfu_join':                 await self.handle_sfu_join(data)
            elif msg_type == 'sfu_create_transport':     await self.handle_create_transport(data)
            elif msg_type == 'sfu_connect_transport':    await self.handle_connect_transport(data)
            elif msg_type == 'sfu_produce':              await self.handle_produce(data)
            elif msg_type == 'sfu_consume':              await self.handle_consume(data)
            elif msg_type == 'sfu_resume_consumer':      await self.handle_resume_consumer(data)
            elif msg_type == 'sfu_producer_pause':       await self.handle_producer_pause(data)
            elif msg_type == 'sfu_producer_resume':      await self.handle_producer_resume(data)
            elif msg_type == 'join':                     await self.handle_join(data)
            elif msg_type == 'join_ready':               await self.handle_join_ready(data)
            elif msg_type == 'track_state':              await self.handle_track_state(data)
            elif msg_type == 'chat':                     await self.handle_chat_message(data)
            elif msg_type == 'reaction':                 await self.handle_reaction(data)
            elif msg_type == 'raise_hand':               await self.handle_raise_hand(data)
            elif msg_type == 'lower_hand':               await self.handle_lower_hand(data)
            elif msg_type == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
            else:
                logger.warning(f"Unknown message type: {msg_type}")

        except json.JSONDecodeError:
            logger.error("JSON decode error")
        except Exception as e:
            logger.error(f"receive error: {e}", exc_info=True)

    # ──────────────────────────────────────────────────────────
    # SFU 시그널링 핸들러
    # ──────────────────────────────────────────────────────────

    async def handle_get_rtp_capabilities(self):
        try:
            rtp_capabilities = await sfu_client.get_rtp_capabilities(self.room_id)
            await self.send(text_data=json.dumps({
                'type': 'sfu_rtp_capabilities',
                'rtpCapabilities': rtp_capabilities,
            }))
        except Exception as e:
            await self._send_error('sfu_get_rtp_capabilities', str(e))

    async def handle_sfu_join(self, data):
        """
        SFU 방 참가 — 현재 Producer 목록 + username 매핑 반환.

        FIX-B2: sfu_client.join_room()이 이미 camelCase 정규화를 수행.
                여기서는 peerId 키 접근 시 방어 코드 추가.
        """
        try:
            result = await sfu_client.join_room(self.room_id, self.peer_id)

            producers_with_username = []
            for p in result['producers']:
                # FIX-B2: camelCase/snake_case 혼용 대응
                peer_id  = p.get('peerId') or p.get('peer_id', '')
                username = await self.get_username_by_peer_id(peer_id)
                producers_with_username.append({
                    'peerId':     peer_id,
                    'producerId': p.get('producerId') or p.get('producer_id', ''),
                    'kind':       p.get('kind', ''),
                    'paused':     p.get('paused', False),
                    'username':   username,
                })

            await self.send(text_data=json.dumps({
                'type': 'sfu_joined',
                'rtpCapabilities': result['rtpCapabilities'],
                'producers': producers_with_username,
            }))

            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type':     'peer_joined',
                    'peerId':   self.peer_id,
                    'username': self.username,
                    'userId':   self.user_id,
                }
            )
        except Exception as e:
            await self._send_error('sfu_join', str(e))

    async def handle_create_transport(self, data):
        try:
            transport_params = await sfu_client.create_transport(self.room_id, self.peer_id)
            await self.send(text_data=json.dumps({
                'type':      'sfu_transport_created',
                'direction': data.get('direction', 'send'),
                **transport_params,
            }))
        except Exception as e:
            await self._send_error('sfu_create_transport', str(e))

    async def handle_connect_transport(self, data):
        try:
            await sfu_client.connect_transport(
                self.room_id,
                self.peer_id,
                data['transportId'],
                data['dtlsParameters'],
            )
            await self.send(text_data=json.dumps({
                'type':        'sfu_transport_connected',
                'transportId': data['transportId'],
            }))
        except Exception as e:
            await self._send_error('sfu_connect_transport', str(e))

    async def handle_produce(self, data):
        try:
            result      = await sfu_client.create_producer(
                self.room_id,
                self.peer_id,
                data['transportId'],
                data['kind'],
                data['rtpParameters'],
                data.get('appData', {}),
            )
            producer_id = result['id']

            await self.send(text_data=json.dumps({
                'type': 'sfu_produced',
                'id':   producer_id,
                'kind': data['kind'],
            }))

            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type':       'new_producer',
                    'peerId':     self.peer_id,
                    'username':   self.username,
                    'userId':     self.user_id,
                    'producerId': producer_id,
                    'kind':       data['kind'],
                }
            )
        except Exception as e:
            await self._send_error('sfu_produce', str(e))

    async def handle_consume(self, data):
        """
        FIX-B3: sfu_client.create_consumer() 실패 시 sfu_error 응답.
                (기존에는 Consumer 예외가 silently fail 될 수 있었음)
        """
        try:
            result = await sfu_client.create_consumer(
                self.room_id,
                self.peer_id,
                data['producerPeerId'],
                data['producerId'],
                data['transportId'],
                data['rtpCapabilities'],
            )
            await self.send(text_data=json.dumps({
                'type': 'sfu_consumed',
                **result,
            }))
        except Exception as e:
            logger.error(
                f"handle_consume failed: consumer={self.peer_id} "
                f"producer={data.get('producerId')} err={e}"
            )
            await self._send_error('sfu_consume', str(e))

    async def handle_resume_consumer(self, data):
        try:
            await sfu_client.resume_consumer(self.room_id, self.peer_id, data['consumerId'])
            await self.send(text_data=json.dumps({
                'type':       'sfu_consumer_resumed',
                'consumerId': data['consumerId'],
            }))
        except Exception as e:
            await self._send_error('sfu_resume_consumer', str(e))

    async def handle_producer_pause(self, data):
        try:
            await sfu_client.pause_producer(self.room_id, self.peer_id, data['producerId'])
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type':      'track_state_changed',
                    'username':  self.username,
                    'user_id':   self.user_id,
                    'peerId':    self.peer_id,
                    'kind':      data.get('kind'),
                    'enabled':   False,
                    'timestamp': datetime.now().isoformat(),
                }
            )
        except Exception as e:
            await self._send_error('sfu_producer_pause', str(e))

    async def handle_producer_resume(self, data):
        try:
            await sfu_client.resume_producer(self.room_id, self.peer_id, data['producerId'])
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type':      'track_state_changed',
                    'username':  self.username,
                    'user_id':   self.user_id,
                    'peerId':    self.peer_id,
                    'kind':      data.get('kind'),
                    'enabled':   True,
                    'timestamp': datetime.now().isoformat(),
                }
            )
        except Exception as e:
            await self._send_error('sfu_producer_resume', str(e))

    # ──────────────────────────────────────────────────────────
    # Channel Layer 이벤트 핸들러
    # ──────────────────────────────────────────────────────────

    async def peer_joined(self, event):
        if event['peerId'] != self.peer_id:
            await self.send(text_data=json.dumps({
                'type':     'peer_joined',
                'peerId':   event['peerId'],
                'username': event['username'],
                'userId':   event['userId'],
            }))

    async def new_producer(self, event):
        if event['peerId'] != self.peer_id:
            await self.send(text_data=json.dumps({
                'type':       'new_producer',
                'peerId':     event['peerId'],
                'username':   event['username'],
                'userId':     event['userId'],
                'producerId': event['producerId'],
                'kind':       event['kind'],
            }))

    async def track_state_changed(self, event):
        if event['username'] != self.username:
            await self.send(text_data=json.dumps({
                'type':      'track_state',
                'username':  event['username'],
                'user_id':   event['user_id'],
                'peerId':    event.get('peerId', f"user_{event['user_id']}"),
                'kind':      event['kind'],
                'enabled':   event['enabled'],
                'timestamp': event.get('timestamp'),
            }))

    async def user_left(self, event):
        """
        FIX-B4: peerId를 항상 포함해서 프론트엔드 remoteStreams 키 탐색 보장.
                disconnect()가 group_send에 peerId를 포함하므로 그대로 전달.
                없을 경우 user_id로 생성 (방어 코드).
        """
        peer_id = event.get('peerId') or f"user_{event['user_id']}"
        await self.send(text_data=json.dumps({
            'type':     'user_left',
            'username': event['username'],
            'user_id':  event['user_id'],
            'peerId':   peer_id,
        }))

    async def meeting_ended(self, event):
        await self.send(text_data=json.dumps({
            'type':      'meeting_ended',
            'message':   event['message'],
            'ended_by':  event.get('ended_by'),
        }))

    # ──────────────────────────────────────────────────────────
    # 기존 참가 승인 흐름
    # ──────────────────────────────────────────────────────────

    async def handle_join(self, data):
        """
        FIX-B5: SFU 모드에서 join 메시지 처리.

        변경 전: 무조건 join_request_notification → 방장에게 참가 요청 재발송
        변경 후: 승인된 참가자 → peer_joined 브로드캐스트
                 미승인 참가자 → 기존대로 join_request_notification
        """
        is_approved = await self.check_is_approved()

        if is_approved:
            # 이미 승인됐으므로 SFU 입장 완료 알림만 브로드캐스트
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type':     'peer_joined',
                    'peerId':   self.peer_id,
                    'username': self.username,
                    'userId':   self.user_id,
                }
            )
        else:
            # 아직 승인 안 된 경우 — 방장에게 참가 요청 전송
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type':         'join_request_notification',
                    'participant_id': self.user_id,
                    'username':     self.username,
                    'message':      f"{self.username}님이 참가를 요청합니다.",
                }
            )

    async def handle_join_ready(self, data):
        """SFU 모드: 참가자 SFU 초기화 완료 → 방장에게 알림."""
        logger.info(f"join_ready received from {self.username} (SFU mode)")
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type':     'peer_joined',
                'peerId':   self.peer_id,
                'username': self.username,
                'userId':   self.user_id,
            }
        )

    async def handle_track_state(self, data):
        track_kind = data.get('kind')
        enabled    = data.get('enabled')
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type':      'track_state_changed',
                'username':  self.username,
                'user_id':   self.user_id,
                'peerId':    self.peer_id,
                'kind':      track_kind,
                'enabled':   enabled,
                'timestamp': datetime.now().isoformat(),
            }
        )

    async def approval_notification(self, event):
        participant_user_id = event.get('participant_user_id')
        try:
            if int(participant_user_id) == int(self.user_id):
                for i in range(3):
                    await self.send(text_data=json.dumps({
                        'type':                  'approval_notification',
                        'approved':              True,
                        'message':               event['message'],
                        'room_id':               str(event['room_id']),
                        'host_username':         event.get('host_username'),
                        'participant_username':  event.get('participant_username'),
                        'participant_user_id':   participant_user_id,
                        'should_initialize':     True,
                        'retry_count':           i,
                    }))
                    if i < 2:
                        await asyncio.sleep(0.5)
        except (ValueError, TypeError) as e:
            logger.error(f"approval_notification error: {e}")

    async def join_request_notification(self, event):
        is_host = await self.check_is_host()
        if is_host:
            await self.send(text_data=json.dumps({
                'type':           'join_request_notification',
                'participant_id': event['participant_id'],
                'username':       event['username'],
                'message':        event['message'],
            }))

    async def rejection_notification(self, event):
        if int(event.get('participant_user_id')) == int(self.user_id):
            await self.send(text_data=json.dumps({
                'type':     'rejection_notification',
                'rejected': True,
                'message':  event['message'],
            }))

    # ──────────────────────────────────────────────────────────
    # 채팅 / 반응 / 손들기
    # ──────────────────────────────────────────────────────────

    async def handle_chat_message(self, data):
        content = data.get('content', '').strip()
        if not content:
            return
        msg_id = await self.save_chat_message(content)
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type':       'chat_message',
                'username':   self.username,
                'user_id':    self.user_id,
                'content':    content,
                'message_id': msg_id,
                'timestamp':  datetime.now().isoformat(),
            }
        )

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            'type':            'chat_message',
            'sender_username': event['username'],
            'sender_user_id':  event['user_id'],
            'content':         event['content'],
            'message_id':      event['message_id'],
            'timestamp':       event['timestamp'],
        }))

    async def handle_reaction(self, data):
        reaction_type = data.get('reaction_type')
        if reaction_type:
            await self.save_reaction(reaction_type)
            await self.channel_layer.group_send(
                self.room_group_name,
                {'type': 'reaction_event', 'username': self.username,
                 'user_id': self.user_id, 'reaction_type': reaction_type}
            )

    async def reaction_event(self, event):
        await self.send(text_data=json.dumps({
            'type':          'reaction',
            'username':      event['username'],
            'user_id':       event['user_id'],
            'reaction_type': event['reaction_type'],
        }))

    async def handle_raise_hand(self, data):
        await self.save_raise_hand(True)
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'hand_raised', 'username': self.username, 'user_id': self.user_id}
        )

    async def handle_lower_hand(self, data):
        await self.save_raise_hand(False)
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'hand_lowered', 'username': self.username, 'user_id': self.user_id}
        )

    async def hand_raised(self, event):
        await self.send(text_data=json.dumps(
            {'type': 'raise_hand', 'username': event['username'], 'user_id': event['user_id']}
        ))

    async def hand_lowered(self, event):
        await self.send(text_data=json.dumps(
            {'type': 'lower_hand', 'username': event['username'], 'user_id': event['user_id']}
        ))

    # ──────────────────────────────────────────────────────────
    # 유틸리티
    # ──────────────────────────────────────────────────────────

    async def _send_error(self, request_type: str, message: str):
        logger.error(f"SFU error [{request_type}]: {message}")
        await self.send(text_data=json.dumps({
            'type':    'sfu_error',
            'request': request_type,
            'message': message,
        }))

    async def send_current_participants(self):
        participants = await self.get_approved_participants()
        await self.send(text_data=json.dumps({
            'type':         'participants_list',
            'participants': participants,
        }))

    @database_sync_to_async
    def check_is_host(self):
        from .models import VideoRoom
        try:
            return VideoRoom.objects.get(id=self.room_id).host == self.user
        except Exception:
            return False

    @database_sync_to_async
    def check_is_approved(self):
        """승인된 참가자 또는 방장 여부 확인."""
        from .models import VideoRoom, RoomParticipant
        try:
            room = VideoRoom.objects.get(id=self.room_id)
            if room.host == self.user:
                return True
            return RoomParticipant.objects.filter(
                room_id=self.room_id,
                user=self.user,
                status='approved',
            ).exists()
        except Exception:
            return False

    @database_sync_to_async
    def get_approved_participants(self):
        from .models import RoomParticipant
        return list(
            RoomParticipant.objects.filter(
                room_id=self.room_id, status='approved'
            ).values('user__username', 'user__id')
        )

    @database_sync_to_async
    def save_chat_message(self, content):
        from .models import ChatMessage
        return ChatMessage.objects.create(
            room_id=self.room_id, sender=self.user,
            content=content, message_type='text'
        ).id

    @database_sync_to_async
    def save_reaction(self, reaction_type):
        from .models import Reaction
        Reaction.objects.create(
            room_id=self.room_id, user=self.user, reaction_type=reaction_type
        )

    @database_sync_to_async
    def save_raise_hand(self, is_raised):
        from .models import RaisedHand
        RaisedHand.objects.update_or_create(
            room_id=self.room_id, user=self.user,
            defaults={
                'is_active':  is_raised,
                'raised_at':  timezone.now() if is_raised else None,
                'lowered_at': None if is_raised else timezone.now(),
            }
        )

    @database_sync_to_async
    def get_username_by_peer_id(self, peer_id: str) -> str:
        from django.contrib.auth.models import User
        try:
            user_id = int(peer_id.replace('user_', ''))
            return User.objects.get(id=user_id).username
        except (ValueError, User.DoesNotExist):
            return peer_id