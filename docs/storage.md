# Storage

HoffStuff stores user avatars and item photos in an S3-compatible bucket. The app never cares which backend you use: any service that speaks the S3 API works. Pick a recipe below, fill in the `STORAGE_*` env vars, and restart the app.

Jump to: [Architecture](#architecture) · [Local dev](#recipe-1-local-dev) · [Self-host](#recipe-2-self-host) · [Vercel + R2](#recipe-3-vercel--cloudflare-r2) · [Vercel + AWS S3](#recipe-4-vercel--aws-s3) · [Env vars](#env-var-reference) · [Troubleshooting](#troubleshooting)

## Architecture

```
            ┌─── upload ────────────┐
 browser ──▶│ /api/_serverFn/...    │─▶ Sharp (resize+webp) ─▶ S3 PutObject
            └───────────────────────┘                           │
                                                                ▼
                                                           (your bucket)
                                                                │
                                        ┌───────────────────────┤
                                        ▼                       ▼
  STORAGE_PUBLIC_URL set:     STORAGE_PUBLIC_URL unset:
  ${PUBLIC_URL}/<key>          /api/files/<key> (proxied via GetObject)
```

- Uploads go through the app server. Sharp transcodes to webp (256x256 cover for avatars, 1200px long edge for items) before writing to storage.
- Public URLs are either direct (when `STORAGE_PUBLIC_URL` is set) or proxied through `/api/files/*` (the default).
- Keys embed a nanoid suffix so every upload produces a new immutable URL, safe to cache aggressively.

## Recipe 1: Local dev

Docker Compose boots Postgres + Garage (daemon-only). A separate `pnpm storage:init` step assigns the cluster layout, creates the bucket, and imports your keys via Garage's admin HTTP API. It's idempotent, so running it more than once is harmless.

**Set in `.env.local` (for `pnpm dev`) AND `.env` (for `docker compose`):**

```env
STORAGE_ENDPOINT=http://localhost:3900   # .env uses http://garage:3900 instead
STORAGE_REGION=garage
STORAGE_BUCKET=wishlists
STORAGE_ACCESS_KEY_ID=GK$(openssl rand -hex 12)
STORAGE_SECRET_ACCESS_KEY=$(openssl rand -hex 32)
STORAGE_FORCE_PATH_STYLE=true

# Only used by `pnpm storage:init` and the bundled Garage daemon:
GARAGE_ADMIN_URL=http://localhost:3903    # where storage:init reaches the daemon
GARAGE_ADMIN_TOKEN=$(openssl rand -hex 32)
GARAGE_RPC_SECRET=$(openssl rand -hex 32)
```

Garage is picky about credential formats: key IDs must start with `GK` followed by exactly 24 hex chars; secrets must be 64 hex chars. AWS/R2 don't care, but Garage will reject anything shorter or non-hex.

**Boot the stack:**

```bash
docker compose up -d      # starts postgres + garage daemon
pnpm storage:init         # one-shot: layout assign, bucket create, key import
pnpm dev                  # start the app
```

**Inspect your bucket:**

```bash
# List objects:
docker compose exec garage /garage bucket info wishlists
# Drop all state and start fresh:
docker compose down -v
```

## Recipe 2: Self-host

Same stack, production-grade compose file. Garage runs inside the compose network; port 3900 is not exposed by default. The app serves images through `/api/files/*`, so clients never need direct bucket access.

The wish-lists container bootstraps Garage automatically on every cold boot when `INIT_GARAGE=true` (the compose default). The init step runs once via Garage's admin HTTP API (layout assign, bucket create, key import, permission grant), then proceeds to DB migrations and server start. Idempotent: on subsequent boots each step short-circuits when it finds its target already in place.

```bash
cp .env.example .env
# Edit .env: set STORAGE_* (same constraints as above) plus GARAGE_RPC_SECRET
# and GARAGE_ADMIN_TOKEN. INIT_GARAGE defaults to "true" in the compose file;
# override to "false" only if you're swapping Garage out for external S3.
docker compose -f docker-compose.selfhost.yml --env-file .env up -d
```

**Exposing Garage directly (optional, faster):** if you front the server with nginx or Caddy, you can offload image bandwidth to a CDN by pointing `STORAGE_PUBLIC_URL` at a reverse-proxied Garage endpoint.

```nginx
# nginx snippet
server {
    listen 443 ssl;
    server_name s3.example.com;
    location / {
        proxy_pass http://127.0.0.1:3900;
        proxy_set_header Host $host;
    }
}
```

```env
STORAGE_PUBLIC_URL=https://s3.example.com/wishlists
```

Expose port 3900 in `docker-compose.selfhost.yml` (`ports: - "3900:3900"`) and restart.

**Rotating credentials:** Garage tombstones deleted keys so the same `STORAGE_ACCESS_KEY_ID` cannot be reused once removed. To rotate, pick a new ID+secret, run `docker compose down -v` (this wipes the Garage data volume and all stored images) and `up` again. If you already have real uploads you want to keep, use `garage key import` manually with a new ID.

## Recipe 3: Vercel + Cloudflare R2

R2 is the cheapest S3-compatible option for Vercel: no egress charges and a free tier that covers this app's traffic.

1. Create a bucket in the R2 dashboard (any name; used as `STORAGE_BUCKET`).
2. **R2 → Manage R2 API Tokens → Create API token → Object Read & Write**. Scope it to your bucket.
3. Note the "Account ID" (for the endpoint) and the generated Access Key ID + Secret.
4. In Vercel project settings → Environment Variables, add:

```env
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_REGION=auto
STORAGE_BUCKET=your-bucket-name
STORAGE_ACCESS_KEY_ID=<R2 token id>
STORAGE_SECRET_ACCESS_KEY=<R2 token secret>
STORAGE_FORCE_PATH_STYLE=false
STORAGE_PUBLIC_URL=https://<account-id>.r2.cloudflarestorage.com/<bucket>
```

For a custom domain (recommended, uses R2's free CDN): **R2 → Bucket → Settings → Custom Domains**, point a subdomain at the bucket, then set `STORAGE_PUBLIC_URL=https://cdn.example.com`.

**Why leave the default unset?** When `STORAGE_PUBLIC_URL` is absent, every image load hits a Vercel Function to proxy from storage. That's a function invocation per thumbnail, which burns your quota fast. Setting it points clients at R2 directly. The app still works either way; the env var is purely an optimization.

## Recipe 4: Vercel + AWS S3

Functionally identical to R2 but with AWS's IAM model. You'll want a narrow-scoped IAM policy so the app key can only touch its own bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::your-bucket-name"
    }
  ]
}
```

```env
STORAGE_ENDPOINT=https://s3.us-east-1.amazonaws.com
STORAGE_REGION=us-east-1
STORAGE_BUCKET=your-bucket-name
STORAGE_ACCESS_KEY_ID=AKIA...
STORAGE_SECRET_ACCESS_KEY=...
STORAGE_FORCE_PATH_STYLE=false
STORAGE_PUBLIC_URL=https://d123.cloudfront.net
```

Put CloudFront in front of the bucket and set `STORAGE_PUBLIC_URL` to the distribution domain. Without CloudFront the bucket needs public-read ACLs or presigned URLs; neither is recommended.

## Env var reference

All server-side; no `VITE_*` equivalents. Validated at boot; missing any required value aborts the server with a helpful message.

| Var | Required | Purpose |
|---|---|---|
| `STORAGE_ENDPOINT` | yes | S3 API URL. Garage: `http://garage:3900` (compose) or `http://localhost:3900` (host). R2: `https://<account>.r2.cloudflarestorage.com`. AWS: `https://s3.<region>.amazonaws.com`. |
| `STORAGE_REGION` | yes | Any non-empty string for Garage (`garage`). `auto` for R2. AWS region name (`us-east-1`). |
| `STORAGE_BUCKET` | yes | Bucket name. |
| `STORAGE_ACCESS_KEY_ID` | yes | S3 access key. Garage requires `GK` + 24 hex chars. |
| `STORAGE_SECRET_ACCESS_KEY` | yes | S3 secret key. Garage requires 64 hex chars. |
| `STORAGE_FORCE_PATH_STYLE` | yes | `true` for Garage/MinIO. `false` for AWS/R2. |
| `STORAGE_PUBLIC_URL` | no | CDN base URL handed to clients. Unset = the app serves via `/api/files/*`. |
| `STORAGE_MAX_UPLOAD_MB` | no | Max upload size before Sharp runs (default 8). |
| `INIT_GARAGE` | no | `"true"` triggers the built-in Garage bootstrap during the app's entrypoint. Default is off; the self-host compose file sets it to true. Ignored for external S3 deploys. |
| `GARAGE_ADMIN_URL` | if `INIT_GARAGE=true` or using `pnpm storage:init` | Where the bootstrap reaches Garage's admin API. Defaults to `http://wish-lists-storage:3903` (self-host service name). For local dev, `http://localhost:3903`. |
| `GARAGE_ADMIN_TOKEN` | if bootstrap is used | Bearer token for Garage's admin API. 64 hex chars (`openssl rand -hex 32`). |
| `GARAGE_RPC_SECRET` | if running the bundled Garage daemon | Garage internal RPC auth. 64 hex chars. Unused by the app itself; only read by the Garage container. |

