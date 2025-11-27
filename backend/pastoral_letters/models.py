# backend/pastoral_letters/models.py
import uuid
import os
from django.db import models
from django.contrib.auth.models import User
from django.core.validators import FileExtensionValidator

def pastoral_letter_path(instance, filename):
    """목회서신 PDF 저장 경로"""
    ext = filename.split('.')[-1]
    filename = f'pastoral_letter_{uuid.uuid4().hex[:8]}.{ext}'
    
    if instance.letter_date:
        date_path = instance.letter_date.strftime('%Y/%m')
    else:
        from datetime import datetime
        date_path = datetime.now().strftime('%Y/%m')
    
    return f'pastoral_letters/{date_path}/{filename}'


class PastoralLetter(models.Model):
    """목회서신 모델"""
    
    title = models.CharField(
        max_length=200,
        verbose_name='제목'
    )
    
    letter_date = models.DateField(
        verbose_name='서신 날짜',
        help_text='목회서신 발행 날짜'
    )
    
    pdf_file = models.FileField(
        upload_to=pastoral_letter_path,
        verbose_name='번역본 PDF',
        help_text='한국어로 번역된 목회서신 PDF',
        validators=[FileExtensionValidator(allowed_extensions=['pdf'])]
    )
    
    description = models.TextField(
        blank=True,
        verbose_name='요약',
        help_text='목회서신 내용 요약 (선택사항)'
    )
    
    view_count = models.PositiveIntegerField(
        default=0,
        verbose_name='조회수'
    )
    
    # 메타 정보
    uploaded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        verbose_name='업로드한 사용자'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='등록일')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='수정일')
    
    class Meta:
        ordering = ['-letter_date', '-created_at']
        verbose_name = '목회서신'
        verbose_name_plural = '목회서신 목록'
        indexes = [
            models.Index(fields=['-letter_date']),
            models.Index(fields=['created_at']),
        ]
    
    def __str__(self):
        return f'{self.title} ({self.letter_date})'
    
    def delete(self, *args, **kwargs):
        """모델 삭제 시 파일도 함께 삭제"""
        if self.pdf_file:
            if os.path.isfile(self.pdf_file.path):
                os.remove(self.pdf_file.path)
        super().delete(*args, **kwargs)