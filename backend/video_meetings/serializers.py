# backend/video_meetings/serializers.py (전체 수정 버전)
from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (
    VideoRoom, RoomParticipant, SignalMessage, 
    ChatMessage, Reaction, RaisedHand
)
import json

class ParticipantSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    
    class Meta:
        model = RoomParticipant
        fields = ['id', 'user', 'username', 'status', 'joined_at', 'left_at', 'created_at']
        read_only_fields = ['id', 'username', 'joined_at', 'left_at', 'created_at']


class VideoRoomListSerializer(serializers.ModelSerializer):
    host_username = serializers.CharField(source='host.username', read_only=True)
    participant_count = serializers.SerializerMethodField()
    is_host = serializers.SerializerMethodField()
    participant_status = serializers.SerializerMethodField()
    screen_sharing_username = serializers.CharField(
        source='screen_sharing_user.username', 
        read_only=True, 
        allow_null=True
    )
    
    class Meta:
        model = VideoRoom
        fields = [
            'id', 'title', 'description', 'host', 'host_username',
            'status', 'max_participants', 'participant_count',
            'scheduled_time', 'started_at', 'is_host', 'participant_status',
            'screen_sharing_username',  # ⭐ 추가
            'created_at'
        ]
    
    def get_participant_count(self, obj):
        return obj.participants.filter(status='approved').count()
    
    def get_is_host(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.host == request.user
        return False
    
    def get_participant_status(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            participant = obj.participants.filter(user=request.user).first()
            if participant:
                return participant.status
        return None


class VideoRoomDetailSerializer(serializers.ModelSerializer):
    host_username = serializers.CharField(source='host.username', read_only=True)
    participants = ParticipantSerializer(many=True, read_only=True)
    is_host = serializers.SerializerMethodField()
    is_participant = serializers.SerializerMethodField()
    participant_status = serializers.SerializerMethodField()
    current_user_id = serializers.SerializerMethodField()
    screen_sharing_username = serializers.CharField(
        source='screen_sharing_user.username', 
        read_only=True,
        allow_null=True
    )
    
    class Meta:
        model = VideoRoom
        fields = [
            'id', 'title', 'description', 'host', 'host_username',
            'status', 'max_participants', 'scheduled_time',
            'started_at', 'ended_at', 'participants',
            'is_host', 'is_participant', 'participant_status',
            'current_user_id', 'screen_sharing_username',  # ⭐ 추가
            'created_at', 'updated_at'
        ]
    
    def get_is_host(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.host == request.user
        return False
    
    def get_is_participant(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.participants.filter(user=request.user).exists()
        return False
    
    def get_participant_status(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            participant = obj.participants.filter(user=request.user).first()
            if participant:
                return participant.status
        return None
    
    def get_current_user_id(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return request.user.id
        return None


class VideoRoomCreateSerializer(serializers.ModelSerializer):
    """회의실 생성용 Serializer - ⭐ 응답에 id 포함"""
    
    class Meta:
        model = VideoRoom
        fields = [
            'id',  # ⭐⭐⭐ 추가!
            'title', 
            'description', 
            'max_participants',
            'password', 
            'scheduled_time'
        ]
        # ⭐ id는 read_only
        read_only_fields = ['id']
        
        extra_kwargs = {
            'description': {'required': False, 'allow_blank': True},
            'password': {'required': False, 'allow_blank': True, 'allow_null': True},
            'scheduled_time': {'required': False, 'allow_null': True},
            'max_participants': {'required': False, 'default': 10}
        }
    
    def validate_max_participants(self, value):
        """최대 참가자 수 유효성 검사"""
        if value is None:
            return 10
        
        if value < 2:
            raise serializers.ValidationError('최소 2명 이상이어야 합니다.')
        if value > 50:
            raise serializers.ValidationError('최대 50명까지만 가능합니다.')
        return value
    
    def validate_title(self, value):
        """제목 유효성 검사"""
        if not value or not value.strip():
            raise serializers.ValidationError('제목은 필수입니다.')
        
        if len(value.strip()) > 200:
            raise serializers.ValidationError('제목은 200자를 초과할 수 없습니다.')
        
        return value.strip()
    
    def validate_description(self, value):
        """설명 유효성 검사"""
        if value and len(value.strip()) > 1000:
            raise serializers.ValidationError('설명은 1000자를 초과할 수 없습니다.')
        return value.strip() if value else ''
    
    def validate_password(self, value):
        """비밀번호 유효성 검사"""
        if value and len(value) > 50:
            raise serializers.ValidationError('비밀번호는 50자를 초과할 수 없습니다.')
        return value.strip() if value else ''
    
    # ⭐⭐⭐ 생성 후 전체 정보 반환
    def create(self, validated_data):
        """회의실 생성 - id 포함하여 반환"""
        instance = super().create(validated_data)
        return instance

class SignalMessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    receiver_username = serializers.CharField(source='receiver.username', read_only=True)
    payload = serializers.SerializerMethodField()
    
    class Meta:
        model = SignalMessage
        fields = [
            'id', 'room', 'sender', 'sender_username',
            'receiver', 'receiver_username', 'message_type',
            'data', 'payload',
            'created_at'
        ]
        read_only_fields = ['id', 'sender', 'created_at']
    
    def get_payload(self, obj):
        if obj.data:
            return json.dumps(obj.data)
        return json.dumps({})


# ⭐⭐⭐ 새로 추가: 채팅 메시지 Serializer
class ChatMessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    is_mine = serializers.SerializerMethodField()
    
    class Meta:
        model = ChatMessage
        fields = [
            'id', 'room', 'sender', 'sender_username',
            'message_type', 'content', 'file',
            'is_mine', 'created_at'
        ]
        read_only_fields = ['id', 'sender', 'created_at']
    
    def get_is_mine(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.sender == request.user
        return False


# ⭐⭐⭐ 새로 추가: 반응 Serializer
class ReactionSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    
    class Meta:
        model = Reaction
        fields = ['id', 'room', 'user', 'username', 'reaction_type', 'created_at']
        read_only_fields = ['id', 'user', 'created_at']


# ⭐⭐⭐ 새로 추가: 손들기 Serializer
class RaisedHandSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    
    class Meta:
        model = RaisedHand
        fields = [
            'id', 'room', 'user', 'username', 
            'is_active', 'raised_at', 'lowered_at'
        ]
        read_only_fields = ['id', 'user', 'raised_at']