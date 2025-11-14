# ============================================
# backend/board/admin.py (댓글 어드민 추가)
# ============================================
from django.contrib import admin
from .models import Post, Comment

@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'author', 'view_count', 'created_at']
    list_filter = ['created_at']
    search_fields = ['title', 'author', 'content']
    readonly_fields = ['view_count', 'created_at', 'updated_at']


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ['id', 'post', 'author', 'content_preview', 'created_at']
    list_filter = ['created_at']
    search_fields = ['author', 'content']
    readonly_fields = ['created_at', 'updated_at']
    
    def content_preview(self, obj):
        return obj.content[:50] + '...' if len(obj.content) > 50 else obj.content
    content_preview.short_description = '내용 미리보기'