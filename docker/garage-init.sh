#!/bin/sh
# Garage bootstrap: one-shot container that runs after the `garage` service
# is healthy, then exits. Idempotent on re-run. Reads the same config file as
# the daemon so CLI commands connect via RPC using GARAGE_RPC_SECRET from env.
#
# Required env:
#   GARAGE_RPC_SECRET        shared with the daemon
#   STORAGE_BUCKET           bucket to create
#   STORAGE_ACCESS_KEY_ID    S3 credentials the app will use
#   STORAGE_SECRET_ACCESS_KEY
#
# We import the caller-supplied key pair rather than generating one. That
# way the user has a single source of truth (their .env), the keys survive
# `docker compose down -v`, and rotating is a matter of editing .env and
# re-running `up`.

set -eu

say() { printf '[garage-init] %s\n' "$*"; }

: "${GARAGE_RPC_SECRET:?GARAGE_RPC_SECRET must be set}"
: "${STORAGE_BUCKET:?STORAGE_BUCKET must be set}"
: "${STORAGE_ACCESS_KEY_ID:?STORAGE_ACCESS_KEY_ID must be set}"
: "${STORAGE_SECRET_ACCESS_KEY:?STORAGE_SECRET_ACCESS_KEY must be set}"

KEY_NAME="wishlist-app"

say "waiting for garage daemon..."
i=0
until garage status >/dev/null 2>&1; do
	i=$((i + 1))
	if [ "$i" -gt 60 ]; then
		say "timed out waiting for garage after 60s"
		exit 1
	fi
	sleep 1
done
say "daemon ready"

# 1. Cluster layout. On first boot, the single node has no role; `layout show`
# shows it under "nodes that don't have a role". We assign it, then apply as
# version 1. On subsequent boots the layout is already applied; skip.
if garage layout show 2>&1 | grep -q "No nodes currently have a role\|No nodes in the cluster"; then
	NODE_ID=$(garage node id -q | awk -F'@' '{print $1}')
	say "assigning layout to node $NODE_ID"
	garage layout assign -z dc1 -c 1G "$NODE_ID"
	garage layout apply --version 1
elif ! garage layout show | grep -Eq '^[a-f0-9]+[[:space:]]+'; then
	# Defensive branch: if the "no role" message changes across Garage versions,
	# fall back on "is there a roled node line?" Assume applied if we see one.
	NODE_ID=$(garage node id -q | awk -F'@' '{print $1}')
	say "no roled nodes detected; assigning layout to $NODE_ID"
	garage layout assign -z dc1 -c 1G "$NODE_ID"
	garage layout apply --version 1
else
	say "layout already applied, skipping"
fi

# 2. Bucket. `bucket info` exits non-zero if the bucket is missing.
if garage bucket info "$STORAGE_BUCKET" >/dev/null 2>&1; then
	say "bucket $STORAGE_BUCKET already exists, skipping"
else
	say "creating bucket $STORAGE_BUCKET"
	garage bucket create "$STORAGE_BUCKET"
fi

# 3. App key. Garage refuses to re-import a key with the same ID once it's
# been created, even after deletion ("we can't let you create a new key with
# the same ID"), so we import once and leave it. If you need to rotate
# credentials, bring down the stack with `docker compose down -v` (wipes the
# Garage data volume too) or change STORAGE_ACCESS_KEY_ID to a new value.
if garage key info "$KEY_NAME" >/dev/null 2>&1; then
	say "key $KEY_NAME already exists, skipping import"
else
	say "importing key $KEY_NAME"
	garage key import --yes -n "$KEY_NAME" "$STORAGE_ACCESS_KEY_ID" "$STORAGE_SECRET_ACCESS_KEY"
fi

# 4. Grant permissions. Idempotent: reapplying same flags is a no-op.
say "granting read+write+owner on $STORAGE_BUCKET to $KEY_NAME"
garage bucket allow --read --write --owner --key "$KEY_NAME" "$STORAGE_BUCKET"

say "done"
