#!/bin/sh
set -e

# Run database migrations before starting the server.
echo "Running database migrations..."
pnpm db:migrate
echo "Migrations complete."

exec node .output/server/index.mjs
