<div align="center">
  <img src="public/android-chrome-512x512.png" alt="GiftWrapt logo" width="128" height="128" />

# GiftWrapt

**Wish lists made easy.**

[Getting started](https://giftwrapt.dev)

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

### One-click deploy

| Target              | Button                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | What it provisions                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Vercel + Supabase   | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fshawnphoffman%2Fgiftwrapt&project-name=giftwrapt&repository-name=giftwrapt&buildCommand=pnpm+vercel-build&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22supabase%22%2C%22productSlug%22%3A%22supabase%22%7D%5D&env=BETTER_AUTH_SECRET&envDescription=Generate+with+openssl+rand+-base64+32&envLink=https%3A%2F%2Fgithub.com%2Fshawnphoffman%2Fgiftwrapt%2Fblob%2Fmain%2Fdocs%2Fdeployment.md%23one-click-vercel--supabase) | App + Supabase Postgres. Storage is a separate paste step.       |
| Railway             | [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/github?repo=shawnphoffman%2Fgiftwrapt)                                                                                                                                                                                                                                                                                                                                                                                                                                                           | App. Add Postgres + storage from the Railway dashboard.          |
| Render              | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fshawnphoffman%2Fgiftwrapt)                                                                                                                                                                                                                                                                                                                                                                                                               | App + managed Postgres (via `render.yaml`). Storage added after. |
| Coolify (self-host) | [![Deploy on Coolify](https://img.shields.io/badge/Deploy%20on-Coolify-6B46C1)](./docs/deployment.md#one-click-coolify-self-host)                                                                                                                                                                                                                                                                                                                                                                                                                                               | Full stack: app + Postgres + Garage S3 from the bundled compose. |

Step-by-step for each (including the Supabase S3 paste): [deployment.md → One-click deployment](./docs/deployment.md#one-click-deployment).

## Status

GiftWrapt is a personal project that I run for my family. This is the v2 rewrite of the original wish-lists app, rebuilt from the ground up based on everything I learned running v1: cleaner data model, proper relationship-based access (guardians, partners, children), claim/reveal flows, and a saner deploy story. It's stable enough that I trust it with our actual gift coordination, but it's still pre-1.0 and the schema occasionally changes between releases. Pin a specific image tag in production and read the changelog before upgrading.

Releases are cut by [release-please](https://github.com/googleapis/release-please) on every merge to `main`; the [`CHANGELOG.md`](./CHANGELOG.md) is the authoritative history. Container images are published to GitHub Container Registry: `ghcr.io/shawnphoffman/giftwrapt:vX.Y.Z`.

## AI Contribution Disclosure

![Level 4-5](https://badgen.net/badge/AI%20Assistance/Level%204--5?color=orange)

> [!NOTE]
> This project lives somewhere between [Level 4 and Level 5 AI assistance](https://www.visidata.org/blog/2026/ai/), sliding around depending on what corner of the codebase you're poking at. Claude Code wrote a lot of the docs, tests, and scaffolding, plus a healthy chunk of app code. The spicier bits (data model, access-control rules, auth, scraping pipeline, deploy story) are mostly hand-written, with AI riding shotgun as a rubber duck and reviewer.
>
> I'm a software engineer with 10+ years of experience and I've read every line. I understand how it all fits together. That said: it's pre-1.0, I'm one person, and some things almost certainly slipped past me. Before I cut a 1.0 there'll be a proper full pass, security review, and peer feedback. Until then, treat it like the lovingly-assembled family project that it is - kick the tires, file issues, don't run it on a nuclear reactor.

## License

[GNU Affero General Public License v3.0](./LICENSE). If you run a modified version of GiftWrapt as a network service, you must offer your users the corresponding source code.
