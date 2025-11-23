# backend/board/serializers.py
from rest_framework import serializers
from .models import Post, Comment

class PostSerializer(serializers.ModelSerializer):
    author = serializers.CharField(read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = ['id', 'title', 'content', 'author', 'image', 'image_url', 
                  'view_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'author', 'view_count', 'created_at', 'updated_at']
    
    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
        return None


class CommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comment
        fields = ['id', 'post', 'author', 'content', 'user', 'created_at', 'updated_at']
        read_only_fields = ['id', 'post', 'author', 'user', 'created_at', 'updated_at']