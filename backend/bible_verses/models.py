# backend/bible_verses/models.py
from django.db import models

class BibleVerse(models.Model):
    """매일 표시할 성경 구절"""
    
    CATEGORY_CHOICES = [
        ('obedience', '순종'),
        ('faith', '믿음'),
        ('love', '사랑'),
        ('repentance', '회개'),
        ('comfort', '위로'),
        ('peace', '평안'),
        ('prayer', '기도'),
        ('acceptance', '영접'),
        ('hope', '소망'),
        ('grace', '은혜'),
        ('forgiveness', '용서'),
        ('wisdom', '지혜'),
        ('courage', '용기'),
        ('thanksgiving', '감사'),
    ]
    
    category = models.CharField(
        max_length=20,
        choices=CATEGORY_CHOICES,
        verbose_name='카테고리'
    )
    
    # 성경 참조 (예: 요한복음 8:32)
    reference_kr = models.CharField(
        max_length=100,
        verbose_name='성경 참조 (한글)'
    )
    reference_de = models.CharField(
        max_length=100,
        verbose_name='성경 참조 (독일어)'
    )
    
    # 한글 구절 (개역개정)
    text_kr = models.TextField(
        verbose_name='한글 구절 (개역개정)'
    )
    
    # 독일어 구절 (Schlachter 2000)
    text_de = models.TextField(
        verbose_name='독일어 구절 (Schlachter 2000)'
    )
    
    # 활성화 여부
    is_active = models.BooleanField(
        default=True,
        verbose_name='활성화'
    )
    
    # 우선순위 (낮을수록 자주 표시)
    priority = models.IntegerField(
        default=1,
        verbose_name='우선순위',
        help_text='1-10 (낮을수록 자주 표시됨)'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['priority', 'category']
        verbose_name = '성경 구절'
        verbose_name_plural = '성경 구절 목록'
    
    def __str__(self):
        return f'{self.get_category_display()} - {self.reference_kr}'