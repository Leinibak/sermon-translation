# Webboard Project

A simple web board application built with Django, React, and PostgreSQL.

## Tech Stack

- **Backend**: Django, Django REST Framework
- **Frontend**: React, React Router, Axios
- **Database**: PostgreSQL
- **Deployment**: Docker, Docker Compose

## Local Development Setup

### Prerequisites
- Docker & Docker Compose
- Git

### 1. Clone the project
```bash
git clone <repository-url>
cd webboard
```

### 2. Set up environment variables
```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env
```
> **Note:** Do not commit actual secrets to version control.

### 3. Run with Docker Compose
```bash
# Build and run all services
docker-compose up --build

# Run in detached mode
docker-compose up -d

# Follow logs
docker-compose logs -f

# Stop containers
docker-compose down

# Remove containers and volumes
docker-compose down -v
```

### 4. Initialize data (optional)
```bash
# Create Django superuser
docker-compose exec backend python manage.py createsuperuser
```

## Access URLs

- **Frontend**: http://localhost
- **Backend API**: http://localhost:8000/api
- **Django Admin**: http://localhost:8000/admin

## API Endpoints

- `GET /api/posts/` - List posts
- `POST /api/posts/` - Create a post
- `GET /api/posts/{id}/` - Get post details
- `PUT /api/posts/{id}/` - Update a post
- `DELETE /api/posts/{id}/` - Delete a post
- `GET /api/posts/health/` - Health check

## Deployment Guide (OCI)

### 1. Prepare OCI instance
```bash
# Install Docker
sudo apt update
sudo apt install -y docker.io docker-compose
sudo usermod -aG docker $USER

# Install Git
sudo apt install -y git
```

### 2. Deploy project
```bash
git clone <repository-url>
cd webboard

# Set production environment variables
nano backend/.env
nano frontend/.env

# Run services
docker-compose up -d
```

### 3. Firewall
Open required ports in OCI:
- 80 (HTTP)
- 443 (HTTPS, optional)
- 8000 (Django API, for development)

### 4. Optional: Domain setup
- Get public IP from OCI
- Configure DNS
- Optionally, configure Nginx reverse proxy

## Development Guide

### Backend
```bash
# Create migrations
docker-compose exec backend python manage.py makemigrations

# Apply migrations
docker-compose exec backend python manage.py migrate

# Access Django shell
docker-compose exec backend python manage.py shell
```

### Frontend
```bash
# Run development server with hot reload
cd frontend
npm start
```

## Troubleshooting

### CORS issues
- Check `CORS_ALLOWED_ORIGINS` in `backend/.env`
- Ensure frontend URL is included

### Database connection errors
- Ensure PostgreSQL container is running: `docker-compose ps`
- Verify environment variables: `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

### Port conflicts
- Change ports in `docker-compose.yml` if already in use

## License
MIT

