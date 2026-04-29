# Deployment

GiftWrapt is a regular [TanStack Start](https://tanstack.com/start) app, so it runs anywhere a Node.js server runs. Three paths are documented and supported:

| Path                                       | When to pick it                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| [Self-host with Docker](./self-hosting.md) | You want full control. One `docker compose up`, runs anywhere.               |
| [Vercel](#vercel)                          | You want zero-ops hosting and don't mind shipping data to managed providers. |
| [Custom Node deploy](#custom-node-deploy)  | You're putting it on Fly, Railway, a VPS, etc.                               |

## Vercel

The repo is set up for Vercel deployment out of the box.

1. Import the repo in the Vercel dashboard.
2. Set the build command to `pnpm vercel-build` (this is `drizzle-kit migrate && vite build` - migrations run during the build using the `DATABASE_URL` env var).
3. Provide env vars (see [env.example](../env.example)). For Vercel specifically:
   - `DATABASE_URL` from a managed Postgres (Vercel Postgres, Neon, Supabase, etc.)
   - `STORAGE_*` pointing at an external S3-compatible bucket. Cloudflare R2, AWS S3, and Supabase Storage all work; recipes are in [storage.md](./storage.md). Garage and RustFS are self-host-only.
   - `BETTER_AUTH_URL` set to your production URL.

The bundled `INIT_GARAGE` / `INIT_RUSTFS` flags should stay unset on Vercel; you're using an external bucket.

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
