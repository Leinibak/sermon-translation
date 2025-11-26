# backend/bible_verses/management/commands/load_sample_verses.py
from django.core.management.base import BaseCommand
from bible_verses.models import BibleVerse

class Command(BaseCommand):
    help = '샘플 성경 구절 데이터 로드'

    def handle(self, *args, **options):
        sample_verses = [
            {
                'category': 'faith',
                'reference_kr': '히브리서 11:1',
                'reference_de': 'Hebräer 11:1',
                'text_kr': '믿음은 바라는 것들의 실상이요 보이지 않는 것들의 증거니',
                'text_de': 'Es ist aber der Glaube eine feste Zuversicht auf das, was man hofft, eine Überzeugung von Tatsachen, die man nicht sieht.',
                'priority': 1
            },
            {
                'category': 'love',
                'reference_kr': '요한1서 4:8',
                'reference_de': '1. Johannes 4:8',
                'text_kr': '하나님은 사랑이시라',
                'text_de': 'Gott ist Liebe',
                'priority': 1
            },
            {
                'category': 'obedience',
                'reference_kr': '요한복음 14:15',
                'reference_de': 'Johannes 14:15',
                'text_kr': '너희가 나를 사랑하면 나의 계명을 지키리라',
                'text_de': 'Liebt ihr mich, so haltet meine Gebote!',
                'priority': 1
            },
            {
                'category': 'peace',
                'reference_kr': '요한복음 14:27',
                'reference_de': 'Johannes 14:27',
                'text_kr': '평안을 너희에게 끼치노니 곧 나의 평안을 너희에게 주노라',
                'text_de': 'Frieden hinterlasse ich euch; meinen Frieden gebe ich euch.',
                'priority': 1
            },
            {
                'category': 'hope',
                'reference_kr': '로마서 15:13',
                'reference_de': 'Römer 15:13',
                'text_kr': '소망의 하나님이 모든 기쁨과 평강을 믿음 안에서 너희에게 충만하게 하사',
                'text_de': 'Der Gott der Hoffnung aber erfülle euch mit aller Freude und allem Frieden im Glauben',
                'priority': 2
            },
            {
                'category': 'grace',
                'reference_kr': '에베소서 2:8',
                'reference_de': 'Epheser 2:8',
                'text_kr': '너희는 그 은혜에 의하여 믿음으로 말미암아 구원을 받았으니',
                'text_de': 'Denn aus Gnade seid ihr errettet durch den Glauben',
                'priority': 2
            },
            {
                'category': 'prayer',
                'reference_kr': '빌립보서 4:6',
                'reference_de': 'Philipper 4:6',
                'text_kr': '아무 것도 염려하지 말고 다만 모든 일에 기도와 간구로',
                'text_de': 'Sorgt euch um nichts; sondern in allem lasst durch Gebet und Flehen',
                'priority': 2
            },
            {
                'category': 'comfort',
                'reference_kr': '마태복음 11:28',
                'reference_de': 'Matthäus 11:28',
                'text_kr': '수고하고 무거운 짐 진 자들아 다 내게로 오라 내가 너희를 쉬게 하리라',
                'text_de': 'Kommt her zu mir alle, die ihr mühselig und beladen seid, so will ich euch erquicken!',
                'priority': 2
            },
            {
                'category': 'wisdom',
                'reference_kr': '잠언 3:5-6',
                'reference_de': 'Sprüche 3:5-6',
                'text_kr': '너는 마음을 다하여 여호와를 신뢰하고 네 명철을 의지하지 말라',
                'text_de': 'Vertraue auf den HERRN von ganzem Herzen und verlass dich nicht auf deinen Verstand',
                'priority': 3
            },
            {
                'category': 'courage',
                'reference_kr': '여호수아 1:9',
                'reference_de': 'Josua 1:9',
                'text_kr': '강하고 담대하라 두려워하지 말며 놀라지 말라',
                'text_de': 'Sei stark und mutig! Fürchte dich nicht und verzage nicht!',
                'priority': 3
            },
        ]

        created_count = 0
        for verse_data in sample_verses:
            verse, created = BibleVerse.objects.get_or_create(
                reference_kr=verse_data['reference_kr'],
                defaults=verse_data
            )
            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f'✓ 생성: {verse.reference_kr}')
                )
            else:
                self.stdout.write(
                    self.style.WARNING(f'- 이미 존재: {verse.reference_kr}')
                )

        self.stdout.write(
            self.style.SUCCESS(f'\n총 {created_count}개의 구절이 추가되었습니다.')
        )