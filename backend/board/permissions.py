from rest_framework.permissions import BasePermission, SAFE_METHODS

class IsAuthorOrReadOnly(BasePermission):
    """
    작성자(user)만 수정/삭제 가능
    """

    def has_object_permission(self, request, view, obj):

        # GET, HEAD, OPTIONS는 모두 허용
        if request.method in SAFE_METHODS:
            return True

        # POST는 view permission이 아니라서 여기 안 오므로 PASS
        # PUT, PATCH, DELETE → 작성자만 가능
        return obj.user == request.user
