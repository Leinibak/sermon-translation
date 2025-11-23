# backend/board/models.py
from django.db import models
from django.contrib.auth.models import User
import uuid
import os

def post_image_path(instance, filename):
    """포스트 이미지 저장 경로"""
    ext = filename.split('.')[-1]
    filename = f'post_{uuid.uuid4().hex[:8]}.{ext}'
    return f'posts/images/{filename}'

class Post(models.Model):
    title = models.CharField(max_length=200)
    content = models.TextField()
    author = models.CharField(max_length=100)
    view_count = models.IntegerField(default=0)
    
    # ✅ 이미지 필드 추가
    image = models.ImageField(
        upload_to=post_image_path,
        verbose_name='대표 이미지',
        blank=True,
        null=True,
        help_text='포스트 대표 이미지 (선택사항)'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title
    
    def delete(self, *args, **kwargs):
        """모델 삭제 시 이미지도 함께 삭제"""
        if self.image:
            if os.path.isfile(self.image.path):
                os.remove(self.image.path)
        super().delete(*args, **kwargs)


class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='comments')
    author = models.CharField(max_length=100)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.author} - {self.content[:20]}'