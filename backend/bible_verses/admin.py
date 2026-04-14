# backend/bible_verses/admin.py

from django.contrib import admin
from .models import BibleVerse, Theme, JesusSaying, ParallelGroup, Meditation


# ============================================================
# 기존 Admin — 절대 수정하지 않음
# ============================================================

@admin.register(BibleVerse)
class BibleVerseAdmin(admin.ModelAdmin):
    list_display   = ['id', 'category', 'reference_kr', 'reference_de', 'is_active', 'priority', 'created_at']
    list_filter    = ['category', 'is_active', 'priority']
    search_fields  = ['reference_kr', 'reference_de', 'text_kr', 'text_de']

    fieldsets = (
        ('카테고리', {'fields': ('category', 'priority', 'is_active')}),
        ('성경 참조', {'fields': ('reference_kr', 'reference_de')}),
        ('구절 내용', {
            'fields': ('text_kr', 'text_de'),
            'description': '한글: 개역개정 / 독일어: Schlachter 2000'
        }),
    )

    def get_category_display(self, obj):
        return obj.get_category_display()
    get_category_display.short_description = '카테고리'


# ============================================================
# 신규 Admin — 주님의 음성
# ============================================================

@admin.register(Theme)
class ThemeAdmin(admin.ModelAdmin):
    list_display  = ['key', 'name_ko', 'name_en', 'name_de', 'order', 'saying_count']
    ordering      = ['order']

    def saying_count(self, obj):
        return obj.sayings.filter(is_active=True).count()
    saying_count.short_description = '말씀 수'


class ThemeInline(admin.TabularInline):
    model  = JesusSaying.themes.through
    extra  = 1
    verbose_name = '주제 태그'


@admin.register(JesusSaying)
class JesusSayingAdmin(admin.ModelAdmin):
    list_display   = [
        'id', 'book', 'chapter', 'verse_start', 'verse_end',
        'size', 'season', 'audience', 'occasion',
        'slide_cycle', 'slide_order', 'is_active',
    ]
    list_filter    = ['book', 'size', 'season', 'audience', 'is_active', 'themes']
    search_fields  = ['text_ko_krv', 'text_ko_new', 'occasion', 'context_ko']
    ordering       = ['book', 'chapter', 'verse_start']
    filter_horizontal = ['themes']

    fieldsets = (
        ('구절 식별', {
            'fields': ('book', 'chapter', 'verse_start', 'verse_end', 'size')
        }),
        ('본문 — 한국어', {
            'fields': ('text_ko_krv', 'text_ko_new'),
        }),
        ('본문 — 다국어', {
            'fields': ('text_en', 'text_de', 'text_zh', 'text_es'),
            'classes': ('collapse',),
        }),
        ('배경 및 키워드', {
            'fields': ('context_ko', 'context_en', 'keywords'),
            'description': 'keywords: JSON 배열 형식으로 입력'
        }),
        ('분류', {
            'fields': ('themes', 'audience', 'occasion', 'season')
        }),
        ('슬라이드 설정', {
            'fields': ('slide_cycle', 'slide_order', 'is_active'),
            'description': 'slide_cycle: 1=절기 큐레이션, 2=복음서 순서'
        }),
    )

    # keywords JSON 필드 도움말
    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        if 'keywords' in form.base_fields:
            form.base_fields['keywords'].help_text = (
                '예시: [{"word": "생명", "original": "ζωή", '
                '"transliteration": "조에", "meaning": "영원한 신적 생명"}]'
            )
        return form


@admin.register(ParallelGroup)
class ParallelGroupAdmin(admin.ModelAdmin):
    list_display      = ['id', 'name', 'order', 'saying_count']
    filter_horizontal = ['sayings']
    ordering          = ['order', 'name']

    def saying_count(self, obj):
        return obj.sayings.count()
    saying_count.short_description = '포함 말씀 수'


@admin.register(Meditation)
class MeditationAdmin(admin.ModelAdmin):
    list_display  = ['id', 'user', 'saying', 'is_private', 'created_at']
    list_filter   = ['is_private', 'created_at']
    search_fields = ['user__username', 'content', 'saying__text_ko_krv']
    raw_id_fields = ['user', 'saying']
    ordering      = ['-created_at']