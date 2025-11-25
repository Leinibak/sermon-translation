# backend/board/views.py (검색 기능 개선)
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from django.db.models import Q

from .models import Post, Comment
from .serializers import PostSerializer, CommentSerializer
from .permissions import IsAuthorOrReadOnly, IsApprovedUser


class PostViewSet(viewsets.ModelViewSet):
    queryset = Post.objects.all()
    serializer_class = PostSerializer
    parser_classes = [MultiPartParser, FormParser]
    
    permission_classes = [IsAuthenticatedOrReadOnly, IsApprovedUser, IsAuthorOrReadOnly]

    def get_queryset(self):
        """
        검색 기능 강화
        - 제목, 내용, 작성자로 검색
        - 대소문자 구분 없음
        """
        queryset = super().get_queryset()
        search = self.request.query_params.get('search', '').strip()
        
        if search:
            print(f"🔍 검색어: '{search}'")
            
            # Q 객체로 OR 조건 검색
            query = Q(title__icontains=search)  # 제목에서 검색
            query |= Q(content__icontains=search)  # 내용에서 검색
            query |= Q(author__icontains=search)  # 작성자에서 검색
            
            queryset = queryset.filter(query)
            print(f"📊 검색 결과 개수: {queryset.count()}")
        
        return queryset

    def list(self, request, *args, **kwargs):
        """목록 조회 - 검색어 디버깅"""
        search = request.query_params.get('search', '')
        if search:
            print(f"🔍 검색 요청 받음: '{search}'")
        
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        
        # ✅ 페이지네이션이 설정되어 있으면 사용, 아니면 전체 결과 반환
        if hasattr(self, 'paginate_queryset') and self.paginate_queryset(queryset) is not None:
            page = self.paginate_queryset(queryset)
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        """게시글 조회 시 조회수 증가"""
        instance = self.get_object()
        instance.view_count += 1
        instance.save()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def perform_create(self, serializer):
        """게시글 생성 시 작성자 자동 저장"""
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
            comments = Comment.objects.filter(post=post)
            serializer = CommentSerializer(comments, many=True)
            return Response(serializer.data)

        elif request.method == 'POST':
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

        # 댓글 작성자만 삭제 가능
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