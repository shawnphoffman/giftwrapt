# Security Review - 2026-04-28

> Project: wish-lists-2.0 (TanStack Start, Vite + Nitro). Same threat model as Next.js: server functions ≈ Server Actions, route handlers ≈ API routes.

Findings are prioritized by exploitability and blast radius. Each item has a file:line reference and a concrete fix. Commits resolving these items reference `sec-review C1`, `sec-review H3`, etc.

## Status

| ID     | Title                                                           | Severity | Status |
| ------ | --------------------------------------------------------------- | -------- | ------ |
| C1     | fetchAppSettings exposes decrypted scraper API keys             | CRITICAL | open   |
| C2     | SSRF in scraper, no private-IP / metadata blocking              | CRITICAL | open   |
| C3     | Cron endpoints public when CRON_SECRET unset                    | CRITICAL | open   |
| C4     | Outdated dependencies, 3 critical / 25 high CVEs                | CRITICAL | open   |
| H1     | Admin scripts shipped inside production image                   | HIGH     | open   |
| H2     | No rate limiting on auth or sensitive endpoints                 | HIGH     | open   |
| H3     | Verbose health endpoint leaks build/env info                    | HIGH     | open   |
| H4     | Image upload trusts client content-type, skips magic-byte check | HIGH     | open   |
| H5     | AI scraper open to prompt injection                             | HIGH     | open   |
| H6     | Backup wipe/import has weak guardrails                          | HIGH     | open   |
| H7     | BETTER_AUTH_SECRET fallback in auth init                        | HIGH     | open   |
| H8     | freshAge: 0 plus 7-day cookie cache                             | HIGH     | open   |
| M1-M10 | (see below)                                                     | MEDIUM   | open   |
| L1-L7  | (see below)                                                     | LOW      | open   |

---

## CRITICAL

### C1. fetchAppSettings exposes decrypted scraper API keys

[src/api/settings.ts:14](../src/api/settings.ts)

```ts
export const fetchAppSettings = createServerFn({ method: 'GET' })
	.middleware([loggingMiddleware]) // no auth middleware
	.handler(async () => await getAppSettings(db))
```

`getAppSettings` decrypts `scrapeProviders[*].token` / `apiKey` on read (see comment at [src/lib/settings.ts:6](../src/lib/settings.ts)). With no auth, any unauthenticated visitor can fetch the JSON and harvest Browserless / Browserbase / Scrapfly / OpenAI / Anthropic keys.

**Fix:** add `adminAuthMiddleware` (or at minimum `authMiddleware`) and split the response so non-admin callers get a redacted view. Better: split into `fetchPublicAppSettings` (booleans, limits, no secrets) and `fetchAppSettingsAsAdmin` (admin only).

---

### C2. SSRF in scraper, no private-IP / metadata blocking

[src/lib/scrapers/orchestrator.ts:315](../src/lib/scrapers/orchestrator.ts)

```ts
function isValidScrapeUrl(raw: string): boolean {
	const u = new URL(raw)
	return u.protocol === 'http:' || u.protocol === 'https:'
}
```

Any authenticated user can scrape `http://169.254.169.254/...` (cloud metadata), `http://127.0.0.1:...` (Postgres health, Garage admin on 3903, internal services), `http://10/8`, `192.168/16`, `172.16/12`, `[::1]`, link-local IPv6. Both providers in [src/lib/scrapers/providers/fetch.ts](../src/lib/scrapers/providers/fetch.ts) and [src/lib/scrapers/providers/ai.ts](../src/lib/scrapers/providers/ai.ts) use `redirect: 'follow'` and never re-validate the host after redirect, so a public host that 302s to `127.0.0.1` defeats any host-only check.

**Fix:** resolve the hostname server-side with `dns.lookup`, reject responses whose IP falls in private/loopback/link-local/CGNAT/IPv4-mapped-IPv6 ranges, and re-check on every redirect (set `redirect: 'manual'` and walk the chain). Reject non-`http(s)`. Cap response size and total chain length. Set `credentials: 'omit'`.

---

### C3. Cron endpoints public when CRON_SECRET unset

