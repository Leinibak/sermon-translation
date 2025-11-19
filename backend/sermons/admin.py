# backend/sermons/admin.py
from django.contrib import admin
from django.db.models import Q
from .models import Sermon

@admin.register(Sermon)
class SermonAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'title', 'preacher', 'sermon_date', 
        'category', 'bible_reference', 'view_count', 
        'has_audio', 'has_original_pdf', 'has_translated_pdf',
        'created_at'
    ]
    
    list_display_links = ['id', 'title']
    list_per_page = 25
    date_hierarchy = 'sermon_date'
    
    # ✅ 필터 (우측 사이드바)
    list_filter = ['category', 'sermon_date', 'preacher', 'bible_book']
    
    # ✅ 검색 필드 - bible_book은 get_search_results에서 처리
    search_fields = [
        'title',           # 제목으로 검색
        'preacher',        # 설교자로 검색
        'description',     # 설명으로 검색
        'bible_reference',
    ]
    
    readonly_fields = ['view_count', 'created_at', 'updated_at', 'bible_reference']
    
    fieldsets = (
        ('기본 정보', {
            'fields': ('title', 'preacher', 'sermon_date', 'category')
        }),
        ('성경 본문', {
            'fields': ('bible_book', 'chapter', 'verse_start', 'verse_end', 'bible_reference')
        }),
        ('파일', {
            'fields': ('audio_file', 'original_pdf', 'translated_pdf'),
            'description': '파일을 교체하려면 새 파일을 선택하세요. 기존 파일은 자동으로 삭제됩니다.'
        }),
        ('추가 정보', {
            'fields': ('description', 'duration', 'view_count')
        }),
        ('메타 정보', {
            'fields': ('uploaded_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    # ⭐ 커스텀 검색 - 성경책 한글 이름 지원
    def get_search_results(self, request, queryset, search_term):
        """성경책 한글 이름으로도 검색 가능하도록"""
        queryset, use_distinct = super().get_search_results(request, queryset, search_term)
        
        if search_term:
            # 성경책 한글 이름 → 영문 코드 매칭
            bible_books_dict = dict(Sermon.BIBLE_BOOKS)
            matching_codes = [
                code for code, name in bible_books_dict.items()
                if search_term in name or search_term.lower() in code.lower()
            ]
            
            if matching_codes:
                # 기존 검색 결과에 성경책 검색 결과 추가
                queryset |= self.model.objects.filter(bible_book__in=matching_codes)
        
        return queryset, use_distinct
    
    def has_audio(self, obj):
        return bool(obj.audio_file)
    has_audio.boolean = True
    has_audio.short_description = '음성'
    
    def has_original_pdf(self, obj):
        return bool(obj.original_pdf)
    has_original_pdf.boolean = True
    has_original_pdf.short_description = '원본PDF'
    
    def has_translated_pdf(self, obj):
        return bool(obj.translated_pdf)
    has_translated_pdf.boolean = True
    has_translated_pdf.short_description = '번역PDF'
    
    def save_model(self, request, obj, form, change):
        if not change:
            obj.uploaded_by = request.user
        super().save_model(request, obj, form, change)