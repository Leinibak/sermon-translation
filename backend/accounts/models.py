# backend/accounts/models.py (수정된 부분만)
from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver

class UserProfile(models.Model):
    """사용자 프로필 및 승인 상태 관리"""
    
    APPROVAL_STATUS = [
        ('pending', '승인 대기'),
        ('approved', '승인됨'),
        ('rejected', '거부됨'),
    ]
    
    user = models.OneToOneField(
        User, 
        on_delete=models.CASCADE, 
        related_name='profile'
    )
    
    # ✅ 교인 여부 필드 추가
    is_member = models.BooleanField(
        default=False,
        verbose_name='Arche 교인 여부',
        help_text='Arche 교회 등록 교인인 경우 체크'
    )
    
    approval_status = models.CharField(
        max_length=20,
        choices=APPROVAL_STATUS,
        default='pending',
        verbose_name='승인 상태'
    )
    approved_at = models.DateTimeField(
        null=True, 
        blank=True,
        verbose_name='승인 일시'
    )
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_users',
        verbose_name='승인자'
    )
    rejection_reason = models.TextField(
        blank=True,
        verbose_name='거부 사유'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = '사용자 프로필'
        verbose_name_plural = '사용자 프로필 목록'
    
    def __str__(self):
        member_status = " (교인)" if self.is_member else ""
        return f'{self.user.username} - {self.get_approval_status_display()}{member_status}'
    
    @property
    def is_approved(self):
        """승인 여부 확인"""
        return self.approval_status == 'approved'
    
    @property
    def can_write_post(self):
        """게시글 작성 가능 여부"""
        return self.is_approved
    
    @property
    def can_view_pastoral_letters(self):
        """목회서신 열람 가능 여부"""
        return self.is_approved and self.is_member


# Signal: User 생성 시 자동으로 UserProfile 생성
@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    """사용자 생성 시 프로필 자동 생성"""
    if created:
        UserProfile.objects.create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    """사용자 저장 시 프로필도 저장"""
    if hasattr(instance, 'profile'):
        instance.profile.save()