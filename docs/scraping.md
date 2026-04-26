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
│   ─ build provider chain from app settings + env           │
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
  ┌─────────┴────────┬────────────┬────────────┬───────────┐
  │ fetch-provider   │ browserless│ flaresolverr│ custom-http│
  │ (always on)      │ (env)      │ (env)       │ (settings) │
  └──────────────────┴────────────┴─────────────┴──────────-─┘
                          ▲ ai-provider runs as a parallel racer
                            (admin toggle + valid AI config)
```

## Providers

| id                      | mode         | gates on                                                             | lights up when                                          |
| ----------------------- | ------------ | -------------------------------------------------------------------- | ------------------------------------------------------- |
| `fetch-provider`        | sequential   | —                                                                    | always                                                  |
| `browserless-provider`  | sequential   | `BROWSERLESS_URL` (+ optional `BROWSER_TOKEN`)                       | self-host stack is running                              |
| `flaresolverr-provider` | sequential   | `FLARESOLVERR_URL`                                                   | self-host stack is running                              |
| `custom-http-provider`  | sequential   | `appSettings.scrapeCustomHttpProvider.enabled`                       | admin sets endpoint + responseKind in `/admin/scraping` |
| `ai-provider`           | **parallel** | `appSettings.scrapeAiProviderEnabled` AND a valid AI provider config | admin flips the toggle in `/admin/ai`                   |

Default chain order: `fetch → browserless → flaresolverr → custom-http`. AI
joins as a parallel racer; whoever has the highest score after everything
settles wins.

## Decision tree: which provider next?

- Vanilla page, OG tags, no JS gating → **fetch-provider** is enough.
- Empty body unless JS runs (Shopify-on-React, custom SPAs) → add
  **browserless** (`BROWSERLESS_URL`).
- Cloudflare challenge / Turnstile in front of the page → add
  **flaresolverr** (`FLARESOLVERR_URL`) and a per-domain override if
  needed.
- You already operate a scraper somewhere → wire it up via
  **custom-http** in `/admin/scraping`. JSON mode validates against
  `ScrapeResult`; HTML mode goes through the local extractor.
- The page is consistently weird and the chain keeps falling through →
  flip the **AI provider** in `/admin/ai`. Costs money per scrape;
  scoring decides whether it actually wins.

## Config keys (`appSettings`)

| key                          | default     | what                                                                   |
| ---------------------------- | ----------- | ---------------------------------------------------------------------- |
| `scrapeProviderTimeoutMs`    | 10000       | per-provider HTTP budget                                               |
| `scrapeOverallTimeoutMs`     | 20000       | overall scrape budget incl. parallel racers                            |
| `scrapeQualityThreshold`     | 3           | score needed to short-circuit the chain                                |
| `scrapeCacheTtlHours`        | 24          | URL-based dedup cache TTL (0 = disable)                                |
| `scrapeCustomHttpProvider`   | `undefined` | `{enabled, endpoint, responseKind, authHeaderName?, authHeaderValue?}` |
| `scrapeAiProviderEnabled`    | `false`     | flips the parallel AI scraper on                                       |
| `scrapeAiCleanTitlesEnabled` | `false`     | post-pass: AI normalises the winning title                             |

Env vars (boot-time, never overrideable from the UI):

```
BROWSERLESS_URL=…
BROWSER_TOKEN=…
FLARESOLVERR_URL=…
```

The AI client config (provider type / model / api key) lives next to the
scraping AI toggles under `/admin/ai`; both AI features read from it.

## Deployment matrix

| scenario                      | working chain                                     | notes                                                                                                    |
| ----------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Vercel, no extras             | `fetch-provider` only                             | Best-effort. Hard sites (Amazon, CF-walled) return a clean failure so the form prompts for manual entry. |
| Vercel + remote browserless   | `fetch → browserless` (+ optional `flaresolverr`) | Same code path as self-hosted; just point the env vars at a reachable host.                              |
| Vercel + custom HTTP scraper  | `fetch → custom-http`                             | Cheapest way to get JS rendering on Vercel without managing infra yourself.                              |
| Self-hosted                   | full chain incl. browserless + flaresolverr       | What `browserless-plan.md` targets.                                                                      |
| AI on top of any of the above | adds `ai-provider` as a parallel racer            | Off by default. Costs money.                                                                             |

## Where things live

- Server: `src/lib/scrapers/` — orchestrator, types, extractor, scoring,
  cache, providers, post-passes, sse-format.
- Routes: `src/routes/api/scrape/stream.ts` (the SSE entry point) and
  `src/api/scraper.ts` (the non-streaming server fn).
- Schema: `itemScrapes` in `src/db/schema/items.ts` — one row per attempt,
  `itemId` is nullable so the form's prefill flow can scrape a URL before
  an item exists.
- Client: `src/lib/use-scrape-url.ts` (state-machine hook),
  `src/components/items/scrape-progress-alert.tsx` (live progress UX),
  `src/components/items/image-picker.tsx` (post-scrape image swap).
- Admin: `src/components/admin/scraper-providers-form*` and
  `src/components/admin/ai-scraping-section*`.
- Tests: 200+ unit + storybook tests across the module.

## Adding a new provider

1. Create `src/lib/scrapers/providers/<id>.ts` exporting a `ScrapeProvider`.
2. `kind: 'html'` plus the shared extractor is the cheapest path; only go
   `kind: 'structured'` when the upstream service genuinely returns
   structured fields you trust.
3. Choose `mode: 'sequential'` unless the provider is independent enough
   to race (`ai-provider` is the only built-in parallel one today).
4. `isAvailable()` should be a cheap env / settings check — the chain
   filters before fetching.
5. Wire it into both `src/api/scraper.ts` and
   `src/routes/api/scrape/stream.ts` — they share the same providers list.
6. Add a fixture test under `__tests__/` covering the success path plus
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
- The orchestrator emits a single SSE event stream; the client `useScrapeUrl`
  reduces it into a 5-state machine. If you add a new event type, add it
  to `StreamEvent` in `types.ts` and to the reducer in `use-scrape-url.ts`.

## See also

- the operator notes (`_NOTES_/scraping/browserless-plan.md`, kept locally) — infra layout for the
  browser-services stack (browserless + flaresolverr + traefik + sablier).
