# Makefile (선택사항 - 편의 명령어)
.PHONY: build up down logs shell-backend shell-db migrate makemigrations createsuperuser

build:
	docker-compose build

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

shell-backend:
	docker-compose exec backend python manage.py shell

shell-db:
	docker-compose exec db psql -U postgres -d webboard

migrate:
	docker-compose exec backend python manage.py migrate

makemigrations:
	docker-compose exec backend python manage.py makemigrations

createsuperuser:
	docker-compose exec backend python manage.py createsuperuser

restart:
	docker-compose restart

clean:
	docker-compose down -v
	docker system prune -f
