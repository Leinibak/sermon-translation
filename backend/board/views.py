# ============================================
# backend/board/views.py (댓글 권한 수정)
# ============================================
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated
from django.shortcuts import get_object_or_404

from .models import Post, Comment
from .serializers import PostSerializer, CommentSerializer
from .permissions import IsAuthorOrReadOnly


class PostViewSet(viewsets.ModelViewSet):
    queryset = Post.objects.all()
    serializer_class = PostSerializer
    
    # 🔥 GET은 모두 허용, POST/PUT/DELETE는 작성자만
    permission_classes = [IsAuthenticatedOrReadOnly, IsAuthorOrReadOnly]

    def retrieve(self, request, *args, **kwargs):
        """게시글 조회 시 조회수 증가"""
        instance = self.get_object()
        instance.view_count += 1
        instance.save()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def perform_create(self, serializer):
        """게시글 생성 시 작성자 자동 저장"""
        serializer.save(
            user=self.request.user,
            author=self.request.user.username
        )

    def perform_update(self, serializer):
        """게시글 수정 시 작성자 검사 → permission_classes가 처리함"""
        serializer.save()

    @action(detail=True, methods=['get', 'post'], url_path='comments')
    def comments(self, request, pk=None):
        """특정 게시글의 댓글 목록 조회 및 댓글 작성"""
        post = self.get_object()

        if request.method == 'GET':
            # 🔥 댓글 조회는 권한 체크 불필요
            comments = Comment.objects.filter(post=post)
            serializer = CommentSerializer(comments, many=True)
            return Response(serializer.data)

        elif request.method == 'POST':
            # 🔥 댓글 작성은 로그인한 사용자만 가능 (게시글 작성자와 무관)
            if not request.user.is_authenticated:
                return Response(
                    {'detail': '로그인이 필요합니다.'},
                    status=status.HTTP_401_UNAUTHORIZED
                )

            serializer = CommentSerializer(data=request.data)
            if serializer.is_valid():
                serializer.save(
                    post=post,
                    author=request.user.username,
                    user=request.user
                )
                return Response(serializer.data, status=status.HTTP_201_CREATED)

            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['delete'], url_path='comments/(?P<comment_id>[^/.]+)')
    def delete_comment(self, request, pk=None, comment_id=None):
        """댓글 삭제"""
        post = self.get_object()
        comment = get_object_or_404(Comment, pk=comment_id, post=post)

        # 🔥 댓글 작성자만 삭제 가능
        if comment.user != request.user:
            return Response(
                {'detail': '댓글 삭제 권한이 없습니다.'},
                status=status.HTTP_403_FORBIDDEN
            )

        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # 🔥 추가: 댓글 액션에 대한 권한 개별 설정
    def get_permissions(self):
        """액션별로 다른 권한 적용"""
        if self.action in ['comments', 'delete_comment']:
            # 댓글 조회/작성/삭제는 IsAuthenticatedOrReadOnly만 적용
            permission_classes = [IsAuthenticatedOrReadOnly]
        else:
            # 게시글 관련 액션은 기본 권한 적용
            permission_classes = [IsAuthenticatedOrReadOnly, IsAuthorOrReadOnly]
        
        return [permission() for permission in permission_classes]