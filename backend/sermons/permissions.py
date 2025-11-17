# backend/sermons/permissions.py
from rest_framework.permissions import BasePermission, SAFE_METHODS

class IsAdminOrReadOnly(BasePermission):
    """
    관리자만 생성/수정/삭제 가능
    일반 사용자는 읽기만 가능
    """
    
    def has_permission(self, request, view):
        # GET, HEAD, OPTIONS는 모두 허용
        if request.method in SAFE_METHODS:
            return True
        
        # POST, PUT, PATCH, DELETE는 관리자만
        return request.user and request.user.is_staff
    
    def has_object_permission(self, request, view, obj):
        # GET, HEAD, OPTIONS는 모두 허용
        if request.method in SAFE_METHODS:
            return True
        
        # POST, PUT, PATCH, DELETE는 관리자만
        return request.user and request.user.is_staff