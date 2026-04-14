# backend/bible_verses/sayings_urls.py
# config/urls.py 에서 path('api/sayings/', include('bible_verses.sayings_urls')) 로 마운트

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    ThemeViewSet,
    JesusSayingViewSet,
    ParallelGroupViewSet,
    MeditationViewSet,
)

router = DefaultRouter()
router.register(r'themes',      ThemeViewSet,         basename='theme')
router.register(r'parallels',   ParallelGroupViewSet, basename='parallel')
router.register(r'meditations', MeditationViewSet,    basename='meditation')
router.register(r'',            JesusSayingViewSet,   basename='saying')

urlpatterns = [
    path('', include(router.urls)),
]