## Troubleshooting

**`storage.init.failed` on boot, HeadBucket 403/404.** Credentials or endpoint wrong, or the bucket doesn't exist yet. On compose self-host, the app's own entrypoint logs the Garage bootstrap steps before the storage boot plugin runs — check `docker compose logs app` for `[init-garage]` lines to see which step failed. On Vercel, verify the env vars match your R2/S3 dashboard; mismatched region or wrong `STORAGE_FORCE_PATH_STYLE` for the provider both surface as 403s.

**Uploads succeed but images 404 on render.** `STORAGE_PUBLIC_URL` is set to something the browser can't reach. Either unset it (falls back to the `/api/files/*` proxy), point it at a reachable CDN domain, or expose Garage through a reverse proxy and use that URL.

**Images load on Vercel but 404 on self-host.** Garage isn't exposed to the public internet and you set `STORAGE_PUBLIC_URL` anyway. Unset it and let the proxy handle it.

**`[init-garage] failed: Garage admin API ... did not become healthy`.** The app container can't reach the Garage daemon's admin port. Check that the `garage` service is healthy (`docker compose ps`) and that `GARAGE_ADMIN_URL` matches the service name in your compose file. If Garage is still booting, the 60-second wait should cover it; retry the app container if the daemon came up after the app.

**`[init-garage] failed: POST /v1/key/import failed: 409`.** Garage tombstones deleted keys, and a prior run's key cannot be re-imported. You shouldn't hit this on a normal boot because the bootstrap checks for duplicates before importing, but if it surfaces: pick a new `STORAGE_ACCESS_KEY_ID` in your `.env`, or `docker compose down -v` to wipe all Garage state.

