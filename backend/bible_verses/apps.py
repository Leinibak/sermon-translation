# backend/bible_verses/apps.py
from django.apps import AppConfig

class BibleVersesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'bible_verses'
    verbose_name = '성경 구절'