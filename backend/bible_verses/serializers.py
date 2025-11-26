# backend/bible_verses/serializers.py
from rest_framework import serializers
from .models import BibleVerse

class BibleVerseSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(
        source='get_category_display',
        read_only=True
    )
    
    class Meta:
        model = BibleVerse
        fields = [
            'id', 'category', 'category_display',
            'reference_kr', 'reference_de',
            'text_kr', 'text_de',
            'priority'
        ]