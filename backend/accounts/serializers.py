# ============================================
# backend/accounts/serializers.py
# ============================================
from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password]
    )
    password2 = serializers.CharField(write_only=True, required=True)
    email = serializers.EmailField(required=False)

    class Meta:
        model = User
        fields = ('username', 'password', 'password2', 'email')

    def validate(self, attrs):
        # 🔥 username 중복 체크
        if User.objects.filter(username=attrs['username']).exists():
            raise serializers.ValidationError({
                "username": "이미 존재하는 사용자명입니다."
            })

        # 🔥 비밀번호 일치 확인
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({
                "password": "비밀번호가 일치하지 않습니다."
            })

        # 🔥 비밀번호 최소 길이
        if len(attrs['password']) < 8:
            raise serializers.ValidationError({
                "password": "비밀번호는 최소 8자 이상이어야 합니다."
            })

        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')

        # 🔥 Django의 create_user 사용 → 비밀번호 자동 해싱
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password']
        )
        return user
