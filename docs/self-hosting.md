# Self-hosting

GiftWrapt ships a published Docker image and two compose files - one per bundled storage backend. Pick whichever feels less weird to you; the app behaves identically either way.

| File                                                                            | Storage sidecar                           | Why pick it                                                                                        |
| ------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`docker/compose.selfhost-garage.yaml`](../docker/compose.selfhost-garage.yaml) | [Garage](https://garagehq.deuxfleurs.fr/) | Smaller image, geo-distribution if you ever want it. Bootstraps via Garage's admin HTTP API.       |
| [`docker/compose.selfhost-rustfs.yaml`](../docker/compose.selfhost-rustfs.yaml) | [RustFS](https://rustfs.com/)             | MinIO-compatible drop-in. Credentials are arbitrary strings, bootstrap is a single `CreateBucket`. |

Already have an external bucket (AWS S3, Cloudflare R2, Supabase, etc.)? Use either compose file with `INIT_GARAGE=false` / `INIT_RUSTFS=false` and point `STORAGE_*` at your bucket. See [storage.md](./storage.md).

## Prerequisites

- Docker 24+ with Compose v2
- A host reachable over HTTP(S) at the URL you'll set as `BETTER_AUTH_URL`

The image is published by CI on every release tag:

```
ghcr.io/shawnphoffman/giftwrapt:latest
ghcr.io/shawnphoffman/giftwrapt:vX.Y.Z
```

Pin a specific version in production by setting `APP_IMAGE` in your `.env`.

## Quick start (Garage)

```bash
git clone https://github.com/shawnphoffman/wish-lists-2.0.git giftwrapt
cd giftwrapt
cp env.example docker/.env
$EDITOR docker/.env
docker compose -f docker/compose.selfhost-garage.yaml up -d
```

Open `BETTER_AUTH_URL` in a browser and sign up. The first user to register is auto-promoted to `admin`.

## Quick start (RustFS)

```bash
cp env.example docker/.env
$EDITOR docker/.env       # set STORAGE_ENDPOINT=http://rustfs:9000, INIT_RUSTFS=true
docker compose -f docker/compose.selfhost-rustfs.yaml up -d
```

## Required env vars

The annotated reference is [env.example](../env.example). At a minimum:

| Var                  | Notes                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`  | Used by both the `postgres` service and the auto-built `DATABASE_URL`.                            |
| `BETTER_AUTH_SECRET` | Long random string. `openssl rand -hex 32` is fine.                                               |
| `BETTER_AUTH_URL`    | The public origin clients reach the app from. Drives auth, email links, cookie scope.             |
| `SERVER_URL`         | Usually the same as `BETTER_AUTH_URL`.                                                            |
| `STORAGE_*`          | See [storage.md](./storage.md). Required - the server refuses to boot without storage configured. |

Garage-specific: `GARAGE_RPC_SECRET` and `GARAGE_ADMIN_TOKEN` (each `openssl rand -hex 32`).

## Database migrations

Migrations run automatically on container startup. The image bundles the SQL files and a standalone migrate CLI - no need to run anything by hand.

If you want to run migrations manually (e.g. one-shot from a CI job):

```bash
docker compose -f docker/compose.selfhost-garage.yaml exec app \
  node .output/scripts/migrate.mjs
```

## Admin CLI

If the first-user auto-promotion didn't fire (you're recovering from a deleted account, etc.):

```bash
docker compose -f docker/compose.selfhost-garage.yaml exec app \
  node .output/scripts/admin-create.mjs \
  --email=admin@example.com --password=SecurePass123 --name=Admin
```

Other bundled CLIs under `.output/scripts/`:

- `admin-reset-password.mjs` - reset a user's password and revoke their sessions
- `seed.mjs` - **destructive**, do not run in production
- `migrate.mjs` - run pending migrations

## Reverse proxy (Traefik, Caddy, nginx)

If a proxy terminates TLS in front of the container:

- Point `BETTER_AUTH_URL` and `SERVER_URL` at the public HTTPS URL (e.g. `https://giftwrapt.example.com`). Better-auth uses these to validate origins, derive the cookie `Secure` flag, and build links in outbound emails.
- The proxy must forward the `Host` header and `X-Forwarded-Proto: https` (Traefik and Caddy do this by default).
- `VITE_SERVER_URL` is baked at image build time. Leave it unset when using the published image; the client falls back to `window.location.origin`.

## Multi-origin / LAN access

By default the app trusts exactly one origin (`BETTER_AUTH_URL`). Requests from any other origin are rejected with "Invalid origin". Two env vars cover the common cases:

**`TRUSTED_ORIGINS`** (comma-separated) adds extra origins to the auth allow-list. Use this when the same instance is reachable via multiple hostnames (HTTPS via reverse proxy + LAN IP, etc.):

```env
BETTER_AUTH_URL=https://giftwrapt.example.com
TRUSTED_ORIGINS=http://192.168.1.137:3888,http://giftwrapt.local:3888
```

**`INSECURE_COOKIES=true`** drops the `Secure` flag on auth cookies. Required if any trusted origin is plain HTTP - browsers refuse to store `Secure` cookies set from an HTTP page, so login otherwise succeeds with no session cookie. This weakens session security on the HTTPS path too (cookies become sniffable on the LAN), so leave it unset unless HTTP origin login is something you actually need.

## Optional: transactional email

Email is powered by [Resend](https://resend.com) and is fully optional. The app boots and runs without it. To enable:

- `RESEND_API_KEY` (required)
- `RESEND_FROM_EMAIL` (required)
- `RESEND_FROM_NAME` (optional)
- `RESEND_BCC_ADDRESS` (optional)

When email is unconfigured:

- Comment notifications to list owners are skipped
- Day-of birthday greetings and the post-birthday gift summary cron are skipped
- The admin "send test email" button is hidden
- Birthday/Christmas/comment email toggles in admin settings are hidden

## Cron and background jobs

Several scheduled endpoints live under `/api/cron/*` (auto-archive,
birthday emails, intelligence recommendations, the item-scrape queue,
and verification cleanup). Wire them up to whatever scheduler your
platform offers (system crontab, Docker Compose worker service, etc.).
The full inventory plus per-platform recipes lives in
[.notes/cron-and-jobs.md](../.notes/cron-and-jobs.md).

## Updating

```bash
docker compose -f docker/compose.selfhost-garage.yaml pull
docker compose -f docker/compose.selfhost-garage.yaml up -d
```

Migrations run on the first container start of the new image. Always [back up](#backups) Postgres and your storage bucket before pulling a new major version.

## Backups

Two stateful volumes:

- `postgres_data` - everything except images
- `garage_data` / `rustfs_data` - all images

A nightly `pg_dump` plus an `aws s3 sync` against your storage bucket is enough. See [storage.md](./storage.md#backup-and-gc) for backend-specific notes.

> [!IMPORTANT]
> **Encrypt your database backups at rest.** better-auth stores session tokens in the `session` table as plaintext (its design - the token IS the cookie). Anyone who can read a `pg_dump` can hijack every active session until those sessions expire. Same goes for the `verification` table (password-reset tokens). Use full-disk encryption (LUKS, EBS encryption, etc.) on the volume that holds your dumps, or pipe the dump through `gpg`/`age` before writing it. The `app_settings.scrapeProviders` rows are already AES-256-GCM encrypted at rest using `BETTER_AUTH_SECRET` as the master key, but everything else is in the clear. See sec-review L4.

## Troubleshooting

- **"Invalid origin" on login**: `BETTER_AUTH_URL` doesn't match the origin the browser is using. See [multi-origin](#multi-origin--lan-access) above.
- **Login appears to succeed but I'm bounced back to the login page**: cookies aren't being stored. If you're on plain HTTP, set `INSECURE_COOKIES=true`. If you're on HTTPS, check that the proxy forwards `X-Forwarded-Proto`.
- **Storage init fails on first boot**: see the storage troubleshooting section in [storage.md](./storage.md#troubleshooting).
- **Migrations fail**: check `docker compose logs app`. Usually a connectivity issue to Postgres - the entrypoint waits for `pg_isready` but doesn't wait forever.
