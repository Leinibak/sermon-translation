# backend/bible_verses/admin.py
from django.contrib import admin
from .models import BibleVerse

@admin.register(BibleVerse)
class BibleVerseAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'category', 'reference_kr', 'reference_de', 
        'is_active', 'priority', 'created_at'
    ]
    
    list_filter = ['category', 'is_active', 'priority']
    search_fields = ['reference_kr', 'reference_de', 'text_kr', 'text_de']
    
    fieldsets = (
        ('카테고리', {
            'fields': ('category', 'priority', 'is_active')
        }),
        ('성경 참조', {
            'fields': ('reference_kr', 'reference_de')
        }),
        ('구절 내용', {
            'fields': ('text_kr', 'text_de'),
            'description': '한글: 개역개정 / 독일어: Schlachter 2000'
        }),
    )
    
    def get_category_display(self, obj):
        return obj.get_category_display()
    get_category_display.short_description = '카테고리'