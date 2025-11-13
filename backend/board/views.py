from django.shortcuts import render

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated
from rest_framework.response import Response
from .models import Post
from .serializers import PostSerializer

class PostViewSet(viewsets.ModelViewSet):
    queryset = Post.objects.all()
    serializer_class = PostSerializer

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        # 조회수 증가
        instance.view_count += 1
        instance.save()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)
    
    def create(self, request, *args, **kwargs):
        """게시글 생성 (로그인 필요)"""
        # author를 현재 로그인한 사용자로 자동 설정 (선택사항)
        # data = request.data.copy()
        # data['author'] = request.user.username
        return super().create(request, *args, **kwargs)

    @action(detail=False, methods=['get'], permission_classes=[])
    def health(self, request):
        """헬스체크 (인증 불필요)"""
        return Response({
            'status': 'healthy',
            'total_posts': Post.objects.count(),
            'authenticated': request.user.is_authenticated,
            'user': request.user.username if request.user.is_authenticated else None,
        })