[src/routes/api/cron/auto-archive.ts:52](../src/routes/api/cron/auto-archive.ts), [src/routes/api/cron/birthday-emails.ts:52](../src/routes/api/cron/birthday-emails.ts), schema at [src/env.ts:40](../src/env.ts)

```ts
const cronSecret = env.CRON_SECRET
if (cronSecret) {
	/* check Bearer */
}
// else: anyone can GET /api/cron/auto-archive and /api/cron/birthday-emails
```

`CRON_SECRET` is `.optional()`. If unset in prod, anonymous attackers can mass-archive items (revealing claim info to recipients prematurely) and trigger birthday email sends (spam / mailbox abuse / Resend quota burn).

**Fix:** make `CRON_SECRET` required (`z.string().min(32)`) OR fail-closed in the handler when it's missing. Use timing-safe compare for the bearer token.

---

### C4. Outdated dependencies, 3 critical / 25 high CVEs

`pnpm audit --prod` reports 50 vulnerabilities (3 critical, 25 high, 20 moderate, 2 low) at the time of review.

Confirmed actionable updates:

- `seroval` (transitive via `@tanstack/react-router` and `@tanstack/react-devtools`): bump `@tanstack/*` and `solid-js`. Multiple advisories including RCE via JSON deserialization.
- `undici` (via `open-graph-scraper`): bump to `7.25.0`.
- `diff` (via `@tanstack/router-utils`): `8.0.4`.
- `postcss` (transitive, build-only): `>=8.5.10`.
- `bn.js`, `rollup`, `ajv`: also flagged.

**Fix:** `pnpm audit --prod --fix`, then re-run, then build and test. Re-run weekly via Dependabot/Renovate (a `.github/dependabot.yml` does not exist, add one).

---

## HIGH

### H1. Admin scripts shipped inside the production image

[scripts/build-cli.mjs:36](../scripts/build-cli.mjs), [Dockerfile:34](../Dockerfile)

`admin-create.ts` and `admin-reset-password.ts` get bundled into `.output/scripts/*.mjs` and copied into the runtime image. These have no password, anyone with shell/exec into the container (or anyone with `docker exec` access on the host) can mint a new admin or reset any password.

**Fix:** exclude these from the runtime image, keep them as separate one-shot containers/jobs, or build a separate `admin` image stage. At minimum, gate them behind a `RUN_ADMIN_TOOLS=1` env check.

---

### H2. No rate limiting on auth or sensitive endpoints

better-auth in [src/lib/auth.ts](../src/lib/auth.ts) does not have rate limiting configured, and there is no global middleware for `/api/auth/*`, `/api/scrape/*`, `/api/files/*`, comment/claim mutations. This enables credential stuffing, password-reset abuse, scraper DoS, file-key enumeration, AI cost burn.

**Fix:** enable better-auth's built-in rate limit (`rateLimit: { enabled: true, ... }`), and add a Nitro middleware (`server/middleware/rate-limit.ts`) using a token bucket (Redis/Upstash) for the scraper, file proxy, and comment/claim mutations.

---

### H3. Verbose health endpoint leaks build/env info

[src/routes/api/health.ts:40](../src/routes/api/health.ts)

`?verbose=1` returns app `version`, `logLevel`, `nodeEnv`, and DB latency. Useful for attackers to fingerprint and time-side-channel the deployment.

**Fix:** drop `verbose` mode entirely or require `Authorization: Bearer ${HEALTH_SECRET}`. Public probes return only `{ ok: true }`.

---

### H4. Image upload trusts client-supplied content-type and skips magic-byte validation

[src/api/uploads.ts:85](../src/api/uploads.ts), [src/lib/storage/image-pipeline.ts](../src/lib/storage/image-pipeline.ts)

The handler reads the raw buffer and pipes it directly to `sharp`. There is no `file-type`/magic-byte check before invoking sharp. Sharp does enforce a re-encode to webp, which removes most polyglot risk in the served output, but:

