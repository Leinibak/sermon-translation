# backend/board/permissions.py
from rest_framework.permissions import BasePermission, SAFE_METHODS

class IsAuthorOrReadOnly(BasePermission):
    """
    작성자(user)만 수정/삭제 가능
    """

    def has_object_permission(self, request, view, obj):
        # GET, HEAD, OPTIONS는 모두 허용
        if request.method in SAFE_METHODS:
            return True

        # PUT, PATCH, DELETE → 작성자만 가능
        return obj.user == request.user


class IsApprovedUser(BasePermission):
    """
    승인된 사용자만 게시글/댓글 작성 가능
    조회는 모두 가능
    """
    
    def has_permission(self, request, view):
        # GET, HEAD, OPTIONS는 모두 허용
        if request.method in SAFE_METHODS:
            return True
        
        # 인증되지 않은 사용자
        if not request.user or not request.user.is_authenticated:
            return False
        
        # 관리자는 항상 허용
        if request.user.is_staff or request.user.is_superuser:
            return True
        
        # 일반 사용자는 승인 상태 확인
        try:
            profile = request.user.profile
            return profile.is_approved
        except:
            return False
    
    def has_object_permission(self, request, view, obj):
        # GET, HEAD, OPTIONS는 모두 허용
        if request.method in SAFE_METHODS:
            return True
        
        # 인증되지 않은 사용자
        if not request.user or not request.user.is_authenticated:
            return False
        
        # 관리자는 항상 허용
        if request.user.is_staff or request.user.is_superuser:
            return True
        
        # 작성자 본인인지 확인
        if obj.user != request.user:
            return False
        
        # 승인 상태 확인
        try:
            profile = request.user.profile
            return profile.is_approved
        except:
            return False