# backend/pastoral_letters/apps.py
from django.apps import AppConfig

class PastoralLettersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'pastoral_letters'
    verbose_name = '목회서신'


# backend/pastoral_letters/__init__.py
# (빈 파일 - Django 앱으로 인식하기 위해 필요)