from django.contrib import admin
from .models import Post

@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ['title', 'author', 'view_count', 'created_at']
    list_filter = ['created_at']
    search_fields = ['title', 'content', 'author']
    readonly_fields = ['created_at', 'updated_at', 'view_count']
