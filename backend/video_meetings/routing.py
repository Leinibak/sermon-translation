# video_meetings/routing.py
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/video-meeting/(?P<room_id>[^/]+)/$', consumers.VideoMeetingConsumer.as_asgi()),
]