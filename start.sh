#!/bin/bash

echo "Starting Transcendence with HTTPS..."

if [ ! -f "nginx/certs/cert.pem" ] || [ ! -f "nginx/certs/key.pem" ]; then
    echo "Generating SSL certificates..."
    mkdir -p nginx/certs
    openssl req -x509 -newkey rsa:4096 -keyout nginx/certs/key.pem \
        -out nginx/certs/cert.pem -days 365 -nodes \
        -subj "/C=IT/ST=Italy/L=Florence/O=42School/CN=localhost"
    echo "SSL certificates generated"
fi

echo "Starting Docker services..."
docker-compose up --build --detach

echo "Application available ONLY at:"
echo "  HTTPS: https://localhost"