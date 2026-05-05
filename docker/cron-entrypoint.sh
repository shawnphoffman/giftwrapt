#!/bin/sh
# =============================================================================
# Cron sidecar entrypoint
# =============================================================================
# Self-hosted cron service: writes a crontab with env-substituted values
# and runs busybox crond in the foreground. Used by compose.selfhost-*.yaml.
#
# Why pre-substitute vs reading env at run time: busybox crond does not pass
# the daemon's environment to spawned commands - it builds a minimal env
# (HOME / SHELL / LOGNAME / USER / PATH). Pre-substituting writes the literal
# values into the crontab so each curl line resolves them at run time without
# needing env passthrough.
#
# Schedules below mirror vercel.json so the admin /admin/scheduling page's
# "next fire" estimate matches reality. Edit either side together.

set -eu

# Install curl if the base image doesn't have it yet (alpine 3.x ships
# without curl by default; running idempotently is fine on re-create).
if ! command -v curl >/dev/null 2>&1; then
	apk add --no-cache curl >/dev/null
fi

if [ -z "${CRON_SECRET:-}" ]; then
	echo "FATAL: CRON_SECRET is not set; refusing to start the cron service." >&2
	echo "       Set CRON_SECRET in docker/.env (or the compose env file)." >&2
	exit 1
fi

APP_URL="${CRON_APP_URL:-http://app:3000}"

mkdir -p /etc/crontabs
cat > /etc/crontabs/root <<EOF
# Generated $(date -u +%FT%TZ) by docker/cron-entrypoint.sh
0 3 * * * curl -fsSL -H "Authorization: Bearer ${CRON_SECRET}" ${APP_URL}/api/cron/cleanup-verification > /proc/1/fd/1 2>&1
0 4 * * * curl -fsSL -H "Authorization: Bearer ${CRON_SECRET}" ${APP_URL}/api/cron/intelligence-recommendations > /proc/1/fd/1 2>&1
0 5 * * * curl -fsSL -H "Authorization: Bearer ${CRON_SECRET}" ${APP_URL}/api/cron/item-scrape-queue > /proc/1/fd/1 2>&1
0 6 * * * curl -fsSL -H "Authorization: Bearer ${CRON_SECRET}" ${APP_URL}/api/cron/auto-archive > /proc/1/fd/1 2>&1
0 7 * * * curl -fsSL -H "Authorization: Bearer ${CRON_SECRET}" ${APP_URL}/api/cron/birthday-emails > /proc/1/fd/1 2>&1
EOF

echo "cron sidecar ready: APP_URL=${APP_URL} TZ=${TZ:-UTC}"
echo "----- crontab -----"
sed -e "s/Bearer ${CRON_SECRET}/Bearer <redacted>/" /etc/crontabs/root
echo "-------------------"

exec crond -f -L /dev/stdout
