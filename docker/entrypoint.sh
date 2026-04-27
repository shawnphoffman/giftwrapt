#!/bin/sh
set -e

# Startup banner - without this, a container that fails to boot is completely
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

# Optional: bootstrap a bundled S3-compatible storage sidecar before booting
# the app. The app doesn't care which backend is behind STORAGE_*; these
# steps only apply when you're running the matching sidecar from compose.
# Leave both flags unset (or set to anything other than "true") for managed
# S3 backends like R2, AWS, or Supabase. Pick one bundled storage, not both.
if [ "${INIT_GARAGE:-false}" = "true" ]; then
  echo "[entrypoint] INIT_GARAGE=true, bootstrapping Garage..."
  node .output/scripts/init-garage.mjs
  echo "[entrypoint] Garage bootstrap complete"
fi

if [ "${INIT_RUSTFS:-false}" = "true" ]; then
  echo "[entrypoint] INIT_RUSTFS=true, ensuring bucket exists..."
  node .output/scripts/init-rustfs.mjs
  echo "[entrypoint] RustFS bootstrap complete"
fi

echo "[entrypoint] running database migrations..."
node .output/scripts/migrate.mjs
echo "[entrypoint] migrations complete"

echo "[entrypoint] starting server"
exec node .output/server/index.mjs
