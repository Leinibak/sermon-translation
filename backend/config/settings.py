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

# Application definition
INSTALLED_APPS = [
    'daphne',
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
    'bible_verses',   
    'pastoral_letters',   
    'video_meetings',  # ✅ 추가
]

ASGI_APPLICATION = 'config.asgi.application'


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

# ⭐ 추가: Static files 디렉토리 설정
STATICFILES_DIRS = [
    BASE_DIR / 'static',
]

# ⭐ Static files storage (프로덕션)
if ENVIRONMENT == "prod":
    STATICFILES_STORAGE = 'django.contrib.staticfiles.storage.ManifestStaticFilesStorage'

# Media files
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ============================================================================
# 보안 설정
# ============================================================================
# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = config('SECRET_KEY', default='dev-secret-key-change-in-production')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = config('DEBUG', default=False, cast=bool)

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1').split(',')

# ============================================================================
# CORS 설정 (보안 강화)
# ============================================================================

if ENVIRONMENT == "prod":
    # 프로덕션: 특정 도메인만 허용
    CORS_ALLOWED_ORIGINS = [
        "https://jounsori.org",
        "https://www.jounsori.org",
    ]
    
    # WebSocket 연결을 위한 도메인
    CORS_ALLOWED_ORIGIN_REGEXES = []
    
    # CORS 허용 메서드 (필요한 것만)
    CORS_ALLOW_METHODS = [
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'OPTIONS',
    ]
    
    # CORS 허용 헤더
    CORS_ALLOW_HEADERS = [
        'accept',
        'accept-encoding',
        'authorization',
        'content-type',
        'dnt',
        'origin',
        'user-agent',
        'x-csrftoken',
        'x-requested-with',
    ]
    
else:
    # 개발 환경
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
    ]
    
    CORS_ALLOW_METHODS = [
        'DELETE',
        'GET',
        'OPTIONS',
        'PATCH',
        'POST',
        'PUT',
    ]
    
    CORS_ALLOW_HEADERS = [
        'accept',
        'accept-encoding',
        'authorization',
        'content-type',
        'dnt',
        'origin',
        'user-agent',
        'x-csrftoken',
        'x-requested-with',
    ]

# Credentials 허용 (쿠키 등)
CORS_ALLOW_CREDENTIALS = True

# Preflight 요청 캐싱 (24시간)
CORS_PREFLIGHT_MAX_AGE = 86400

# ============================================================================
# CSRF 설정 (보안 강화)
# ============================================================================

CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in config(
        'CSRF_TRUSTED_ORIGINS',
        default='http://localhost,https://jounsori.org,https://www.jounsori.org'
    ).split(',')
]

if ENVIRONMENT == "prod":
    # CSRF 쿠키 보안 설정
    CSRF_COOKIE_SECURE = True
    CSRF_COOKIE_HTTPONLY = True
    CSRF_COOKIE_SAMESITE = 'Strict'
    CSRF_USE_SESSIONS = False
    
    # CSRF 토큰 헤더
    CSRF_HEADER_NAME = 'HTTP_X_CSRFTOKEN'
else:
    CSRF_COOKIE_SECURE = False
    CSRF_COOKIE_HTTPONLY = False
    CSRF_COOKIE_SAMESITE = 'Lax'

# ============================================================================
# 세션 설정 (보안 강화)
# ============================================================================

if ENVIRONMENT == "prod":
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Strict'
    SESSION_COOKIE_AGE = 3600  # 1시간
    SESSION_SAVE_EVERY_REQUEST = True
    SESSION_COOKIE_NAME = 'sessionid'
else:
    SESSION_COOKIE_SECURE = False
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'

# ============================================================================
# HTTPS 및 프록시 설정
# ============================================================================

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True

if ENVIRONMENT == "prod":
    # HTTPS 관련 보안
    SECURE_SSL_REDIRECT = False  # Nginx에서 처리
    SECURE_HSTS_SECONDS = 31536000  # 1년
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_BROWSER_XSS_FILTER = True
    X_FRAME_OPTIONS = 'DENY'

# ============================================================================
# REST Framework 설정 (Rate Limiting 조정)
# ============================================================================

REST_FRAMEWORK = {  
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 10,
    
    # 인증
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    
    # 권한
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticatedOrReadOnly',
    ],
    
    # ⭐ Throttling (Rate Limiting) - 완화
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '200/hour',        # 100 → 200으로 증가
        'user': '2000/hour',       # 1000 → 2000으로 증가
        'video_meeting': '1000/hour',  # ⭐ 새로 추가
    },
    
    # Filtering
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    
    # Renderer
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ] if ENVIRONMENT == "prod" else [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ],
    
    # Exception Handler
    'EXCEPTION_HANDLER': 'rest_framework.views.exception_handler',
}

# ============================================================================
# JWT 설정 (보안 강화)
# ============================================================================

