#!/bin/sh
set -e

# Startup banner — without this, a container that fails to boot is completely
# opaque. Mask the DB password before logging so we don't leak credentials.
mask_url() {
  # strip everything between the first ':' after scheme and the '@' separator
  echo "$1" | sed -E 's#(://[^:]*:)[^@]*(@)#\1***\2#'
}

echo "[entrypoint] starting wish-lists"
echo "[entrypoint]   NODE_ENV=${NODE_ENV:-unset}"
echo "[entrypoint]   LOG_LEVEL=${LOG_LEVEL:-info}"
echo "[entrypoint]   LOG_PRETTY=${LOG_PRETTY:-false}"
if [ -n "${DATABASE_URL:-}" ]; then
  echo "[entrypoint]   DATABASE_URL=$(mask_url "$DATABASE_URL")"
else
  echo "[entrypoint]   DATABASE_URL=(unset)"
fi

# Optional: bootstrap a bundled Garage instance before booting the app.
# The app doesn't care what S3-compatible bucket is behind STORAGE_*; this
# step only applies when you're running the Garage sidecar from the compose
# stack. Leave INIT_GARAGE unset (or set to anything other than "true") for
# managed S3 backends like R2, AWS, or Supabase.
if [ "${INIT_GARAGE:-false}" = "true" ]; then
  echo "[entrypoint] INIT_GARAGE=true, bootstrapping Garage..."
  node .output/scripts/init-garage.mjs
  echo "[entrypoint] Garage bootstrap complete"
fi

echo "[entrypoint] running database migrations..."
node .output/scripts/migrate.mjs
echo "[entrypoint] migrations complete"

echo "[entrypoint] starting server"
exec node .output/server/index.mjs
