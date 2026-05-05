# Deployment

GiftWrapt is a regular [TanStack Start](https://tanstack.com/start) app, so it runs anywhere a Node.js server runs. Three paths are documented and supported:

| Path                                       | When to pick it                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| [One-click deploy](#one-click-deployment)  | Quickest start. Vercel, Railway, Render, or Coolify, picked from the README. |
| [Self-host with Docker](./self-hosting.md) | You want full control. One `docker compose up`, runs anywhere.               |
| [Vercel (manual)](#vercel)                 | You want zero-ops hosting and don't mind shipping data to managed providers. |
| [Custom Node deploy](#custom-node-deploy)  | You're putting it on Fly, a VPS, etc.                                        |

## One-click deployment

The README has badges for four targets. Each one provisions a different slice of the stack; the table below is the honest "what's auto, what you do" rundown.

| Target              | Database                   | Storage                      | Other env vars                                |
| ------------------- | -------------------------- | ---------------------------- | --------------------------------------------- |
| Vercel + Supabase   | Auto (Supabase Postgres)   | Manual paste of S3 keys      | `BETTER_AUTH_SECRET` prompted at deploy time. |
| Railway             | Add Postgres plugin        | Bring your own (R2/AWS/etc.) | Set in Railway dashboard after deploy.        |
| Render              | Auto (managed Postgres)    | Bring your own (R2/AWS/etc.) | `BETTER_AUTH_SECRET` is auto-generated.       |
| Coolify (self-host) | Auto (Postgres in compose) | Auto (Garage in compose)     | One `docker/.env` file, same as self-hosting. |

### One-click: Vercel + Supabase

The Vercel button uses the Marketplace `stores=[{...integrationSlug:"supabase"...}]` query param, so the deploy flow:

1. Forks this repo into your account.
2. Provisions a Supabase project alongside the Vercel project. Supabase's integration injects `POSTGRES_URL`, `SUPABASE_URL`, and the Supabase anon/service-role keys.
3. Prompts you for `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`).
4. Builds with `pnpm vercel-build` (migrations + Vite build).

[`src/env.ts`](../src/env.ts) has fallbacks so you don't need to rename the Supabase-injected vars: `DATABASE_URL` falls back to `POSTGRES_URL`, and `STORAGE_ENDPOINT` is auto-derived from `SUPABASE_URL` (it becomes `<SUPABASE_URL>/storage/v1/s3`). On Vercel production deploys, `BETTER_AUTH_URL` is also auto-derived from `VERCEL_PROJECT_PRODUCTION_URL`, so first sign-up works without an "Invalid origin" paste step. (Preview deploys live on per-branch hostnames; if you want auth working there, set `BETTER_AUTH_URL` explicitly on the preview environment or add the preview hostname to `TRUSTED_ORIGINS`.)

After the first deploy, **enable Supabase Storage S3 access and paste the credentials**:

1. In the Supabase dashboard for the new project: **Project Settings → Storage → S3 Connection** and click "Enable S3".
2. Generate an access key. Supabase gives you an Access Key ID and Secret Access Key.
3. Create a bucket (e.g. `giftwrapt`) in **Storage → Buckets**.
4. In the Vercel project's environment variables, add:
   - `STORAGE_ACCESS_KEY_ID` = the Supabase S3 access key id
   - `STORAGE_SECRET_ACCESS_KEY` = the secret
   - `STORAGE_BUCKET` = `giftwrapt` (or whatever you named the bucket)
   - `STORAGE_REGION` = the region shown in the Supabase S3 panel
   - `STORAGE_FORCE_PATH_STYLE` = `true` (Supabase S3 uses path-style)
5. Redeploy. The app picks up the new vars and image uploads start working.

Supabase Storage S3 details and a longer recipe live in [storage.md → Supabase Storage](./storage.md).

### One-click: Railway

> **Heads up:** the Railway button is _not_ truly one-click yet. It deploys the app service only - you have to add Postgres and wire env vars yourself before the app will boot. The steps below get you to a working deploy in about 3 minutes.

The button creates a single service that builds from this repo's `Dockerfile`, using [`railway.json`](../railway.json) for the healthcheck and restart policy. Railway's GitHub deploy URL has no concept of multi-service blueprints (unlike Render's `render.yaml`), so the database and env wiring are manual.

**After clicking the badge:**

1. **Wait for the first build to fail.** It will - the app exits because `DATABASE_URL` is unset. That's expected.
2. **Add Postgres.** In the Railway project canvas: **+ New → Database → Add PostgreSQL**. Wait for it to go green.
3. **Wire the database.** Click your app service → **Variables** tab → **+ New Variable**:
   - Name: `DATABASE_URL`
   - Value: click the `{}` icon and pick `Postgres → DATABASE_URL` (or type `${{Postgres.DATABASE_URL}}` - the service name must match exactly, including case).
4. **Set the auth vars** (same Variables tab, **+ New Variable** for each):
   - `BETTER_AUTH_SECRET` = output of `openssl rand -base64 32` (run locally, paste the result).
   - `BETTER_AUTH_URL` = `https://${{RAILWAY_PUBLIC_DOMAIN}}` - Railway substitutes the assigned `*.up.railway.app` host automatically. If you've already added a custom domain, hardcode that instead (e.g. `https://giftwrapt.example.com`).
5. **Redeploy.** The variable changes trigger a new deploy. Watch the deploy logs - you should see migrations run and then `starting giftwrapt`.
6. **(Optional) Image uploads.** The app boots fine without storage; upload endpoints return 503 until you wire `STORAGE_*` vars to an external S3 bucket (Cloudflare R2, AWS S3, Supabase Storage). Recipes in [storage.md](./storage.md).

**Common issue: `DATABASE_URL is not set; cannot run migrations`** in deploy logs after step 3. Either the Postgres service has a different name than `Postgres` (check the canvas tile, edit the reference to match), or you saved the variable but didn't redeploy - reference resolution happens at deploy time, not on save.

**Common issue: `Invalid origin` on `/sign-up`.** `BETTER_AUTH_URL` is missing or doesn't match the URL you're visiting. The app falls back to `http://localhost:3000`, which rejects the Railway-assigned origin. Set it per step 4 and redeploy.

### One-click: Render

The Render button reads [`render.yaml`](../render.yaml), which declares a managed Postgres database, an `image`-runtime web service that pulls `ghcr.io/shawnphoffman/giftwrapt:latest`, and the env-var wiring between them.

1. Click the badge. Render reads the blueprint and creates both the database and the web service.
2. `DATABASE_URL` is wired automatically; `BETTER_AUTH_SECRET` is auto-generated.
3. After the first deploy, set `BETTER_AUTH_URL` and `SERVER_URL` to your Render-assigned URL (or your custom domain).
4. To enable image uploads, fill in the `STORAGE_*` vars (left as `sync: false` so Render prompts for them). Same recipes as the other targets - see [storage.md](./storage.md).

Pin a specific image tag (`ghcr.io/shawnphoffman/giftwrapt:vX.Y.Z`) in `render.yaml` once you're past the "does it work" phase, otherwise every deploy pulls the latest published image.

### One-click: Coolify (self-host)

Coolify is self-hosted, so there's no public URL to deep-link to - you trigger the deploy from your own Coolify dashboard.

1. In your Coolify instance: **+ New → Public Repository**.
2. Repository: `https://github.com/shawnphoffman/giftwrapt`.
3. Build pack: **Docker Compose**.
4. Compose file: `docker/compose.selfhost-garage.yaml` (or `compose.selfhost-rustfs.yaml`).
5. Coolify reads the compose file and spins up app + Postgres + Garage in one go.
6. Fill in the env vars Coolify prompts for (same set as `env.example`): `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `POSTGRES_PASSWORD`, `STORAGE_*`, `GARAGE_*`. The bundled `INIT_GARAGE=true` handles bucket creation on first boot.

This is the only target that lands the entire stack (app + DB + storage) without any post-deploy paste step. Full self-host walkthrough: [self-hosting.md](./self-hosting.md).

## Vercel

The repo is set up for Vercel deployment out of the box.

1. Import the repo in the Vercel dashboard.
2. Set the build command to `pnpm vercel-build` (this is `drizzle-kit migrate && vite build` - migrations run during the build using the `DATABASE_URL` env var).
3. Provide env vars (see [env.example](../env.example)). For Vercel specifically:
   - `DATABASE_URL` from a managed Postgres (Vercel Postgres, Neon, Supabase, etc.)
   - `STORAGE_*` pointing at an external S3-compatible bucket. Cloudflare R2, AWS S3, and Supabase Storage all work; recipes are in [storage.md](./storage.md). Garage and RustFS are self-host-only.
   - `BETTER_AUTH_URL` is auto-derived from `VERCEL_PROJECT_PRODUCTION_URL` on production deploys; only set it explicitly if you've added a custom domain you want auth bound to instead of the `*.vercel.app` URL.

The bundled `INIT_GARAGE` / `INIT_RUSTFS` flags should stay unset on Vercel; you're using an external bucket.

## Cron and background jobs

The app exposes five `/api/cron/*` endpoints (auto-archive, birthday
emails, intelligence recommendations, item-scrape queue, verification
cleanup). They are protected by `CRON_SECRET` and **only fire if a
scheduler is wired up** - the app does not self-schedule. Always set
`CRON_SECRET` to a long random string before relying on cron.

Confirm what's actually firing in production via `/admin/scheduling`.
Each row shows last run, last success (amber when stale > 3× the
expected interval), next fire time computed from the schedule, and the
last 24h count of runs and errors. There is also a "Run now" button
per endpoint that bypasses the schedule - the fastest way to verify
each route is healthy after a deploy.

### Vercel

The repo ships `vercel.json` with all five endpoints at **daily**
cadences (Hobby-tier compatible). Schedules are in UTC. To customize:
edit `vercel.json` and redeploy - Vercel reads it at build time, so
there is no admin-dashboard-editable schedule. The admin scheduling
page surfaces a banner explaining this on Vercel deployments.

- **Hobby**: daily-only.
- **Pro / Enterprise**: any cron expression. Bump intelligence to
  hourly (`0 * * * *`) and the scrape queue to 5-min (`*/5 * * * *`)
  if you want them at full cadence; both runners are designed for
  sub-daily ticks.
- `CRON_SECRET` must be set in the project's env vars or every
  invocation returns 503. Vercel auto-attaches the
  `Authorization: Bearer ...` header.

### Railway

Railway's `railway.json` only declares one service per blueprint, so
**cron is not auto-configured** - you have to add Cron services from
the Railway dashboard after the first deploy. The web service alone
will run, but no cron will ever fire and `/admin/scheduling` will
report "never" everywhere.

Add one Cron service per endpoint via the Railway canvas (`+ New →
Cron`). Use the same daily UTC schedules as the other targets and a
curl start command:

```bash
curl -fsSL --retry 3 -H "Authorization: Bearer $CRON_SECRET" $SERVER_URL/api/cron/auto-archive
```

Set `CRON_SECRET` and `SERVER_URL` once at the project (shared) env
group so every Cron inherits them.

### Render

`render.yaml` ships **all five Cron Jobs by default** alongside the
web service and managed Postgres. The blueprint button provisions
everything. `CRON_SECRET` is auto-generated on the web service and
inherited by every cron via `fromService:`, so there's no manual env
paste. To customize: edit `schedule:` on any cron service in
`render.yaml` and re-deploy. To drop a job (e.g. birthday-emails when
Resend isn't configured) delete its service block. Render Cron Jobs
require a paid plan (Hobby+); the free tier does not include cron.

### Self-hosted Docker Compose

Both production compose files
([docker/compose.selfhost-garage.yaml](../docker/compose.selfhost-garage.yaml)
and
[docker/compose.selfhost-rustfs.yaml](../docker/compose.selfhost-rustfs.yaml))
include a **`cron` sidecar** by default - a tiny alpine container
running busybox `crond` with a crontab generated at boot from
[docker/cron-entrypoint.sh](../docker/cron-entrypoint.sh). It hits
the app over the compose network at `http://app:3000` with
`Authorization: Bearer $CRON_SECRET`.

To customize schedules: edit `docker/cron-entrypoint.sh` and recreate
the service:

```sh
docker compose -f docker/compose.selfhost-garage.yaml up -d --force-recreate cron
```

The cron daemon is busybox; standard 5-field cron expressions (UTC).
Per-user advisory locks make higher cadences safe.

### Customizing schedules across deployments

Cron expressions live in three places that should stay in sync:

| File                        | Used by                                   |
| --------------------------- | ----------------------------------------- |
| `vercel.json`               | Vercel's scheduler at deploy time         |
| `render.yaml`               | Render Cron Jobs                          |
| `docker/cron-entrypoint.sh` | Self-hosted Docker Compose cron sidecar   |
| `src/lib/cron/registry.ts`  | `/admin/scheduling` "next fire" estimates |

Railway is dashboard-managed (no committed file). When you change a
schedule, update every file your deployment uses _plus_ the registry
so the admin page's expectations match reality. The registry is the
only one that affects what's shown to the user; the other three drive
actual firing.

The full deployment-platform matrix, the lock-key namespace convention
for adding a new cron-tick runner, and the complete sample-schedule
table live in [.notes/cron-and-jobs.md](../.notes/cron-and-jobs.md).

## Custom Node deploy

```bash
pnpm install --frozen-lockfile
pnpm build
node .output/server/index.mjs
```

The build emits a self-contained Nitro bundle in `.output/server/`. Run migrations once before first boot:

```bash
node .output/scripts/migrate.mjs
```

All env vars from [env.example](../env.example) apply. The runtime needs:

- A reachable Postgres (`DATABASE_URL`)
- An S3-compatible bucket (`STORAGE_*`)
- A long-random `BETTER_AUTH_SECRET` and the public `BETTER_AUTH_URL`

The Dockerfile in the repo root is the canonical reference for what a minimal production runtime looks like.

## Releases and the GHCR image

`release-please` watches `main` and opens a release PR with the next semver bump and a generated `CHANGELOG.md` entry. Merging that PR tags the release, which triggers the GHCR image publish:

```
ghcr.io/shawnphoffman/giftwrapt:latest
ghcr.io/shawnphoffman/giftwrapt:vX.Y.Z
```

Pin a specific tag in production by setting `APP_IMAGE` in your `.env`. The compose files default to `:latest` for first-time setup but you should pin once you're past the "does it work" phase.

## What's where

| Concern                      | Where                                      |
| ---------------------------- | ------------------------------------------ |
| Local development            | [getting-started.md](./getting-started.md) |
| Docker self-host             | [self-hosting.md](./self-hosting.md)       |
| Storage backends and recipes | [storage.md](./storage.md)                 |
| URL scraping infra           | [scraping.md](./scraping.md)               |
| Local seeded admin           | [local-dev-admin.md](./local-dev-admin.md) |