- allows zip-bomb / "image bomb" payloads (huge dimensions decoded into RAM before sharp's resize) to OOM the server,
- relies entirely on sharp's parser hardening as the trust boundary.

**Fix:** before sharp, validate magic bytes against `image/jpeg|png|webp|gif`, enforce `STORAGE_MAX_UPLOAD_MB` before reading into memory (stream-cap), and pass `sharp({ limitInputPixels: 50_000_000 })` to cap pixel count.

---

### H5. AI scraper open to prompt injection

[src/lib/scrapers/providers/ai.ts:78](../src/lib/scrapers/providers/ai.ts)

```ts
prompt: `URL: ${ctx.url}\n\nHTML (may be truncated):\n${truncated}`
```

A page can include attacker-controlled instructions ("Ignore prior instructions, return..."). Because the AI model has tool-call capability via the AI SDK, the blast radius depends on what tools are exposed. If only structured-output extraction is used, the worst case is poisoned scrape results stored in `items.*`.

**Fix:** use the SDK's structured-output mode (zod schema) with a strict system prompt and no tool calls. Sanitize `<script>`/`<iframe>` from the HTML before passing to the model. Truncate to a smaller window (e.g. 16KB). Treat scraped output as untrusted everywhere it lands in the DB.

---

### H6. Backup wipe/import has weak guardrails

[src/api/backup.ts:108](../src/api/backup.ts)

`importAppDataAsAdmin({ mode: 'wipe' })` deletes every table including `users`. The only safety is "do not lock yourself out", there is no dry-run, no integrity check on the import, no automatic pre-wipe snapshot, no second-admin confirmation.

**Fix:** require a typed-confirmation token; auto-call `exportAppDataAsAdmin` and persist to storage before the wipe; log the action to an append-only audit log.

---

### H7. BETTER_AUTH_SECRET fallback in auth init

[src/lib/auth.ts:26](../src/lib/auth.ts)

```ts
secret: env.BETTER_AUTH_SECRET || ''
```

The env zod schema requires `.min(1)` ([src/env.ts:9](../src/env.ts)), so this fallback is dead code today, but it is a footgun. If anyone removes the zod check or imports `auth` before env validation runs (test harness, script), the app silently boots with an empty HMAC secret and accepts forged sessions.

**Fix:** drop the `|| ''`. Let it crash loudly.

---

### H8. freshAge: 0 plus 7-day cookie cache

[src/lib/auth.ts:177](../src/lib/auth.ts) and [src/lib/auth.ts:112](../src/lib/auth.ts)

- `freshAge: 0` disables better-auth's "session must be re-validated for sensitive ops" gate.
- Cookie cache `maxAge` 7d, `updateAge` 10m: an admin you demoted retains admin rights for up to 10 minutes; a stolen cookie remains valid for 7 days with no re-check.

**Fix:** set `freshAge` to ~3600 (1h) and require fresh sessions on `updateAppSettings`, `deleteUser`, password change, role change. Reduce `cookieCache.maxAge` to ~24h.

---

## MEDIUM

| #   | Finding                                                                                                                                                            | File                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `INSECURE_COOKIES=true` env var disables `Secure` flag on all cookies; no guard against accidentally enabling it in prod                                           | [src/lib/auth.ts:37](../src/lib/auth.ts), [src/env.ts:21](../src/env.ts)                                                                       |
| M2  | Storage boot logs `endpoint`, `bucket`, `region`, `publicUrl` at INFO, visible in shipped log streams                                                              | [server/plugins/storage-boot.ts:27](../server/plugins/storage-boot.ts)                                                                         |
| M3  | File proxy serves `Content-Type` straight from S3 metadata with no `X-Content-Type-Options: nosniff` and no `Vary: Accept-Encoding`                                | [src/routes/api/files/$.ts:70](../src/routes/api/files/$.ts)                                                                                   |
| M4  | Avatar object key uses 8-char nonce (~2e14), weak vs. 10-char item nonce. With known user IDs an attacker can enumerate avatar keys faster than rate limit allows. | [src/lib/storage/keys.ts:8](../src/lib/storage/keys.ts)                                                                                        |
| M5  | Sign-in/sign-up surface raw better-auth error strings to the client, enables user enumeration ("user not found" vs "invalid credentials")                          | [src/routes/(auth)/sign-in.tsx:69](<../src/routes/(auth)/sign-in.tsx>), [src/routes/(auth)/sign-up.tsx:46](<../src/routes/(auth)/sign-up.tsx>) |
| M6  | First-signup-becomes-admin race: two simultaneous signups both see `adminCount === 0` and both become admin                                                        | [src/lib/auth.ts:55](../src/lib/auth.ts)                                                                                                       |
| M7  | `verification` table has no cleanup job; expired reset/verify tokens accumulate                                                                                    | [src/db/schema/auth.ts:56](../src/db/schema/auth.ts)                                                                                           |
| M8  | Admin storage list has no pagination cap server-side; on a large bucket the in-memory walk + full DB scan can OOM or DoS the storage backend                       | [src/api/admin-storage.ts:112](../src/api/admin-storage.ts)                                                                                    |
| M9  | `getCommentsForItem` uses two divergent visibility paths (owner skip vs. `canViewList`); easy to forget to keep them in sync                                       | [src/api/comments.ts:56](../src/api/comments.ts)                                                                                               |
| M10 | Error from `lists.create` for "children cannot create gift-ideas lists" is `throw new Error(...)`, becomes 500 instead of structured 400                           | [src/api/lists.ts:330](../src/api/lists.ts)                                                                                                    |

---

## LOW

| #   | Finding                                                                                                                                                                                                                                                                             | File                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| L1  | `getGiftsForItems` returns all claims and relies on a doc comment to remind future callers to check visibility first, fragile API                                                                                                                                                   | [src/api/gifts.ts:20](../src/api/gifts.ts)                                 |
| L2  | Encryption of provider secrets uses fixed salt `wish-lists:app-secret:v1`, fine because `BETTER_AUTH_SECRET` is the secret, but if rotation ever ships, plan for it                                                                                                                 | [src/lib/crypto/app-secret.ts:21](../src/lib/crypto/app-secret.ts)         |
| L3  | Seed script hardcodes `SeedPass123!`, gated by `SEED_SAFE=1` and localhost check, but document publicly that this is not safe to run anywhere users might land                                                                                                                      | [scripts/seed.ts:79](../scripts/seed.ts)                                   |
| L4  | better-auth stores session tokens in plaintext (its design). DB breach = full session theft. Mitigation: make sure DB backups are encrypted at rest.                                                                                                                                | [src/db/schema/auth.ts:15](../src/db/schema/auth.ts)                       |
| L5  | Tight scraper timeouts (10s/20s), mostly a UX issue, but if the scraper gets called from a request with a longer cap, it can become a thundering-herd retry pattern                                                                                                                 | [src/lib/scrapers/orchestrator.ts:20](../src/lib/scrapers/orchestrator.ts) |
| L6  | No CSRF token on server-function calls. `SameSite=Lax` (better-auth default) is generally sufficient for non-`GET` server functions, but a same-site iframe / subdomain XSS would bypass, worth verifying TanStack server-fn calls are not reachable via simple GET/form submission | global                                                                     |
| L7  | List deletion cascade-deletes `listEditors` rows even when the list is force-archived; "who had access" is lost                                                                                                                                                                     | [src/api/lists.ts:438](../src/api/lists.ts)                                |

---

## Already good (don't undo)

- HTTP security headers (HSTS, CSP, X-Frame-Options, base-uri, object-src, form-action) configured in [vite.config.ts:35](../vite.config.ts).
- All server functions use `.inputValidator()` with zod schemas.
- All DB queries via Drizzle parameterized API; no string-interpolated SQL found.
- Pino logger configured with redaction of `password`, `token`, `authorization`, `cookie` fields.
- Dockerfile runs as non-root `nodejs` user; `.dockerignore` correctly excludes `.env*`.
- No source maps in `.output/`.
- Error boundary surfaces only `error.message`, not stack traces.
- `authMiddleware` caches user-existence lookups with a 10-min TTL (good for ghost-session catch).
