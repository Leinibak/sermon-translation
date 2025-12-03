# backend/video_meetings/admin.py
from django.contrib import admin
from .models import VideoRoom, RoomParticipant, SignalMessage

@admin.register(VideoRoom)
class VideoRoomAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'title', 'host', 'status', 
        'participant_count', 'max_participants',
        'started_at', 'created_at'
    ]
    
    list_filter = ['status', 'created_at']
    search_fields = ['title', 'host__username']
    readonly_fields = ['id', 'started_at', 'ended_at', 'created_at', 'updated_at']
    
    fieldsets = (
        ('기본 정보', {
            'fields': ('id', 'title', 'description', 'host', 'status')
        }),
        ('설정', {
            'fields': ('max_participants', 'password', 'scheduled_time')
        }),
        ('회의 기록', {
            'fields': ('started_at', 'ended_at', 'created_at', 'updated_at')
        }),
    )
    
    def participant_count(self, obj):
        return obj.participants.filter(status='approved').count()
    participant_count.short_description = '참가자 수'


@admin.register(RoomParticipant)
class RoomParticipantAdmin(admin.ModelAdmin):
    list_display = ['id', 'room', 'user', 'status', 'joined_at', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['room__title', 'user__username']
    readonly_fields = ['joined_at', 'left_at', 'created_at']


@admin.register(SignalMessage)
class SignalMessageAdmin(admin.ModelAdmin):
    list_display = ['id', 'room', 'sender', 'receiver', 'message_type', 'created_at']
    list_filter = ['message_type', 'created_at']
    search_fields = ['room__title', 'sender__username', 'receiver__username']
    readonly_fields = ['created_at']