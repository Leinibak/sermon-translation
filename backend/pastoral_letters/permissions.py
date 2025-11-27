# backend/pastoral_letters/permissions.py
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


class IsMemberUser(BasePermission):
    """
    Arche 교회 교인만 목회서신 열람 가능
    """
    
    message = '목회서신은 Arche 교회 등록 교인만 열람할 수 있습니다.'
    
    def has_permission(self, request, view):
        # 인증되지 않은 사용자
        if not request.user or not request.user.is_authenticated:
            self.message = '로그인이 필요합니다.'
            return False
        
        # 관리자는 항상 허용
        if request.user.is_staff or request.user.is_superuser:
            return True
        
        # 프로필 확인
        try:
            profile = request.user.profile
            
            # 승인되지 않은 사용자
            if not profile.is_approved:
                self.message = '관리자 승인 후 이용 가능합니다.'
                return False
            
            # 교인이 아닌 사용자
            if not profile.is_member:
                self.message = '목회서신은 Arche 공동체가 열람할 수 있습니다.'
                return False
            
            return True
            
        except:
            self.message = '프로필 정보를 확인할 수 없습니다.'
            return False
    
    def has_object_permission(self, request, view, obj):
        # has_permission과 동일한 로직
        return self.has_permission(request, view)