# ============================================
# backend/accounts/serializers.py
# ============================================
from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from .models import UserProfile

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password]
    )
    password2 = serializers.CharField(write_only=True, required=True)
    email = serializers.EmailField(required=False)
    
    # ✅ 교인 여부 필드 추가
    is_member = serializers.BooleanField(
        required=False,
        default=False,
        help_text='Arche 교회 등록 교인인 경우 체크하세요'
    )

    class Meta:
        model = User
        fields = ('username', 'password', 'password2', 'email', 'is_member')

    def validate(self, attrs):
        # username 중복 체크
        if User.objects.filter(username=attrs['username']).exists():
            raise serializers.ValidationError({
                "username": "이미 존재하는 사용자명입니다."
            })

        # 비밀번호 일치 확인
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({
                "password": "비밀번호가 일치하지 않습니다."
            })

        # 비밀번호 최소 길이
        if len(attrs['password']) < 8:
            raise serializers.ValidationError({
                "password": "비밀번호는 최소 8자 이상이어야 합니다."
            })

        return attrs

    def create(self, validated_data):
        # is_member 추출
        is_member = validated_data.pop('is_member', False)
        validated_data.pop('password2')

        # Django의 create_user 사용 → 비밀번호 자동 해싱
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password']
        )
        
        # ✅ UserProfile에 교인 여부 저장
        if hasattr(user, 'profile'):
            user.profile.is_member = is_member
            user.profile.save()
        
        return user