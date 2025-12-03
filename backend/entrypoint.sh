#!/bin/sh

set -e

echo "Starting backend entrypoint script..."
echo "DJANGO_ENV=${DJANGO_ENV}"

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL connection (db:5432)..."
while ! nc -z db 5432; do
  sleep 0.5
done
echo "PostgreSQL connected."

# Wait for Redis to be ready
echo "Waiting for Redis connection (redis:6379)..."
# nc -z는 busybox의 nc를 사용
while ! nc -z redis 6379; do
  sleep 0.5
done
echo "Redis connected."

# Run database migrations
echo "Running database migrations..."
python manage.py migrate --noinput

# Collect static files
echo "Collecting static files..."
python manage.py collectstatic --noinput

# Start the server based on environment
if [ "$DJANGO_ENV" = "prod" ]; then
    echo "Production mode: Starting Gunicorn (WSGI) and Daphne (ASGI) servers..."
    
    # 1. Gunicorn (HTTP/WSGI)
    echo " -> Starting Gunicorn (HTTP/WSGI: 0.0.0.0:8000)"
    gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 4 --log-level info &

    # 2. Daphne (WebSocket/ASGI)
    echo " -> Starting Daphne (WebSocket/ASGI: 0.0.0.0:8001)"
    daphne -b 0.0.0.0 -p 8001 config.asgi:application &

    # 3. Wait for background processes to exit
    wait -n
    
    exit $?

else
    # Development mode
    echo "Development mode: Starting Django development server..."
    # Use 'exec' to run the server as the main container process.
    exec python manage.py runserver 0.0.0.0:8000
fi