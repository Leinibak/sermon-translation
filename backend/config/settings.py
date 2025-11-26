from pathlib import Path
import os

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# 환경 구분
ENVIRONMENT = os.getenv("DJANGO_ENV", "dev")

# 환경변수 파일 경로
if ENVIRONMENT == "prod":
    env_file = BASE_DIR / ".env.production"
else:
    env_file = BASE_DIR / ".env"

# python-decouple 사용
from decouple import Config, RepositoryEnv

if env_file.exists():
    config = Config(RepositoryEnv(str(env_file)))
else:
    # 환경변수 파일이 없으면 시스템 환경변수 사용
    from decouple import config

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = config('SECRET_KEY', default='dev-secret-key-change-in-production')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = config('DEBUG', default=False, cast=bool)

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1').split(',')

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third party
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_filters',

    # Local apps
    'board',
    'accounts',
    'sermons', 
    'bible_verses',  # ✅ 추가
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Database
DATABASES = {
    'default': {
        'ENGINE': config('DB_ENGINE', default='django.db.backends.postgresql'),
        'NAME': config('DB_NAME', default='webboard'),
        'USER': config('DB_USER', default='postgres'),
        'PASSWORD': config('DB_PASSWORD', default='postgres'),
        'HOST': config('DB_HOST', default='db'),
        'PORT': config('DB_PORT', default='5432'),
    }
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Media files
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ✅ 파일 업로드 설정
FILE_UPLOAD_MAX_MEMORY_SIZE = 104857600  # 100MB
DATA_UPLOAD_MAX_MEMORY_SIZE = 104857600  # 100MB
DATA_UPLOAD_MAX_NUMBER_FIELDS = 10000    # 필드 개수 제한

# ✅ 파일 업로드 핸들러
FILE_UPLOAD_HANDLERS = [
    'django.core.files.uploadhandler.MemoryFileUploadHandler',
    'django.core.files.uploadhandler.TemporaryFileUploadHandler',
]

# ✅ 파일 권한 설정
FILE_UPLOAD_PERMISSIONS = 0o644
FILE_UPLOAD_DIRECTORY_PERMISSIONS = 0o755

# ============================================
# ⭐ HTTPS 및 프록시 설정 (Mixed Content 해결)
# ============================================

# Nginx 프록시 뒤에서 HTTPS 감지
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# 프록시 헤더를 신뢰하여 올바른 호스트와 포트 사용
USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True

# ============================================
# 프로덕션 환경 보안 설정
# ============================================

if ENVIRONMENT == "prod":
    # HTTPS 강제 리다이렉트 (Nginx에서 처리하므로 False)
    SECURE_SSL_REDIRECT = False
    
    # HSTS (HTTP Strict Transport Security)
    SECURE_HSTS_SECONDS = 31536000  # 1년
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    
    # 쿠키 보안
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    CSRF_COOKIE_HTTPONLY = True
    
    # 추가 보안 헤더
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_BROWSER_XSS_FILTER = True
    X_FRAME_OPTIONS = 'DENY'

# ============================================
# CSRF 설정
# ============================================

CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in config(
        'CSRF_TRUSTED_ORIGINS',
        default='http://localhost,https://jounsori.org,https://www.jounsori.org'
    ).split(',')
]

# ============================================
# CORS 설정
# ============================================

if ENVIRONMENT == "prod":
    CORS_ALLOWED_ORIGINS = [
        "https://jounsori.org",
        "https://www.jounsori.org",
    ]
else:
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:3000",
    ]

CORS_ALLOW_CREDENTIALS = True

# ============================================
# REST Framework 설정
# ============================================

REST_FRAMEWORK = {
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 10,
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
}

# ============================================
# JWT 설정
# ============================================

from datetime import timedelta

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}