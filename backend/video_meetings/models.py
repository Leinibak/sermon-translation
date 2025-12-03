# backend/video_meetings/models.py
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
        ('ice-candidate', 'ICE Candidate'),
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
        max_length=20,
        choices=MESSAGE_TYPES
    )
    
    data = models.JSONField()
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['created_at']
        verbose_name = '시그널 메시지'
        verbose_name_plural = '시그널 메시지 목록'