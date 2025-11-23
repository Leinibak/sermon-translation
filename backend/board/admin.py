# backend/board/admin.py
from django.contrib import admin
from .models import Post, Comment

@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'author', 'has_image', 'view_count', 'created_at']
    list_filter = ['created_at']
    search_fields = ['title', 'author', 'content']
    readonly_fields = ['view_count', 'created_at', 'updated_at', 'image_preview']
    
    fieldsets = (
        ('기본 정보', {
            'fields': ('title', 'content', 'author', 'user')
        }),
        ('이미지', {
            'fields': ('image', 'image_preview')
        }),
        ('메타 정보', {
            'fields': ('view_count', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def has_image(self, obj):
        return bool(obj.image)
    has_image.boolean = True
    has_image.short_description = '이미지'
    
    def image_preview(self, obj):
        if obj.image:
            return f'<img src="{obj.image.url}" style="max-width: 300px; max-height: 300px;" />'
        return '-'
    image_preview.short_description = '이미지 미리보기'
    image_preview.allow_tags = True


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ['id', 'post', 'author', 'content_preview', 'created_at']
    list_filter = ['created_at']
    search_fields = ['author', 'content']
    readonly_fields = ['created_at', 'updated_at']
    
    def content_preview(self, obj):
        return obj.content[:50] + '...' if len(obj.content) > 50 else obj.content
    content_preview.short_description = '내용 미리보기'