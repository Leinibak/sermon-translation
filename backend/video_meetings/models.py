# backend/video_meetings/models.py (수정 버전)
from django.db import models
from django.contrib.auth.models import User
import uuid

class VideoRoom(models.Model):
    """화상회의방"""
    
    STATUS_CHOICES = [
        ('waiting', '대기중'),
        ('active', '진행중'),
        ('ended', '종료됨'),
    ]
    
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    
    title = models.CharField(
        max_length=200,
        verbose_name='회의 제목'
    )
    
    description = models.TextField(
        blank=True,
        verbose_name='회의 설명'
    )
    
    host = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='hosted_rooms',
        verbose_name='방장'
    )
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='waiting',
        verbose_name='상태'
    )
    
    max_participants = models.PositiveIntegerField(
        default=10,
        verbose_name='최대 참가자 수'
    )
    
    password = models.CharField(
        max_length=50,
        blank=True,
        verbose_name='비밀번호',
        help_text='선택사항: 비밀번호 보호'
    )
    
    scheduled_time = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='예정 시간'
    )
    
    started_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='시작 시간'
    )
    
    ended_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='종료 시간'
    )
    
    # ⭐ 새로 추가: 화면 공유 중인 사용자
    screen_sharing_user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sharing_screen_in',
        verbose_name='화면 공유 중'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = '화상회의방'
        verbose_name_plural = '화상회의방 목록'
    
    def __str__(self):
        return f'{self.title} (방장: {self.host.username})'

class RoomParticipant(models.Model):
    """회의 참가자"""
    
    STATUS_CHOICES = [
        ('pending', '승인대기'),
        ('approved', '승인됨'),
        ('rejected', '거부됨'),
        ('left', '퇴장함'),
    ]
    
    room = models.ForeignKey(
        VideoRoom,
        on_delete=models.CASCADE,
        related_name='participants'
    )
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='room_participations'
    )
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        verbose_name='참가 상태'
    )
    
    joined_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='입장 시간'
    )
    
    left_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='퇴장 시간'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        # ⭐⭐⭐ 이 제약 조건이 문제의 원인!
        # 같은 방에 같은 사용자가 여러 번 참가 요청을 할 수 없음
        unique_together = ['room', 'user']
        ordering = ['created_at']
        verbose_name = '참가자'
        verbose_name_plural = '참가자 목록'
    
    def __str__(self):
        return f'{self.user.username} - {self.room.title}'


class SignalMessage(models.Model):
    """WebRTC 시그널링 메시지"""
    
    MESSAGE_TYPES = [
        ('offer', 'Offer'),
        ('answer', 'Answer'),
        ('candidate', 'ICE Candidate'),
        ('approval', 'Approval'),
        ('screen_share_start', 'Screen Share Start'),  # ⭐ 추가
        ('screen_share_stop', 'Screen Share Stop'),    # ⭐ 추가
        ('reaction', 'Reaction'),                      # ⭐ 추가 (3번 기능)
        ('raise_hand', 'Raise Hand'),                  # ⭐ 추가 (3번 기능)
        ('chat_message', 'Chat Message'),              # ⭐ 추가 (2번 기능)
    ]
    
    room = models.ForeignKey(
        VideoRoom,
        on_delete=models.CASCADE,
        related_name='signals'
    )
    
    sender = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='sent_signals'
    )
    
    receiver = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='received_signals',
        null=True,
        blank=True
    )
    
    message_type = models.CharField(
        max_length=30,  # ⭐ 길이 증가
        choices=MESSAGE_TYPES
    )
    
    data = models.JSONField()
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['created_at']
        verbose_name = '시그널 메시지'
        verbose_name_plural = '시그널 메시지 목록'


# ⭐⭐⭐ 새로 추가: 채팅 메시지 모델 (2번 기능)
class ChatMessage(models.Model):
    """채팅 메시지"""
    
    MESSAGE_TYPES = [
        ('text', '텍스트'),
        ('file', '파일'),
        ('system', '시스템'),
    ]
    
    room = models.ForeignKey(
        VideoRoom,
        on_delete=models.CASCADE,
        related_name='chat_messages'
    )
    
    sender = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='sent_messages'
    )
    
    message_type = models.CharField(
        max_length=20,
        choices=MESSAGE_TYPES,
        default='text'
    )
    
    content = models.TextField(verbose_name='메시지 내용')
    
    # 파일 메시지용
    file = models.FileField(
        upload_to='chat_files/',
        null=True,
        blank=True
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['created_at']
        verbose_name = '채팅 메시지'
        verbose_name_plural = '채팅 메시지 목록'
    
    def __str__(self):
        return f'{self.sender.username}: {self.content[:30]}'


# ⭐⭐⭐ 새로 추가: 반응 모델 (3번 기능)
class Reaction(models.Model):
    """실시간 반응"""
    
    REACTION_TYPES = [
        ('👍', '좋아요'),
        ('👏', '박수'),
        ('❤️', '하트'),
        ('😂', '웃음'),
        ('🎉', '축하'),
        ('🤔', '생각중'),
    ]
    
    room = models.ForeignKey(
        VideoRoom,
        on_delete=models.CASCADE,
        related_name='reactions'
    )
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='reactions'
    )
    
    reaction_type = models.CharField(
        max_length=10,
        choices=REACTION_TYPES
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = '반응'
        verbose_name_plural = '반응 목록'


# ⭐⭐⭐ 새로 추가: 손들기 모델 (3번 기능)
class RaisedHand(models.Model):
    """손들기"""
    
    room = models.ForeignKey(
        VideoRoom,
        on_delete=models.CASCADE,
        related_name='raised_hands'
    )
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='raised_hands'
    )
    
    is_active = models.BooleanField(default=True)
    
    raised_at = models.DateTimeField(auto_now_add=True)
    lowered_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['raised_at']
        unique_together = ['room', 'user']
        verbose_name = '손들기'
        verbose_name_plural = '손들기 목록'
    
    def __str__(self):
        return f'{self.user.username} - {self.room.title}'