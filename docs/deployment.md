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

The app exposes several `/api/cron/*` endpoints (auto-archive, birthday
emails, intelligence recommendations, item-scrape queue, verification
cleanup) that need an external scheduler. For Vercel, add a `crons`
array to `vercel.json` with one entry per endpoint; for Railway /
Render, point a Cron service at each URL with `Authorization: Bearer
$CRON_SECRET`. The full deployment-platform matrix and the lock-key
namespace convention for adding a new cron-tick runner live in
[.notes/cron-and-jobs.md](../.notes/cron-and-jobs.md).

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
