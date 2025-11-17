# backend/sermons/admin.py
from django.contrib import admin
from .models import Sermon

@admin.register(Sermon)
class SermonAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'title', 'preacher', 'sermon_date', 
        'category', 'bible_reference', 'view_count', 
        'has_audio', 'has_original_pdf', 'has_translated_pdf',
        'created_at'
    ]
    list_filter = ['category', 'sermon_date', 'preacher', 'bible_book']
    search_fields = ['title', 'preacher', 'description']
    readonly_fields = ['view_count', 'created_at', 'updated_at', 'bible_reference']
    
    fieldsets = (
        ('기본 정보', {
            'fields': ('title', 'preacher', 'sermon_date', 'category')
        }),
        ('성경 본문', {
            'fields': ('bible_book', 'chapter', 'verse_start', 'verse_end', 'bible_reference')
        }),
        ('파일', {
            'fields': ('audio_file', 'original_pdf', 'translated_pdf')
        }),
        ('추가 정보', {
            'fields': ('description', 'duration', 'view_count')
        }),
        ('메타 정보', {
            'fields': ('uploaded_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
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
        if not change:  # 새로 생성하는 경우
            obj.uploaded_by = request.user
        super().save_model(request, obj, form, change)