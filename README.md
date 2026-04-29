<div align="center">
  <img src="public/android-chrome-512x512.png" alt="GiftWrapt logo" width="128" height="128" />

# GiftWrapt

**Sharing wish lists made easy.**

[Getting started](./docs/getting-started.md) ·
[Self-hosting](./docs/self-hosting.md) ·
[Deployment](./docs/deployment.md) ·
[Contributing](./docs/contributing.md)

</div>

---

## What it is

GiftWrapt is a self-hostable wish list app for families and small groups. Make a list, share it with the people who shop for you, and let them quietly claim items so nobody buys the same thing twice. Think Amazon's wish list, except it isn't trying to sell you anything and you actually own your data.

Built for the kind of household that has:

- a couple of adults who need to coordinate gifts for each other and the kids
- birthdays, Christmas, "this is the dishwasher we want, please nobody else buy a dishwasher"
- a relative who keeps emailing you Etsy links

## Features

- **Lists and items** with photos, prices, priorities, quantities, and notes
- **URL scraping** that pulls product info, photos, and prices from a pasted link (with optional AI extraction for stubborn sites)
- **Claims** so giftgivers can mark items as "I've got this" without the recipient seeing
- **Reveal flow** for after the gift is given
- **Guardian / partner relationships** - guardians get full access to their kids' lists; partners see each other's public lists
- **Add-ons** so giftgivers can suggest items they think the recipient should add
- **List editors** for collaborative lists
- **Comments** on items
- **Optional transactional email** (Resend) for comment notifications and birthday reminders
- **Multi-theme** light, dark, and a Christmas mode
- **Admin tools** for user management, scraping/AI tuning, storage inspection, and email tests

## Tech stack

- [TanStack Start](https://tanstack.com/start) (React 19 + Vite + Nitro)
- [Drizzle](https://orm.drizzle.team/) on Postgres
- [better-auth](https://better-auth.com) for sessions
- Any S3-compatible bucket for image storage ([Garage](https://garagehq.deuxfleurs.fr/) or [RustFS](https://rustfs.com/) bundled for self-host; [storage recipes](./docs/storage.md) for AWS S3, Cloudflare R2, Supabase)
- [Resend](https://resend.com) for transactional email (optional)
- [shadcn/ui](https://ui.shadcn.com) + Tailwind CSS v4
- [Storybook](https://storybook.js.org/) for component development

## Quick start

### Local development

```bash
pnpm install
cp env.example .env.local
docker compose --profile garage up -d   # postgres + storage
pnpm storage:init
pnpm db:migrate
pnpm dev
```

App is at <http://localhost:3000>. Full walkthrough: [getting-started.md](./docs/getting-started.md).

### Self-host with Docker

```bash
cp env.example docker/.env
$EDITOR docker/.env       # set POSTGRES_PASSWORD, BETTER_AUTH_SECRET, BETTER_AUTH_URL, STORAGE_*
docker compose -f docker/compose.selfhost-garage.yaml up -d
```

A RustFS variant is in [`docker/compose.selfhost-rustfs.yaml`](./docker/compose.selfhost-rustfs.yaml). Pick whichever bundled storage you like - the app behaves identically. Full guide: [self-hosting.md](./docs/self-hosting.md).

### Deploy to Vercel

`pnpm vercel-build` is preconfigured to run migrations and build. Bring your own Postgres + S3-compatible bucket. Notes: [deployment.md](./docs/deployment.md#vercel).

## Documentation

| Topic                                               | Doc                                                  |
| --------------------------------------------------- | ---------------------------------------------------- |
| Local dev setup                                     | [docs/getting-started.md](./docs/getting-started.md) |
| Self-hosting with Docker                            | [docs/self-hosting.md](./docs/self-hosting.md)       |
| Deployment options (Vercel, Docker, custom Node)    | [docs/deployment.md](./docs/deployment.md)           |
| Storage backends (Garage, RustFS, S3, R2, Supabase) | [docs/storage.md](./docs/storage.md)                 |
| URL scraping pipeline                               | [docs/scraping.md](./docs/scraping.md)               |
| Local-dev seeded users and admin recovery           | [docs/local-dev-admin.md](./docs/local-dev-admin.md) |
| Upgrading shadcn components                         | [docs/shadcn-upgrades.md](./docs/shadcn-upgrades.md) |
| Contributing, scripts, conventions                  | [docs/contributing.md](./docs/contributing.md)       |

## Status

GiftWrapt is a personal project that I run for my family. It's stable enough that I trust it with our actual gift coordination, but it's still pre-1.0 and the schema occasionally changes between releases. Pin a specific image tag in production and read the changelog before upgrading.

Releases are cut by [release-please](https://github.com/googleapis/release-please) on every merge to `main`; the [`CHANGELOG.md`](./CHANGELOG.md) is the authoritative history. Container images are published to GitHub Container Registry: `ghcr.io/shawnphoffman/giftwrapt:vX.Y.Z`.

## License

MIT.
