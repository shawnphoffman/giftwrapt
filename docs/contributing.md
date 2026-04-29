# Contributing

Thanks for your interest. GiftWrapt is a personal project, but contributions are welcome. This page covers the dev workflow once your local stack is up. For first-time setup see [Getting started](./getting-started.md).

## Project layout

```
src/
  routes/        TanStack Router file-based routes
  components/    UI components (shadcn-derived in components/ui)
  db/            Drizzle schema and queries
  lib/           Server-side helpers (auth, storage, scraping, email)
  emails/        React Email templates
  api/           Server-only utilities and integrations
drizzle/         Generated SQL migrations (committed)
docker/          Self-host compose files and runtime scripts
docs/            All long-form documentation
scripts/         CLI entry points (admin, seed, storage init)
```

## Scripts

| Command                 | What it does                                              |
| ----------------------- | --------------------------------------------------------- |
| `pnpm dev`              | Run migrations and start the dev server on `:3000`.       |
| `pnpm build`            | Production build (Nitro server + standalone CLI bundles). |
| `pnpm test`             | Unit and Storybook tests via Vitest.                      |
| `pnpm test:integration` | Integration tests (requires Postgres).                    |
| `pnpm test:all`         | Everything.                                               |
| `pnpm lint`             | ESLint over the whole tree.                               |
| `pnpm format`           | Prettier check.                                           |
| `pnpm check`            | Format and autofix lint. Run before committing.           |
| `pnpm storybook`        | Storybook on `:6006`.                                     |
| `pnpm dev-email`        | React Email preview server on `:3001`.                    |

## Database

| Command            | What it does                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `pnpm db:generate` | Generate a SQL migration from schema changes. **Commit the output.**                      |
| `pnpm db:migrate`  | Apply pending migrations.                                                                 |
| `pnpm db:push`     | Push the schema directly (dev only, skips migrations).                                    |
| `pnpm db:studio`   | Drizzle Studio.                                                                           |
| `pnpm db:seed`     | Seed local DB with test users and data. Requires `SEED_SAFE=1`. **Truncates everything.** |

The local seeded admin and other test users are documented in [local-dev-admin.md](./local-dev-admin.md).

## Storybook

Component stories live next to their components (`*.stories.tsx`). Storybook runs as a Vitest project so stories are typechecked and smoke-tested on every `pnpm test`. New UI work should ship with a story for the interesting states.

## Conventions

### TypeScript and React

- React 19, React Compiler is enabled. Don't reach for `useMemo` or `useCallback` reflexively; profile first.
- Server functions and loaders live next to their routes. Pure data helpers go in `src/lib/` or `src/db/queries/`.
- Prefer Drizzle's relational query API over hand-rolled SQL where it fits.

### shadcn components

Components in `src/components/ui/` are owned by this repo, not pulled from a package. See [shadcn-upgrades.md](./shadcn-upgrades.md) for how to pull upstream improvements without losing local customizations.

### Styling

Tailwind CSS v4. Follow the existing `cn()` + `class-variance-authority` patterns in `src/components/ui/`.

### Commits

Conventional Commits, imperative mood, ≤72 chars on the subject:

```
feat(lists): add bulk archive action
fix(scraping): fall back to og:image when product image is missing
docs(self-host): document RustFS bootstrap
```

Pre-commit hooks run `lint-staged` (Prettier + ESLint on staged files). Commitlint enforces the format.

### Releases

`release-please` watches `main` and opens a PR with the next version bump and `CHANGELOG.md` entry derived from commit messages. Merging that PR tags a release and triggers the GHCR image publish (`ghcr.io/shawnphoffman/giftwrapt:vX.Y.Z` plus `:latest`).

## Security model: CSRF and server functions

State-changing TanStack server functions and route handlers should always use `method: 'POST'`. The CSRF posture for those calls relies entirely on the auth cookie's `SameSite=Lax` attribute (better-auth default, set in `src/lib/auth.ts`):

- **Lax** prevents the auth cookie from being attached to cross-origin `POST` requests. An attacker page on `evil.example` can render a form that posts to our server function, but the browser strips the cookie, the auth middleware sees no session, and the call is refused.
- **Top-level navigation `GET`s do carry the Lax cookie**, but state changes are POST-only, so a malicious link can't trigger one. Reads (`method: 'GET'` server fns) are CSRF-irrelevant by definition; they don't change state.
- **Same-site XSS would defeat this** (along with any explicit CSRF token), so the `Content-Security-Policy` headers in `vite.config.ts` and the existing input-validation pattern (every server fn uses `.inputValidator()` with zod) are the actual XSS defense.

Concretely, when adding a new server function or route:

- Use `createServerFn({ method: 'POST' })` for anything that writes. Never accept writes via `GET`.
- Don't enable `crossSubDomainCookies` on better-auth without re-evaluating this posture; sharing the cookie across subdomains widens the trust boundary.
- Don't set your own cookies bypassing better-auth's cookie helpers. If you need one, ensure `httpOnly: true`, `sameSite: 'lax'` (or `'strict'`), `secure` on HTTPS.

See sec-review L6.

## Pull requests

1. Branch from `main`.
2. Run `pnpm check` and `pnpm test` before opening the PR.
3. If you touched the schema, commit the generated migration in `drizzle/`.
4. If you touched UI, add or update a Storybook story.
5. Note any new env vars in `env.example` and the relevant doc.

## Where to find things

- App overview and quick start: [README](../README.md)
- Local dev: [getting-started.md](./getting-started.md)
- Self-hosting with Docker: [self-hosting.md](./self-hosting.md)
- Storage backends: [storage.md](./storage.md)
- URL scraping pipeline: [scraping.md](./scraping.md)
- Local dev admin / seeded users: [local-dev-admin.md](./local-dev-admin.md)
- Upgrading shadcn components: [shadcn-upgrades.md](./shadcn-upgrades.md)
