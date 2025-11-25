# backend/sermons/views.py
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAdminUser
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from django.http import FileResponse
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q

from .models import Sermon
from .serializers import (
    SermonListSerializer, 
    SermonDetailSerializer,
    SermonCreateUpdateSerializer
)
from .permissions import IsAdminOrReadOnly

class SermonViewSet(viewsets.ModelViewSet):
    queryset = Sermon.objects.all()
    parser_classes = [MultiPartParser, FormParser]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    
    # ✅ 페이지네이션 비활성화
    pagination_class = None
    
    # 필터링 필드
    filterset_fields = ['category', 'preacher', 'bible_book']
    
    # ⚠️ 주의: search_fields는 get_queryset에서 커스텀 처리하므로 여기서는 비워둠
    search_fields = []
    
    # 정렬 필드
    ordering_fields = ['sermon_date', 'created_at', 'view_count', 'title']
    ordering = ['-sermon_date']
    
    def get_queryset(self):
        """
        성경책 한글 이름 검색 지원
        예: '로마서', '창세기', '마태복음' 등으로 검색 가능
        """
        queryset = super().get_queryset()
        search = self.request.query_params.get('search', '').strip()
        
        if search:
            # 성경책 한글 이름 → 영문 코드 매칭
            bible_books_dict = dict(Sermon.BIBLE_BOOKS)
            matching_codes = [
                code for code, name in bible_books_dict.items()
                if search.lower() in name.lower() or search.lower() in code.lower()
            ]
            
            # Q 객체로 OR 조건 검색
            # 제목, 설교자, 설명, 성경책 코드에서 검색
            query = Q(title__icontains=search)
            query |= Q(preacher__icontains=search)
            query |= Q(description__icontains=search)
            
            # 성경책 한글 이름으로 검색된 코드가 있으면 추가
            if matching_codes:
                query |= Q(bible_book__in=matching_codes)
            
            queryset = queryset.filter(query)
        
        return queryset
    
    def list(self, request, *args, **kwargs):
        """
        목록 조회 - 검색어 디버깅 로그 추가
        """
        search = request.query_params.get('search', '')
        if search:
            print(f"🔍 검색어: '{search}'")
            
            # 디버깅: 매칭되는 성경책 코드 출력
            bible_books_dict = dict(Sermon.BIBLE_BOOKS)
            matching_codes = [
                (code, name) for code, name in bible_books_dict.items()
                if search.lower() in name.lower() or search.lower() in code.lower()
            ]
            print(f"📖 매칭된 성경책: {matching_codes}")
        
        return super().list(request, *args, **kwargs)
    
    def get_serializer_class(self):
        """액션에 따라 다른 Serializer 사용"""
        if self.action == 'list':
            return SermonListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return SermonCreateUpdateSerializer
        return SermonDetailSerializer
    
    def get_permissions(self):
        """액션에 따라 다른 권한 적용"""
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            permission_classes = [IsAdminUser]
        else:
            permission_classes = [IsAuthenticatedOrReadOnly]
        
        return [permission() for permission in permission_classes]
    
    def retrieve(self, request, *args, **kwargs):
        """설교 조회 시 조회수 증가"""
        instance = self.get_object()
        instance.view_count += 1
        instance.save(update_fields=['view_count'])
        
        serializer = self.get_serializer(instance)
        return Response(serializer.data)
    
    def perform_create(self, serializer):
        """설교 생성 시 업로드한 사용자 저장"""
        serializer.save(uploaded_by=self.request.user)
    
    @action(detail=False, methods=['get'])
    def categories(self, request):
        """카테고리 목록 반환"""
        categories = [
            {'value': choice[0], 'label': choice[1]} 
            for choice in Sermon.CATEGORY_CHOICES
        ]
        return Response(categories)
    
    @action(detail=False, methods=['get'])
    def bible_books(self, request):
        """성경 목록 반환"""
        books = [
            {'value': choice[0], 'label': choice[1]} 
            for choice in Sermon.BIBLE_BOOKS
        ]
        return Response(books)
    
    @action(detail=False, methods=['get'])
    def recent(self, request):
        """최근 설교 5개 반환"""
        recent_sermons = self.queryset.order_by('-sermon_date')[:5]
        serializer = SermonListSerializer(
            recent_sermons, 
            many=True,
            context={'request': request}
        )
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def popular(self, request):
        """인기 설교 5개 반환 (조회수 기준)"""
        popular_sermons = self.queryset.order_by('-view_count')[:5]
        serializer = SermonListSerializer(
            popular_sermons, 
            many=True,
            context={'request': request}
        )
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def download_audio(self, request, pk=None):
        """오디오 파일 다운로드"""
        sermon = self.get_object()
        if not sermon.audio_file:
            return Response(
                {'detail': '오디오 파일이 없습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            file_handle = sermon.audio_file.open('rb')
            response = FileResponse(file_handle, content_type='audio/mpeg')
            response['Content-Disposition'] = f'attachment; filename="{sermon.audio_file.name.split("/")[-1]}"'
            response['Content-Length'] = sermon.audio_file.size
            return response
        except Exception as e:
            return Response(
                {'detail': f'파일을 열 수 없습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def download_original_pdf(self, request, pk=None):
        """원본 PDF 다운로드"""
        sermon = self.get_object()
        if not sermon.original_pdf:
            return Response(
                {'detail': '원본 PDF 파일이 없습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            file_handle = sermon.original_pdf.open('rb')
            response = FileResponse(file_handle, content_type='application/pdf')
            filename = sermon.original_pdf.name.split('/')[-1]
            response['Content-Disposition'] = f'inline; filename="{filename}"'
            response['Content-Length'] = sermon.original_pdf.size
            response['X-Content-Type-Options'] = 'nosniff'
            return response
        except Exception as e:
            return Response(
                {'detail': f'파일을 열 수 없습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def download_translated_pdf(self, request, pk=None):
        """번역 PDF 다운로드"""
        sermon = self.get_object()
        if not sermon.translated_pdf:
            return Response(
                {'detail': '번역 PDF 파일이 없습니다.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            file_handle = sermon.translated_pdf.open('rb')
            response = FileResponse(file_handle, content_type='application/pdf')
            filename = sermon.translated_pdf.name.split('/')[-1]
            response['Content-Disposition'] = f'inline; filename="{filename}"'
            response['Content-Length'] = sermon.translated_pdf.size
            response['X-Content-Type-Options'] = 'nosniff'
            return response
        except Exception as e:
            return Response(
                {'detail': f'파일을 열 수 없습니다: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )