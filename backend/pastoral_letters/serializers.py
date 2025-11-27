# backend/pastoral_letters/serializers.py
from rest_framework import serializers
from .models import PastoralLetter

class PastoralLetterListSerializer(serializers.ModelSerializer):
    """목회서신 목록용 Serializer"""
    uploaded_by_username = serializers.CharField(
        source='uploaded_by.username', 
        read_only=True
    )
    
    class Meta:
        model = PastoralLetter
        fields = [
            'id', 'title', 'letter_date', 'description',
            'view_count', 'created_at', 'uploaded_by_username'
        ]


class PastoralLetterDetailSerializer(serializers.ModelSerializer):
    """목회서신 상세 정보용 Serializer"""
    uploaded_by_username = serializers.CharField(
        source='uploaded_by.username', 
        read_only=True
    )
    pdf_url = serializers.SerializerMethodField()
    
    class Meta:
        model = PastoralLetter
        fields = [
            'id', 'title', 'letter_date', 'description',
            'pdf_url', 'view_count',
            'uploaded_by_username', 'created_at', 'updated_at'
        ]
    
    def get_pdf_url(self, obj):
        if obj.pdf_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.pdf_file.url)
        return None


class PastoralLetterCreateUpdateSerializer(serializers.ModelSerializer):
    """목회서신 생성/수정용 Serializer"""
    
    class Meta:
        model = PastoralLetter
        fields = [
            'title', 'letter_date', 'pdf_file', 'description'
        ]
    
    def validate_pdf_file(self, value):
        """PDF 파일 유효성 검사"""
        if value:
            # 파일 크기 제한 (10MB)
            if value.size > 10 * 1024 * 1024:
                raise serializers.ValidationError(
                    'PDF 파일은 10MB를 초과할 수 없습니다.'
                )
            
            # 파일 확장자 검사
            ext = value.name.split('.')[-1].lower()
            if ext != 'pdf':
                raise serializers.ValidationError(
                    'PDF 파일만 업로드 가능합니다.'
                )
        
        return value