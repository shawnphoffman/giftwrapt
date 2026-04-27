# URL Scraping Strategy

The shipped reference. Read this first; it covers the whole pipeline in one
page. The full design rationale lives in the planning history. The infra
side (running the browserless / flaresolverr containers, traefik, sablier)
is in the operator notes (`_NOTES_/scraping/browserless-plan.md`, kept locally).

## Architecture

```
add-item dialog          /admin/scraping       /admin/ai
       │                       │                   │
       │ paste URL             │ tune knobs        │ flip AI toggles
       ▼                       ▼                   ▼
┌────────────────────────────────────────────────────────────┐
│  GET /api/scrape/stream  (SSE, src/routes/api/scrape)      │
│   ─ auth + URL validate                                    │
│   ─ build provider chain via loadConfiguredProviders()     │
└────────────────────────────────────────────────────────────┘
                       │ orchestrate()
                       ▼
┌────────────────────────────────────────────────────────────┐
│  src/lib/scrapers/orchestrator.ts                          │
│   sequential chain (fall through on low score) ─┐          │
│   parallel racers (fire alongside)              ├──► score │
│   cache lookup / dedup                          │   then   │
│   per-attempt persistence to itemScrapes        │   pick   │
│   post-passes (clean-title, …)                  ┘   winner │
└────────────────────────────────────────────────────────────┘
            ▲
            │ ScrapeProvider interface (one per backend)
            │
  ┌─────────┴────────┬─────────────────────────────────────────────┐
  │ fetch-provider   │  scrapeProviders[] (admin-configurable)     │
  │ (always on)      │  browserless / flaresolverr / browserbase   │
  │                  │  -fetch / browserbase-stagehand / custom-   │
  │                  │  http, in admin-controlled chain order      │
  └──────────────────┴─────────────────────────────────────────────┘
                          ▲ ai-provider runs as a parallel racer
                            (admin toggle + valid AI config)
```

## Tiers

Each configured entry has a `tier` (1-5). The orchestrator runs tier 1's
entries in parallel, merges their results, and only advances to tier 2 if
the merged score fell below `scrapeQualityThreshold`. Same for tier 2 →
tier 3, etc. The always-on `fetch-provider` is implicit tier 0; it runs
first, alone. The `ai-provider` is a parallel racer (no tier) that fires
alongside the tier loop and competes via final scoring; commit B will
migrate it into the same tiered array as everything else.

Why tiers: cost control. Put cheap stuff in tier 1 (browserless, custom
HTTP) and paid hosted services in tier 2 / 3. Pages where tier 1 already
gets a usable result never spend money on Browserbase.

Default tier on new entries:

- `browserless`, `flaresolverr`, `custom-http` → tier 1
- `browserbase-fetch` → tier 2
- `browserbase-stagehand` → tier 3

Admin tunes from `/admin/scraping` via the Tier dropdown on each card.

## Merging within a tier

When a tier has multiple entries that all succeed, the orchestrator does
**fill-the-gaps merging** before scoring:

- Sort contributions by per-provider score (descending). The
  highest-scoring result is the "base."
- For each scalar field (`title`, `description`, `price`, `currency`,
  `siteName`, `finalUrl`) that the base left empty, fill from runners-up
  in score order. First non-empty wins.
- `imageUrls` always concatenates and dedupes across all contributors.
- Re-score the merged result. If it now clears `scrapeQualityThreshold`,
  the tier wins and later tiers don't fire.

The merged result is persisted with `scraperId: 'merged:a,b,c'` so the
admin can trace which providers contributed. `/admin/scrapes` renders that
as `Provider A + Provider B (merged)`.

Implementation: [src/lib/scrapers/merge.ts](src/lib/scrapers/merge.ts).
Mirrors the same priority-fill pattern the local extractor uses across
its OG / JSON-LD / Microdata / Heuristics layers.

## Provider types

Configured in `/admin/scraping` (DB-backed `appSettings.scrapeProviders`,
with secret fields encrypted at rest). The admin can add multiple entries
of the same type (e.g. two Browserless instances) and drag to reorder
within a tier; the Tier dropdown moves an entry between tiers.

