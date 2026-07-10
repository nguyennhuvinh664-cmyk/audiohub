#!/bin/sh
# Wait for database to be available (Neon free tier hibernates)
MAX_RETRIES=5
RETRY=0

echo "[start] Waiting for database..."

while [ $RETRY -lt $MAX_RETRIES ]; do
  if npx prisma migrate deploy 2>&1; then
    echo "[start] Database connected, migrations applied."
    break
  fi
  RETRY=$((RETRY + 1))
  echo "[start] Database not ready, retry $RETRY/$MAX_RETRIES in 10s..."
  sleep 10
done

if [ $RETRY -ge $MAX_RETRIES ]; then
  echo "[start] WARNING: Migrations failed after $MAX_RETRIES retries, starting anyway..."
fi

npx prisma generate
node dist/server.js
