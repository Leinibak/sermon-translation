# backend/accounts/admin.py
from django.contrib import admin
from django.contrib.auth.models import User
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils import timezone
from .models import UserProfile

class UserProfileInline(admin.StackedInline):
    """User 모델에 UserProfile 인라인으로 표시"""
    model = UserProfile
    fk_name = 'user'   # ⭐ 반드시 추가!
    can_delete = False
    verbose_name_plural = '사용자 프로필'
    fields = ('approval_status', 'approved_at', 'approved_by', 'rejection_reason')
    readonly_fields = ('approved_at', 'approved_by')

class CustomUserAdmin(BaseUserAdmin):
    """User 모델에 프로필 정보 추가"""
    inlines = (UserProfileInline,)
    
    list_display = ['username', 'email', 'first_name', 'last_name', 
                    'is_staff', 'get_approval_status', 'date_joined']
    list_filter = ['is_staff', 'is_superuser', 'is_active', 
                   'profile__approval_status', 'date_joined']
    
    def get_approval_status(self, obj):
        """승인 상태 표시"""
        try:
            return obj.profile.get_approval_status_display()
        except:
            return '-'
    get_approval_status.short_description = '승인 상태'
    get_approval_status.admin_order_field = 'profile__approval_status'

# 기존 User admin 제거하고 커스텀 버전 등록
admin.site.unregister(User)
admin.site.register(User, CustomUserAdmin)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    """UserProfile 관리자 페이지"""
    list_display = [
        'user', 'get_email', 'approval_status', 
        'approved_at', 'approved_by', 'created_at'
    ]
    list_filter = ['approval_status', 'approved_at', 'created_at']
    search_fields = ['user__username', 'user__email']
    readonly_fields = ['user', 'approved_at', 'approved_by', 'created_at', 'updated_at']
    
    fieldsets = (
        ('사용자 정보', {
            'fields': ('user', 'created_at', 'updated_at')
        }),
        ('승인 관리', {
            'fields': ('approval_status', 'approved_at', 'approved_by', 'rejection_reason'),
            'classes': ('wide',)
        }),
    )
    
    actions = ['approve_users', 'reject_users', 'pending_users']
    
    def get_email(self, obj):
        """이메일 표시"""
        return obj.user.email
    get_email.short_description = '이메일'
    get_email.admin_order_field = 'user__email'
    
    def approve_users(self, request, queryset):
        """선택한 사용자들을 승인"""
        updated = 0
        for profile in queryset:
            if profile.approval_status != 'approved':
                profile.approval_status = 'approved'
                profile.approved_at = timezone.now()
                profile.approved_by = request.user
                profile.rejection_reason = ''
                profile.save()
                updated += 1
        
        self.message_user(request, f'{updated}명의 사용자를 승인했습니다.')
    approve_users.short_description = '선택한 사용자 승인'
    
    def reject_users(self, request, queryset):
        """선택한 사용자들을 거부"""
        updated = 0
        for profile in queryset:
            if profile.approval_status != 'rejected':
                profile.approval_status = 'rejected'
                profile.approved_at = None
                profile.approved_by = None
                profile.save()
                updated += 1
        
        self.message_user(request, f'{updated}명의 사용자를 거부했습니다.')
    reject_users.short_description = '선택한 사용자 거부'
    
    def pending_users(self, request, queryset):
        """선택한 사용자들을 대기 상태로 변경"""
        updated = 0
        for profile in queryset:
            if profile.approval_status != 'pending':
                profile.approval_status = 'pending'
                profile.approved_at = None
                profile.approved_by = None
                profile.rejection_reason = ''
                profile.save()
                updated += 1
        
        self.message_user(request, f'{updated}명의 사용자를 대기 상태로 변경했습니다.')
    pending_users.short_description = '대기 상태로 변경'
    
    def save_model(self, request, obj, form, change):
        """승인 상태 변경 시 자동으로 승인자와 시간 기록"""
        if change and 'approval_status' in form.changed_data:
            if obj.approval_status == 'approved':
                obj.approved_at = timezone.now()
                obj.approved_by = request.user
                obj.rejection_reason = ''
            elif obj.approval_status == 'rejected':
                obj.approved_at = None
                obj.approved_by = None
            elif obj.approval_status == 'pending':
                obj.approved_at = None
                obj.approved_by = None
                obj.rejection_reason = ''
        
        super().save_model(request, obj, form, change)