| type                    | mode         | secret fields   | best for                              |
| ----------------------- | ------------ | --------------- | ------------------------------------- |
| `browserless`           | sequential   | `token`         | self-hosted JS rendering              |
| `flaresolverr`          | sequential   | -               | self-hosted Cloudflare bypass         |
| `browserbase-fetch`     | sequential   | `apiKey`        | hosted JS rendering, no LLM           |
| `browserbase-stagehand` | **parallel** | `apiKey`        | hosted structured extraction with LLM |
| `custom-http`           | sequential   | `customHeaders` | bring-your-own scraper service        |

Plus the always-on built-ins:

| id               | mode         | gates on                                                             |
| ---------------- | ------------ | -------------------------------------------------------------------- |
| `fetch-provider` | sequential   | -                                                                    |
| `ai-provider`    | **parallel** | `appSettings.scrapeAiProviderEnabled` AND a valid AI provider config |

Default chain order: `fetch → [scrapeProviders in array order] → ai`. The
admin reorders the middle section with drag handles.

## Decision tree: which provider next?

- Vanilla page, OG tags, no JS gating → **fetch-provider** is enough.
- Empty body unless JS runs (Shopify-on-React, custom SPAs) → add a
  **browserless** entry (self-host) or **browserbase-fetch** (hosted).
- Cloudflare challenge / Turnstile in front of the page → add a
  **flaresolverr** entry (self-host) and a per-domain override if needed.
- You already operate a scraper somewhere → wire it up via
  **custom-http** in `/admin/scraping`. JSON mode validates against
  `ScrapeResult`; HTML mode goes through the local extractor.
- The page is consistently weird, the chain keeps falling through, and
  even the cheap `ai-provider` (which extracts from raw HTML) misses →
  add a **browserbase-stagehand** entry; it spins up a real browser
  session and uses Stagehand's `extract()` to pull a structured
  ScrapeResult. Slow and LLM-billable; runs in parallel.

## Config keys (`appSettings`)

| key                          | default | what                                                                 |
| ---------------------------- | ------- | -------------------------------------------------------------------- |
| `scrapeProviderTimeoutMs`    | 10000   | per-provider HTTP budget                                             |
| `scrapeOverallTimeoutMs`     | 20000   | overall scrape budget incl. parallel racers                          |
| `scrapeQualityThreshold`     | 3       | score needed to short-circuit the chain                              |
| `scrapeCacheTtlHours`        | 24      | URL-based dedup cache TTL (0 = disable)                              |
| `scrapeProviders`            | `[]`    | discriminated array of typed entries (see /admin/scraping for shape) |
| `scrapeAiProviderEnabled`    | `false` | flips the parallel AI scraper on                                     |
| `scrapeAiCleanTitlesEnabled` | `false` | post-pass: AI normalises the winning title                           |

Env vars are now **first-boot seeds only**: on first server start after
upgrading, if no entry of type `browserless` exists yet AND
`BROWSERLESS_URL` is set, `src/db/bootstrap.ts` inserts a corresponding
entry. Same for `FLARESOLVERR_URL`. After that, the admin owns the
configuration and the env vars are unused. New deploys should configure
everything via `/admin/scraping`.

```
# Optional first-boot seed values; do NOT add new vars here for new deploys.
BROWSERLESS_URL=…
BROWSER_TOKEN=…
FLARESOLVERR_URL=…
```

The AI client config (provider type / model / api key) lives next to the
scraping AI toggles under `/admin/ai`; both AI features read from it.

## Encryption at rest

Secret fields on `scrapeProviders` entries (`browserless.token`,
`browserbase-fetch.apiKey`, `browserbase-stagehand.apiKey`,
`custom-http.customHeaders`) are AES-256-GCM-encrypted in `app_settings`
JSONB using the same envelope helpers (`encryptAppSecret` /
`decryptAppSecret`) that already protect the AI and Resend API keys. The
master key is derived via scrypt from `BETTER_AUTH_SECRET`. New writes
encrypt; reads accept either an envelope or legacy plaintext, so an
upgrade is a no-op until the admin next saves an entry.

## Stagehand: optional dependency

`@browserbasehq/stagehand` is declared under `optionalDependencies` in
`package.json`. Default `pnpm install` pulls it in; deploys that don't
need Stagehand can `pnpm install --no-optional` to skip it (and skip the
transitive `playwright-core` it pulls in). The provider also dynamically
imports the SDK only when its `fetch()` method runs, so configurations
where no Stagehand entry is enabled never load the heavy module.

## Deployment matrix

