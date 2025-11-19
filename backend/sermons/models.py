# backend/sermons/models.py
import uuid  # ✅ 추가!
import os
from datetime import datetime
from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator, MaxValueValidator

def sermon_audio_path(instance, filename):
    """통역 MP3 파일 저장 경로"""
    ext = filename.split('.')[-1]
    filename = f'audio_{uuid.uuid4().hex[:8]}.{ext}'
    
    # sermon_date 안전하게 처리
    if instance.sermon_date:
        date_path = instance.sermon_date.strftime('%Y/%m')
    else:
        date_path = datetime.now().strftime('%Y/%m')
    
    return f'sermons/{date_path}/audio/{filename}'

def sermon_pdf_path(instance, filename):
    """PDF 파일 저장 경로"""
    ext = filename.split('.')[-1]
    filename = f'pdf_{uuid.uuid4().hex[:8]}.{ext}'
    
    # sermon_date 안전하게 처리
    if instance.sermon_date:
        date_path = instance.sermon_date.strftime('%Y/%m')
    else:
        date_path = datetime.now().strftime('%Y/%m')
    
    return f'sermons/{date_path}/pdf/{filename}'

class Sermon(models.Model):
    CATEGORY_CHOICES = [
        ('sunday', '주일예배'),
        ('youth', '청소년예배'),
        ('special', '특별예배'),
        ('conference', '컨퍼런스'),
        ('seminar', '세미나'),
        ('other', '기타'),
    ]
    
    BIBLE_BOOKS = [
        # 구약
        ('genesis', '창세기'), ('exodus', '출애굽기'), ('leviticus', '레위기'),
        ('numbers', '민수기'), ('deuteronomy', '신명기'), ('joshua', '여호수아'),
        ('judges', '사사기'), ('ruth', '룻기'), ('1samuel', '사무엘상'),
        ('2samuel', '사무엘하'), ('1kings', '열왕기상'), ('2kings', '열왕기하'),
        ('1chronicles', '역대상'), ('2chronicles', '역대하'), ('ezra', '에스라'),
        ('nehemiah', '느헤미야'), ('esther', '에스더'), ('job', '욥기'),
        ('psalms', '시편'), ('proverbs', '잠언'), ('ecclesiastes', '전도서'),
        ('song', '아가'), ('isaiah', '이사야'), ('jeremiah', '예레미야'),
        ('lamentations', '예레미야애가'), ('ezekiel', '에스겔'), ('daniel', '다니엘'),
        ('hosea', '호세아'), ('joel', '요엘'), ('amos', '아모스'),
        ('obadiah', '오바댜'), ('jonah', '요나'), ('micah', '미가'),
        ('nahum', '나훔'), ('habakkuk', '하박국'), ('zephaniah', '스바냐'),
        ('haggai', '학개'), ('zechariah', '스가랴'), ('malachi', '말라기'),
        # 신약
        ('matthew', '마태복음'), ('mark', '마가복음'), ('luke', '누가복음'),
        ('john', '요한복음'), ('acts', '사도행전'), ('romans', '로마서'),
        ('1corinthians', '고린도전서'), ('2corinthians', '고린도후서'),
        ('galatians', '갈라디아서'), ('ephesians', '에베소서'),
        ('philippians', '빌립보서'), ('colossians', '골로새서'),
        ('1thessalonians', '데살로니가전서'), ('2thessalonians', '데살로니가후서'),
        ('1timothy', '디모데전서'), ('2timothy', '디모데후서'),
        ('titus', '디도서'), ('philemon', '빌레몬서'), ('hebrews', '히브리서'),
        ('james', '야고보서'), ('1peter', '베드로전서'), ('2peter', '베드로후서'),
        ('1john', '요한1서'), ('2john', '요한2서'), ('3john', '요한3서'),
        ('jude', '유다서'), ('revelation', '요한계시록'),
    ]
    
    # 기본 정보
    title = models.CharField(max_length=200, verbose_name='설교 제목')
    preacher = models.CharField(max_length=100, verbose_name='설교자')
    sermon_date = models.DateField(verbose_name='설교일')
    category = models.CharField(
        max_length=20, 
        choices=CATEGORY_CHOICES, 
        default='sunday',
        verbose_name='카테고리'
    )
    
    # 성경 본문
    bible_book = models.CharField(
        max_length=50, 
        choices=BIBLE_BOOKS,
        verbose_name='성경'
    )
    chapter = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        verbose_name='장'
    )
    verse_start = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        verbose_name='시작 절'
    )
    verse_end = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        verbose_name='마지막 절'
    )
    
    # 파일 필드
    audio_file = models.FileField(
        upload_to=sermon_audio_path,
        verbose_name='통역 MP3 파일',
        help_text='통역된 설교 오디오 파일'
    )
    original_pdf = models.FileField(
        upload_to=sermon_pdf_path,
        verbose_name='원본 PDF',
        help_text='원본 설교 자료',
        blank=True,
        null=True
    )
    translated_pdf = models.FileField(
        upload_to=sermon_pdf_path,
        verbose_name='번역 PDF',
        help_text='번역된 설교 자료',
        blank=True,
        null=True
    )
    
    # 추가 정보
    description = models.TextField(
        blank=True,
        verbose_name='설교 요약',
        help_text='설교 내용 요약 (선택사항)'
    )
    duration = models.PositiveIntegerField(
        blank=True,
        null=True,
        verbose_name='재생 시간(초)',
        help_text='오디오 파일 재생 시간'
    )
    view_count = models.PositiveIntegerField(default=0, verbose_name='조회수')
    
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
        ordering = ['-sermon_date', '-created_at']
        verbose_name = '설교'
        verbose_name_plural = '설교 목록'
        indexes = [
            models.Index(fields=['-sermon_date']),
            models.Index(fields=['category']),
            models.Index(fields=['preacher']),
        ]
    
    def __str__(self):
        return f'{self.title} - {self.preacher} ({self.sermon_date})'
    
    @property
    def bible_reference(self):
        """성경 본문 참조 문자열 생성"""
        book_name = dict(self.BIBLE_BOOKS).get(self.bible_book, self.bible_book)
        if self.verse_start == self.verse_end:
            return f'{book_name} {self.chapter}:{self.verse_start}'
        return f'{book_name} {self.chapter}:{self.verse_start}-{self.verse_end}'
    
    def delete(self, *args, **kwargs):
        """모델 삭제 시 파일도 함께 삭제"""
        if self.audio_file:
            if os.path.isfile(self.audio_file.path):
                os.remove(self.audio_file.path)
        
        if self.original_pdf:
            if os.path.isfile(self.original_pdf.path):
                os.remove(self.original_pdf.path)
        
        if self.translated_pdf:
            if os.path.isfile(self.translated_pdf.path):
                os.remove(self.translated_pdf.path)
        
        super().delete(*args, **kwargs)