from datetime import timedelta

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'VERIFYING_KEY': None,
    'AUDIENCE': None,
    'ISSUER': None,
    
    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_HEADER_NAME': 'HTTP_AUTHORIZATION',
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
    'TOKEN_TYPE_CLAIM': 'token_type',
    
    'JTI_CLAIM': 'jti',
    
    # Sliding Token 설정
    'SLIDING_TOKEN_REFRESH_EXP_CLAIM': 'refresh_exp',
    'SLIDING_TOKEN_LIFETIME': timedelta(minutes=5),
    'SLIDING_TOKEN_REFRESH_LIFETIME': timedelta(days=1),
}

# ============================================================================
# Channels (WebSocket) 설정
# ============================================================================

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [('redis', 6379)],
            "capacity": 2000,  # ⭐ 1500 → 2000
            "expiry": 15,      # ⭐ 10 → 15
            # ⭐ 추가 설정
            "group_expiry": 86400,  # 24시간
            "channel_capacity": {
                "http.request": 200,
                "websocket.send*": 2000,
                "websocket.receive*": 2000,
            },
        },
    },
}
# ============================================================================
# 로깅 설정 (보안 및 모니터링)
# ============================================================================

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    'filters': {
        'require_debug_false': {
            '()': 'django.utils.log.RequireDebugFalse',
        },
        'require_debug_true': {
            '()': 'django.utils.log.RequireDebugTrue',
        },
    },
    'handlers': {
        'console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
            'formatter': 'simple'
        },
        'file': {
            'level': 'WARNING',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': BASE_DIR / 'logs' / 'django.log',
            'maxBytes': 1024 * 1024 * 10,  # 10MB
            'backupCount': 5,
            'formatter': 'verbose',
        },
        'websocket_file': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': BASE_DIR / 'logs' / 'websocket.log',
            'maxBytes': 1024 * 1024 * 10,  # 10MB
            'backupCount': 3,
            'formatter': 'verbose',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': False,
        },
        'django.security': {
            'handlers': ['file'],
            'level': 'WARNING',
            'propagate': False,
        },
        'video_meetings': {
            'handlers': ['console', 'websocket_file'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# ============================================================================
# 파일 업로드 설정 (보안)
# ============================================================================

FILE_UPLOAD_MAX_MEMORY_SIZE = 104857600  # 100MB
DATA_UPLOAD_MAX_MEMORY_SIZE = 104857600
DATA_UPLOAD_MAX_NUMBER_FIELDS = 10000

FILE_UPLOAD_HANDLERS = [
    'django.core.files.uploadhandler.MemoryFileUploadHandler',
    'django.core.files.uploadhandler.TemporaryFileUploadHandler',
]

FILE_UPLOAD_PERMISSIONS = 0o644
FILE_UPLOAD_DIRECTORY_PERMISSIONS = 0o755

# 허용된 파일 확장자 (예시)
ALLOWED_FILE_EXTENSIONS = [
    'pdf', 'doc', 'docx', 'xls', 'xlsx',
    'jpg', 'jpeg', 'png', 'gif', 'svg',
    'mp3', 'mp4', 'wav', 'ogg', 'webm'
]

# 파일 크기 제한 (바이트 단위)
MAX_FILE_SIZE = 104857600  # 100MB

# ============================================================================
# 데이터베이스 연결 풀링 (성능 최적화)
# ============================================================================

DATABASES = {
    'default': {
        'ENGINE': config('DB_ENGINE', default='django.db.backends.postgresql'),
        'NAME': config('DB_NAME', default='webboard'),
        'USER': config('DB_USER', default='postgres'),
        'PASSWORD': config('DB_PASSWORD', default='postgres'),
        'HOST': config('DB_HOST', default='db'),
        'PORT': config('DB_PORT', default='5432'),
        'CONN_MAX_AGE': 600,  # 연결 풀링 (10분)
        'OPTIONS': {
            'connect_timeout': 10,
        }
    }
}


# ============================================================================
# 캐싱 설정 (Redis)
# ============================================================================

CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': 'redis://redis:6379/1',
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
            'CONNECTION_POOL_KWARGS': {
                'max_connections': 50,
                'retry_on_timeout': True,
            },
            'SOCKET_CONNECT_TIMEOUT': 5,
            'SOCKET_TIMEOUT': 5,
        },
        'KEY_PREFIX': 'webboard',
        'TIMEOUT': 300,  # 5분
    }
}

# Session을 Redis에 저장
SESSION_ENGINE = 'django.contrib.sessions.backends.cache'
SESSION_CACHE_ALIAS = 'default'


# Video Meeting용 커스텀 Throttle
from rest_framework.throttling import UserRateThrottle

class VideoMeetingThrottle(UserRateThrottle):
    """
    화상회의 API용 Rate Limiting
    더 관대한 제한 적용
    """
    scope = 'video_meeting'
    rate = '1000/hour'  # 시간당 1000회