#!/bin/sh
set -e

# Create watch directory if it doesn't exist
mkdir -p /app/data/watch

# Run database migrations
echo "Running database migrations..."
npx drizzle-kit push

# Start the server
echo "Starting server..."
exec node dist/index.js
