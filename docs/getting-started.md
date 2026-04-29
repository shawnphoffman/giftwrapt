# Getting started

Local development setup. For production deployment see [deployment.md](./deployment.md).

## Requirements

- Node.js 22+
- pnpm 10+ (Corepack will pick up the version pinned in `package.json`)
- Docker (for local Postgres + S3-compatible storage)

## 1. Install dependencies

```bash
pnpm install
```

## 2. Configure environment

```bash
cp env.example .env.local
```

At minimum, set:

- `DATABASE_URL` - point at your local Postgres (the bundled compose stack listens on `localhost:54321`)
- `BETTER_AUTH_SECRET` - any long random string
- `BETTER_AUTH_URL` - `http://localhost:3000` for dev
- `STORAGE_*` - see [storage.md](./storage.md) for the recipe matching your chosen backend

Optional:

- `RESEND_API_KEY` + `RESEND_FROM_EMAIL` - enables transactional email. Without these, comment notifications, birthday emails, and the admin "send test email" button silently no-op.

The full annotated reference lives in [env.example](../env.example).

## 3. Start dependencies

The bundled compose file boots Postgres plus exactly one S3-compatible storage backend. Pick one:

```bash
# Garage (default; admin-API bootstrap)
docker compose --profile garage up -d
pnpm storage:init

# OR RustFS (MinIO-compatible, simpler bootstrap)
docker compose --profile rustfs up -d
pnpm storage:init:rustfs
```

Stick with one for the lifetime of the checkout - they share Postgres but bind different storage volumes.

## 4. Run migrations and seed

```bash
pnpm db:migrate
SEED_SAFE=1 pnpm db:seed   # optional, populates test users
```

> [!WARNING]
> `db:seed` truncates the database before inserting fixtures. It refuses to run unless `DATABASE_URL` points at a known-local host AND `SEED_SAFE=1` is set, but it absolutely will clobber your local data. See [local-dev-admin.md](./local-dev-admin.md) for the seeded credentials.

## 5. Run the app

```bash
pnpm dev
```

App: <http://localhost:3000>

## Other dev servers

| Command          | Port | What                            |
| ---------------- | ---- | ------------------------------- |
| `pnpm storybook` | 6006 | Component explorer + a11y addon |
| `pnpm dev-email` | 3001 | React Email preview             |
| `pnpm db:studio` | 4983 | Drizzle Studio                  |

## Resetting

```bash
docker compose --profile garage down -v   # nuke Postgres + Garage volumes
# (or --profile rustfs)
```

The destructive `pnpm db:reset` script is intentionally not run automatically. See [local-dev-admin.md](./local-dev-admin.md#regaining-access-without-reseeding) for the safe break-glass paths.

## Next steps

- [Contributing](./contributing.md) - scripts, conventions, PR workflow
- [Storage](./storage.md) - swapping backends, env reference
- [Scraping](./scraping.md) - URL scraping pipeline (browserless, AI extractors)
