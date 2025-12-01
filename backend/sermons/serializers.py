# backend/sermons/serializers.py
from rest_framework import serializers
from .models import Sermon

class SermonListSerializer(serializers.ModelSerializer):
    """설교 목록용 간단한 Serializer"""
    bible_reference = serializers.ReadOnlyField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    uploaded_by_username = serializers.CharField(source='uploaded_by.username', read_only=True)
    
    class Meta:
        model = Sermon
        fields = [
            'id', 'title', 'preacher', 'sermon_date', 
            'category', 'category_display', 'bible_reference',
            'view_count', 'created_at', 'uploaded_by_username'
        ]

class SermonDetailSerializer(serializers.ModelSerializer):
    """설교 상세 정보용 Serializer"""
    bible_reference = serializers.ReadOnlyField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    bible_book_display = serializers.CharField(source='get_bible_book_display', read_only=True)
    uploaded_by_username = serializers.CharField(source='uploaded_by.username', read_only=True)
    
    # 파일 URL
    original_audio_url = serializers.SerializerMethodField()  # ✅ 추가
    audio_url = serializers.SerializerMethodField()
    original_pdf_url = serializers.SerializerMethodField()
    translated_pdf_url = serializers.SerializerMethodField()
    
    class Meta:
        model = Sermon
        fields = [
            'id', 'title', 'preacher', 'sermon_date', 
            'category', 'category_display',
            'bible_book', 'bible_book_display', 'chapter', 
            'verse_start', 'verse_end', 'bible_reference',
            'description', 'duration', 'view_count',
            'original_audio_url',  # ✅ 추가
            'audio_url', 'original_pdf_url', 'translated_pdf_url',
            'uploaded_by_username', 'created_at', 'updated_at'
        ]
    
    def get_original_audio_url(self, obj):  # ✅ 추가
        if obj.original_audio_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.original_audio_file.url)
        return None
    
    def get_audio_url(self, obj):
        if obj.audio_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.audio_file.url)
        return None
    
    def get_original_pdf_url(self, obj):
        if obj.original_pdf:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.original_pdf.url)
        return None
    
    def get_translated_pdf_url(self, obj):
        if obj.translated_pdf:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.translated_pdf.url)
        return None

class SermonCreateUpdateSerializer(serializers.ModelSerializer):
    """설교 생성/수정용 Serializer"""
    
    class Meta:
        model = Sermon
        fields = [
            'title', 'preacher', 'sermon_date', 'category',
            'bible_book', 'chapter', 'verse_start', 'verse_end',
            'original_audio_file',  # ✅ 추가
            'audio_file', 'original_pdf', 'translated_pdf',
            'description', 'duration'
        ]
    
    def validate(self, data):
        """절 번호 유효성 검사"""
        verse_start = data.get('verse_start')
        verse_end = data.get('verse_end')
        
        if verse_start and verse_end:
            if verse_start > verse_end:
                raise serializers.ValidationError({
                    'verse_end': '마지막 절은 시작 절보다 크거나 같아야 합니다.'
                })
        
        return data
    
    def validate_original_audio_file(self, value):  # ✅ 추가
        """원본 오디오 파일 유효성 검사"""
        if value:
            # 파일 크기 제한 (100MB)
            if value.size > 100 * 1024 * 1024:
                raise serializers.ValidationError('오디오 파일은 100MB를 초과할 수 없습니다.')
            
            # 파일 확장자 검사
            ext = value.name.split('.')[-1].lower()
            if ext not in ['mp3', 'wav', 'm4a']:
                raise serializers.ValidationError('mp3, wav, m4a 파일만 업로드 가능합니다.')
        
        return value
    
    def validate_audio_file(self, value):
        """통역 오디오 파일 유효성 검사"""
        if value:
            # 파일 크기 제한 (100MB)
            if value.size > 100 * 1024 * 1024:
                raise serializers.ValidationError('오디오 파일은 100MB를 초과할 수 없습니다.')
            
            # 파일 확장자 검사
            ext = value.name.split('.')[-1].lower()
            if ext not in ['mp3', 'wav', 'm4a']:
                raise serializers.ValidationError('mp3, wav, m4a 파일만 업로드 가능합니다.')
        
        return value
    
    def validate_original_pdf(self, value):
        """원본 PDF 유효성 검사"""
        if value:
            if value.size > 50 * 1024 * 1024:
                raise serializers.ValidationError('PDF 파일은 50MB를 초과할 수 없습니다.')
            
            ext = value.name.split('.')[-1].lower()
            if ext != 'pdf':
                raise serializers.ValidationError('PDF 파일만 업로드 가능합니다.')
        
        return value
    
    def validate_translated_pdf(self, value):
        """번역 PDF 유효성 검사"""
        if value:
            if value.size > 50 * 1024 * 1024:
                raise serializers.ValidationError('PDF 파일은 50MB를 초과할 수 없습니다.')
            
            ext = value.name.split('.')[-1].lower()
            if ext != 'pdf':
                raise serializers.ValidationError('PDF 파일만 업로드 가능합니다.')
        
        return value