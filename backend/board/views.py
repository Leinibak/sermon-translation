# backend/board/views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from django.shortcuts import get_object_or_404

from .models import Post, Comment
from .serializers import PostSerializer, CommentSerializer
from .permissions import IsAuthorOrReadOnly, IsApprovedUser


class PostViewSet(viewsets.ModelViewSet):
    queryset = Post.objects.all()
    serializer_class = PostSerializer
    
    # 🔥 승인된 사용자만 작성 가능하도록 변경
    permission_classes = [IsAuthenticatedOrReadOnly, IsApprovedUser, IsAuthorOrReadOnly]

    def retrieve(self, request, *args, **kwargs):
        """게시글 조회 시 조회수 증가"""
        instance = self.get_object()
        instance.view_count += 1
        instance.save()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def perform_create(self, serializer):
        """게시글 생성 시 작성자 자동 저장"""
        # 승인 여부 재확인
        if not self._is_user_approved(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                detail="관리자 승인 후 게시글 작성이 가능합니다. 승인 요청은 관리자에게 문의하세요."
            )
        
        serializer.save(
            user=self.request.user,
            author=self.request.user.username
        )

    def perform_update(self, serializer):
        """게시글 수정 시 권한 검사"""
        if not self._is_user_approved(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                detail="관리자 승인 후 게시글 수정이 가능합니다."
            )
        serializer.save()

    def perform_destroy(self, instance):
        """게시글 삭제 시 권한 검사"""
        if not self._is_user_approved(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                detail="관리자 승인 후 게시글 삭제가 가능합니다."
            )
        instance.delete()

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
            # 🔥 댓글 작성은 승인된 사용자만 가능
            if not request.user.is_authenticated:
                return Response(
                    {'detail': '로그인이 필요합니다.'},
                    status=status.HTTP_401_UNAUTHORIZED
                )

            # 승인 여부 확인
            if not self._is_user_approved(request.user):
                return Response(
                    {'detail': '관리자 승인 후 댓글 작성이 가능합니다. 승인 요청은 관리자에게 문의하세요.'},
                    status=status.HTTP_403_FORBIDDEN
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

        # 승인 여부 확인
        if not self._is_user_approved(request.user):
            return Response(
                {'detail': '관리자 승인 후 댓글 삭제가 가능합니다.'},
                status=status.HTTP_403_FORBIDDEN
            )

        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _is_user_approved(self, user):
        """사용자 승인 여부 확인 헬퍼 메서드"""
        if not user or not user.is_authenticated:
            return False
        
        # 관리자는 항상 승인된 것으로 간주
        if user.is_staff or user.is_superuser:
            return True
        
        # 일반 사용자는 프로필 승인 상태 확인
        try:
            return user.profile.is_approved
        except:
            return False

    def get_permissions(self):
        """액션별로 다른 권한 적용"""
        if self.action in ['comments', 'delete_comment']:
            # 댓글 관련은 기본 권한만
            permission_classes = [IsAuthenticatedOrReadOnly, IsApprovedUser]
        else:
            # 게시글 관련은 모든 권한 적용
            permission_classes = [IsAuthenticatedOrReadOnly, IsApprovedUser, IsAuthorOrReadOnly]
        
        return [permission() for permission in permission_classes]