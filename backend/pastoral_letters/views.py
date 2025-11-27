# backend/pastoral_letters/views.py
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.http import FileResponse
from django_filters.rest_framework import DjangoFilterBackend

from .models import PastoralLetter
from .serializers import (
    PastoralLetterListSerializer,
    PastoralLetterDetailSerializer,
    PastoralLetterCreateUpdateSerializer
)
from .permissions import IsAdminOrReadOnly, IsMemberUser


class PastoralLetterViewSet(viewsets.ModelViewSet):
    """목회서신 API"""
    queryset = PastoralLetter.objects.all()
    parser_classes = [MultiPartParser, FormParser]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    
    # 페이지네이션 비활성화 (전체 목록 표시)
    pagination_class = None
    
    # 검색 필드
    search_fields = ['title', 'description']
    
    # 정렬 필드
    ordering_fields = ['letter_date', 'created_at', 'view_count', 'title']
    ordering = ['-letter_date']
    
    def get_serializer_class(self):
        """액션에 따라 다른 Serializer 사용"""
        if self.action == 'list':
            return PastoralLetterListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return PastoralLetterCreateUpdateSerializer
        return PastoralLetterDetailSerializer
    
    def get_permissions(self):
        """액션에 따라 다른 권한 적용"""
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            # 생성/수정/삭제는 관리자만
            permission_classes = [IsAdminOrReadOnly]
        else:
            # 조회는 교인만
            permission_classes = [IsMemberUser]
        
        return [permission() for permission in permission_classes]
    
    def retrieve(self, request, *args, **kwargs):
        """목회서신 조회 시 조회수 증가"""
        instance = self.get_object()
        instance.view_count += 1
        instance.save(update_fields=['view_count'])
        
        serializer = self.get_serializer(instance)
        return Response(serializer.data)
    
    def perform_create(self, serializer):
        """목회서신 생성 시 업로드한 사용자 저장"""
        serializer.save(uploaded_by=self.request.user)
    
    @action(detail=True, methods=['get'])
    def download_pdf(self, request, pk=None):
        """PDF 파일 다운로드"""
        letter = self.get_object()
        
        if not letter.pdf_file:
            return Response(
                {'detail': 'PDF 파일이 없습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            file_handle = letter.pdf_file.open('rb')
            response = FileResponse(file_handle, content_type='application/pdf')
            filename = letter.pdf_file.name.split('/')[-1]
            response['Content-Disposition'] = f'inline; filename="{filename}"'
            response['Content-Length'] = letter.pdf_file.size
            response['X-Content-Type-Options'] = 'nosniff'
            return response
        except Exception as e:
            return Response(
                {'detail': f'파일을 열 수 없습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def recent(self, request):
        """최근 목회서신 5개 반환"""
        recent_letters = self.queryset.order_by('-letter_date')[:5]
        serializer = PastoralLetterListSerializer(
            recent_letters,
            many=True,
            context={'request': request}
        )
        return Response(serializer.data)