**Sharp missing from `.output/server/node_modules/sharp` after `pnpm build`.** Nitro's externals config didn't trace it. Confirm `traceDeps: ['sharp']` is present in `vite.config.ts`. If Docker build still fails, add `COPY --from=builder /app/node_modules/sharp ./.output/server/node_modules/sharp` to the runtime stage as a belt-and-suspenders.

## First-boot walkthrough

What you should see on a clean `docker compose -f docker-compose.selfhost.yml up`:

```
$ docker compose -f docker-compose.selfhost.yml up
[garage]     INFO garage::server: Launching Admin API server...
[garage]     INFO garage_api::generic_server: S3 API server listening on http://[::]:3900
[app]        [entrypoint] starting wish-lists
[app]        [entrypoint] INIT_GARAGE=true, bootstrapping Garage...
[app]        [init-garage] admin url: http://garage:3903
[app]        [init-garage] daemon ready
[app]        [init-garage] staging layout for node <hex>…
[app]        [init-garage] applying layout at version 1
[app]        [init-garage] creating bucket wishlists
[app]        [init-garage] imported key wishlist-app
[app]        [init-garage] granting read+write+owner on wishlists to GK…
[app]        [init-garage] done
[app]        [entrypoint] Garage bootstrap complete
[app]        [entrypoint] running database migrations...
[app]        [entrypoint] starting server
[app]        INFO storage.boot: storage.ready
[app]        INFO: server ready on :3000
```

After first sign-in, upload an avatar from Settings. Confirm:

```bash
docker compose exec garage /garage bucket info wishlists
# Should show: Objects: 1
```

## Migration notes

V1 `image_url` hotlinks are preserved as-is during migration. New uploads go through the pipeline; old external URLs continue to render directly from their origins. There's no automatic rehosting: if you want a V1 image stored locally, re-upload it from the item edit dialog.

## Backup and GC

The admin data export at `src/api/backup.ts` covers DB rows only. Bucket contents are separate and use the provider's own backup story:

- **Garage:** `garage bucket snapshot` is not yet in v1.0.1; for now, back up the `garage_data` volume directly (`docker run --rm -v wishlist-dev_garage_data:/data alpine tar -czf- -C /data .`).
- **R2:** versioning is on by default; enable lifecycle rules in the R2 dashboard.
- **AWS S3:** enable bucket versioning + lifecycle rules.

Orphaned objects (from interrupted deletes) aren't currently swept; a `scripts/storage-gc.ts` tool is a planned follow-up.
