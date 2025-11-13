# backend/accounts/serializers.py
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
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({
                "password": "비밀번호가 일치하지 않습니다."
            })
        
        # 비밀번호 최소 길이 체크
        if len(attrs['password']) < 8:
            raise serializers.ValidationError({
                "password": "비밀번호는 최소 8자 이상이어야 합니다."
            })
        
        return attrs

    def create(self, validated_data):
        # Remove password2 as it's not part of the User model
        validated_data.pop('password2')
        
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password']
        )
        return user