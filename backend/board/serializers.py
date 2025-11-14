# ============================================
# backend/board/serializers.py (댓글 시리얼라이저 추가)
# ============================================
from rest_framework import serializers
from .models import Post, Comment

class PostSerializer(serializers.ModelSerializer):
    author = serializers.CharField(read_only=True)

    class Meta:
        model = Post
        fields = ['id', 'title', 'content', 'author', 'view_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'author', 'view_count', 'created_at', 'updated_at']


class CommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comment
        # fields = ['id', 'post', 'author', 'content', 'created_at', 'updated_at']
        # read_only_fields = ['id', 'post', 'author', 'created_at', 'updated_at']
        fields = ['id', 'post', 'author', 'content', 'user', 'created_at', 'updated_at']
        read_only_fields = ['id', 'post', 'author', 'user', 'created_at', 'updated_at']