| scenario                                 | working chain                                 | notes                                                                                |
| ---------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| Vercel, no extras                        | `fetch-provider` only                         | Best-effort. Hard sites return a clean failure so the form prompts for manual entry. |
| Vercel + Browserbase Fetch API           | `fetch → browserbase-fetch`                   | Hosted JS rendering, paste API key in `/admin/scraping`. Cheapest hosted upgrade.    |
| Vercel + Browserbase Fetch + Stagehand   | `fetch → browserbase-fetch → ai \| stagehand` | Stagehand races in parallel; wins when the cheap chain returns thin data.            |
| Vercel + custom HTTP scraper             | `fetch → custom-http`                         | Cheapest way to get JS rendering on Vercel without paying Browserbase.               |
| Self-hosted (containers)                 | full chain incl. browserless + flaresolverr   | What `browserless-plan.md` targets.                                                  |
| AI extraction on top of any of the above | adds `ai-provider` as a parallel racer        | Off by default. Costs money.                                                         |

## Where things live

- Server: `src/lib/scrapers/` - orchestrator, types, extractor, scoring,
  cache, providers, post-passes, sse-format.
- Provider dispatcher: `src/lib/scrapers/providers/load-configured.ts`
  reads `appSettings.scrapeProviders` and instantiates a `ScrapeProvider`
  per enabled entry via type-specific factories.
- Bootstrap env-seed: `src/db/bootstrap.ts` - one-shot seed of
  browserless/flaresolverr entries from env on first boot.
- Routes: `src/routes/api/scrape/stream.ts` (the SSE entry point) and
  `src/api/scraper.ts` (the non-streaming server fn).
- Schema: `itemScrapes` in `src/db/schema/items.ts` - one row per attempt,
  `itemId` is nullable so the form's prefill flow can scrape a URL before
  an item exists. `scraperId` now follows `${type}:${entryId}` for entries.
- Client: `src/lib/use-scrape-url.ts` (state-machine hook),
  `src/components/items/scrape-progress-alert.tsx` (live progress UX),
  `src/components/items/image-picker.tsx` (post-scrape image swap).
- Admin: `src/components/admin/scraper-providers-form*` and
  `src/components/admin/ai-scraping-section*`.
- Tests: 380+ unit + storybook tests across the module.

## Adding a new provider type

1. Add a discriminated variant to `scrapeProviderEntrySchema` in
   `src/lib/settings.ts`. Mark any secret fields with `appSecretField()`.
2. If a new secret field type is added, also include it in
   `encryptScrapeProviderSecrets` so the write path encrypts it.
3. Create `src/lib/scrapers/providers/<id>.ts` exporting a
   `create<Id>Provider(entry)` factory. `kind: 'html'` plus the shared
   extractor is the cheapest path; only go `kind: 'structured'` when the
   upstream service genuinely returns structured fields you trust.
4. Choose `mode: 'sequential'` unless the provider is independent enough
   to race (`ai-provider` and `browserbase-stagehand` are parallel).
5. `isAvailable()` should be a cheap entry-level check - the chain filters
   before fetching.
6. Wire the new factory into `loadConfiguredProviders()`'s switch in
   `src/lib/scrapers/providers/load-configured.ts`.
7. Add a card component in `src/components/admin/scraper-providers-form-view.tsx`
   for the type, plus a default-entry shape in `makeDefaultEntry()`.
8. Add a fixture test under `__tests__/` covering the success path plus
   each error code your provider can throw.

## Things to keep in mind

- Errors classify into a small enum (`bot_block`, `http_4xx`, `http_5xx`,
  `network_error`, `timeout`, `invalid_response`, `config_missing`,
  `unknown`). Use `ScrapeProviderError` so the orchestrator surfaces the
  right wire code in the streaming UX.
- The cache short-circuits before any provider runs. `force: true` on
  `scrapeUrl({...})` (or `?force=true` on the SSE route) bypasses it.
- Don't clobber user input. The add-item form tracks per-field "user
  touched" refs and skips prefill when the user has typed in a field.
- Per-provider timeouts (10s default) are independent of the overall
  budget (20s default). Both are tunable in `/admin/scraping`.
- The orchestrator emits a single SSE event stream; the client
  `useScrapeUrl` reduces it into a 5-state machine. If you add a new
  event type, add it to `StreamEvent` in `types.ts` and to the reducer in
  `use-scrape-url.ts`.

## See also

- the operator notes (`_NOTES_/scraping/browserless-plan.md`, kept locally) — infra layout for the
  browser-services stack (browserless + flaresolverr + traefik + sablier).
