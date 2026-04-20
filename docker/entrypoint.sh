#!/bin/sh
set -e

# Run database migrations before starting the server.
echo "Running database migrations..."
node .output/scripts/migrate.mjs
echo "Migrations complete."

exec node .output/server/index.mjs
