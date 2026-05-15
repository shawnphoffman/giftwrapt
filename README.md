<div align="center">
  <img src="public/android-chrome-512x512.png" alt="GiftWrapt logo" width="128" height="128" />

# GiftWrapt

**Wish lists made easy.**

[Documentation](https://giftwrapt.dev) · [Changelog](./CHANGELOG.md) · [Issues](https://github.com/shawnphoffman/giftwrapt/issues)

</div>

---

GiftWrapt is a self-hostable wish list app for families and small groups. Make a list, share it with the people who shop for you, and let them quietly claim items so nobody buys the same thing twice. Think Amazon's wish list, except it isn't trying to sell you anything and you actually own your data.

Built for the kind of household that has:

- a couple of adults who need to coordinate gifts for each other and the kids
- birthdays, Christmas, "this is the dishwasher we want, please nobody else buy a dishwasher"
- a relative who keeps emailing you Etsy links

## Documentation

Everything lives at **[giftwrapt.dev](https://giftwrapt.dev)**:

- [Getting started](https://giftwrapt.dev/overview/getting-started/) - the five-minute version.
- [Self-hosting with Docker](https://giftwrapt.dev/deploy/self-hosting/) - the base stack plus opt-in addons (storage, cron, email, AI, MCP).
- [Hosted (Vercel + Supabase)](https://giftwrapt.dev/deploy/hosted/) - the tried-and-true managed path.
- [Features](https://giftwrapt.dev/features/lists/) - lists, items, claims, permissions, privacy, scraping, AI suggestions.
- [Configuration](https://giftwrapt.dev/configuration/settings/) - admin panel, env vars, storage, scraping, AI provider, cron.

## Quick start

One-click deploy to Railway (web service + Postgres + 5 cron services, auto-generated secrets):

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/giftwrapt)

Or run locally with Docker:

```bash
git clone https://github.com/shawnphoffman/giftwrapt.git
cd giftwrapt
cp .env.example docker/.env
$EDITOR docker/.env    # set POSTGRES_PASSWORD, BETTER_AUTH_SECRET, BETTER_AUTH_URL, CRON_SECRET
docker compose -f docker/compose.selfhost-garage-cron.yaml up -d
```

Open `BETTER_AUTH_URL` in a browser. The first user to sign up is auto-promoted to admin.

For local hacking on the codebase, see [Local development](https://giftwrapt.dev/contributing/local-development/).

## Tech stack

- [TanStack Start](https://tanstack.com/start) (React 19 + Vite + Nitro)
- [Drizzle](https://orm.drizzle.team/) on Postgres
- [better-auth](https://better-auth.com) for sessions
- Any S3-compatible bucket for image storage (Garage / RustFS bundled; AWS S3, Cloudflare R2, Supabase Storage all supported)
- [Resend](https://resend.com) for transactional email (optional)
- [shadcn/ui](https://ui.shadcn.com) + Tailwind CSS v4

## Status

GiftWrapt is a personal project that I run for my family. It's stable enough that I trust it with our actual gift coordination, but it's still pre-1.0 and the schema occasionally changes between releases. Pin a specific image tag in production and read the [changelog](./CHANGELOG.md) before upgrading.

Releases are cut by [release-please](https://github.com/googleapis/release-please) on every merge to `main`. Container images are published to GitHub Container Registry: `ghcr.io/shawnphoffman/giftwrapt:vX.Y.Z`.

## AI Contribution Disclosure

![Level 4-5](https://badgen.net/badge/AI%20Assistance/Level%204--5?color=orange)

> [!NOTE]
> This project lives somewhere between [Level 4 and Level 5 AI assistance](https://www.visidata.org/blog/2026/ai/), sliding around depending on what corner of the codebase you're poking at. Claude Code wrote a lot of the docs, tests, and scaffolding, plus a healthy chunk of app code. The spicier bits (data model, access-control rules, auth, scraping pipeline, deploy story) are mostly hand-written, with AI riding shotgun as a rubber duck and reviewer.
>
> I'm a software engineer with 10+ years of experience and I've read every line. I understand how it all fits together. That said: it's pre-1.0, I'm one person, and some things almost certainly slipped past me. Before I cut a 1.0 there'll be a proper full pass, security review, and peer feedback. Until then, treat it like the lovingly-assembled family project that it is - kick the tires, file issues, don't run it on a nuclear reactor.

## License

[GNU Affero General Public License v3.0](./LICENSE). If you run a modified version of GiftWrapt as a network service, you must offer your users the corresponding source code.
