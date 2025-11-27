# backend/pastoral_letters/admin.py
from django.contrib import admin
from .models import PastoralLetter

@admin.register(PastoralLetter)
class PastoralLetterAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'title', 'letter_date', 'view_count',
        'has_pdf', 'uploaded_by', 'created_at'
    ]
    
    list_display_links = ['id', 'title']
    list_per_page = 25
    date_hierarchy = 'letter_date'
    
    list_filter = ['letter_date', 'created_at']
    search_fields = ['title', 'description']
    
    readonly_fields = ['view_count', 'created_at', 'updated_at']
    
    fieldsets = (
        ('기본 정보', {
            'fields': ('title', 'letter_date')
        }),
        ('파일', {
            'fields': ('pdf_file',),
            'description': '한국어로 번역된 목회서신 PDF를 업로드하세요.'
        }),
        ('추가 정보', {
            'fields': ('description', 'view_count')
        }),
        ('메타 정보', {
            'fields': ('uploaded_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def has_pdf(self, obj):
        return bool(obj.pdf_file)
    has_pdf.boolean = True
    has_pdf.short_description = 'PDF'
    
    def save_model(self, request, obj, form, change):
        if not change:
            obj.uploaded_by = request.user
        super().save_model(request, obj, form, change)