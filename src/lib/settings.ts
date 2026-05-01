// lib/settings.ts
//
// Client-safe schema + types + defaults. Does NOT import from
// `@/lib/crypto/app-secret` because that module pulls in `node:crypto`,
// which can't be bundled for the browser. Server-side reads (decrypting
// envelope-shaped secrets in app_settings) and writes (encrypting before
// upsert) live in `src/lib/settings-loader.ts` so this module stays
// browser-safe for the admin form's type imports + the
// useAppSettings hook's runtime import of DEFAULT_APP_SETTINGS.

import { z } from 'zod'

import type { Database, SchemaDatabase } from '@/db'
import { appSettings } from '@/db/schema'

// 1) Shape of settings used across the app.
// Defaults live in DEFAULT_APP_SETTINGS below, NOT on the schema fields:
// `appSettingsSchema.partial()` would otherwise fill every absent field with
// its default and the upsert loop in updateAppSettings would clobber unrelated
// rows back to defaults on each toggle.

// Provider entry types (`scrapeProviders` array). Each entry registers as
// its own `ScrapeProvider` in the orchestrator chain, identified by
// `${type}:${id}` so the persisted `scraperId` column ties back to the
// admin-managed entry. Order in the array is the chain order; the admin
// reorders with drag handles.
//
// Secret fields (token / apiKey / customHeaders) are typed as plain
// strings here. The settings loader decrypts envelope-shaped JSONB rows
// to plaintext before passing data through Zod parse, and the write path
// encrypts strings to envelopes before upsert.
const baseEntryFields = {
	id: z.string().min(1).max(64),
	name: z.string().min(1).max(120),
	enabled: z.boolean(),
	// Tier determines when this provider runs: tier-1 entries fire in
	// parallel first, then tier 2 only if tier 1's merged result fell
	// below qualityThreshold, etc. The always-on `fetch-provider` is
	// implicit tier 0; configurable entries occupy tiers 1-5. Defaults
	// to 1 so existing rows keep behaving like "fire everything in
	// parallel and merge" until the admin demotes specific entries.
	tier: z.number().int().min(1).max(5).default(1),
	// Optional per-entry override for the orchestrator's per-provider
	// HTTP timeout (in ms). Empty/undefined means "inherit
	// scrapeProviderTimeoutMs". Useful when one slow scraper (Stagehand,
	// AI) needs more headroom than the global default without bumping
	// every other provider's budget.
	timeoutMs: z.number().int().positive().optional(),
}

const browserlessEntrySchema = z.object({
	...baseEntryFields,
	type: z.literal('browserless'),
	url: z.union([z.literal(''), z.url()]),
	token: z.string().max(500).optional(),
})

const flaresolverrEntrySchema = z.object({
	...baseEntryFields,
	type: z.literal('flaresolverr'),
	url: z.union([z.literal(''), z.url()]),
})

const browserbaseFetchEntrySchema = z.object({
	...baseEntryFields,
	type: z.literal('browserbase-fetch'),
	apiKey: z.string().max(500),
	proxies: z.boolean().default(true),
	allowRedirects: z.boolean().default(true),
})

const browserbaseStagehandEntrySchema = z.object({
	...baseEntryFields,
	type: z.literal('browserbase-stagehand'),
	apiKey: z.string().max(500),
	projectId: z.string().min(1).max(200),
	modelName: z.string().max(120).optional(),
	instruction: z.string().max(2000).optional(),
})

const customHttpEntrySchema = z.object({
	...baseEntryFields,
	type: z.literal('custom-http'),
	endpoint: z.union([z.literal(''), z.url()]),
	responseKind: z.enum(['html', 'json']),
	customHeaders: z.string().max(4000).optional(),
})

// AI extractor entry. Inherits LLM credentials from the AI config under
// /admin/ai-settings, so the entry itself only needs admin-managed
// metadata (name, enabled, tier). Migrated out of the hardcoded
// `ai-provider` singleton in commit B.
const aiEntrySchema = z.object({
	...baseEntryFields,
	type: z.literal('ai'),
})

// Custom Hono facade in front of browserless / flaresolverr / byparr /
// scrapfly that we deploy externally; see
// https://github.com/shawnphoffman/giftwrapt-scraper.
//
// Single endpoint: POST {endpoint}/fetch with X-Browser-Token header and
// {url} body, returns {html, finalUrl, status, ...} on success or
// {error: {code, message, retryable}, attempts} on failure. The facade's
// `auto` mode chains through the upstream solvers, so we treat it as a
// black box and only need endpoint + token here.
const giftwraptScraperEntrySchema = z.object({
	...baseEntryFields,
	type: z.literal('giftwrapt-scraper'),
	endpoint: z.union([z.literal(''), z.url()]),
	token: z.string().max(500),
})

// ScrapFly hosted scraping API (https://scrapfly.io). Hits
// `https://api.scrapfly.io/scrape?key=…&url=…` and returns JSON whose
// `result.content` field is the rendered HTML; we unwrap to a RawPage so
// the standard extractor runs. Toggles map to ScrapFly query params:
// `asp` enables anti-scraping protection (recommended), `render_js`
// enables a headless browser render. Note that both increase the credit
// cost per call.
const scrapflyEntrySchema = z.object({
	...baseEntryFields,
	type: z.literal('scrapfly'),
	apiKey: z.string().max(500),
	asp: z.boolean().default(true),
	renderJs: z.boolean().default(false),
})

export const scrapeProviderEntrySchema = z.discriminatedUnion('type', [
	browserlessEntrySchema,
	flaresolverrEntrySchema,
	browserbaseFetchEntrySchema,
	browserbaseStagehandEntrySchema,
	customHttpEntrySchema,
	aiEntrySchema,
	giftwraptScraperEntrySchema,
	scrapflyEntrySchema,
])

export type ScrapeProviderEntry = z.infer<typeof scrapeProviderEntrySchema>
export type BrowserlessEntry = Extract<ScrapeProviderEntry, { type: 'browserless' }>
export type FlaresolverrEntry = Extract<ScrapeProviderEntry, { type: 'flaresolverr' }>
export type BrowserbaseFetchEntry = Extract<ScrapeProviderEntry, { type: 'browserbase-fetch' }>
export type BrowserbaseStagehandEntry = Extract<ScrapeProviderEntry, { type: 'browserbase-stagehand' }>
export type CustomHttpEntry = Extract<ScrapeProviderEntry, { type: 'custom-http' }>
export type AiEntry = Extract<ScrapeProviderEntry, { type: 'ai' }>
export type GiftWraptScraperEntry = Extract<ScrapeProviderEntry, { type: 'giftwrapt-scraper' }>
export type ScrapflyEntry = Extract<ScrapeProviderEntry, { type: 'scrapfly' }>

export type ScrapeProviderType = ScrapeProviderEntry['type']

// Secret fields per discriminator. Used by the loader's decrypt-on-read
// pass and the write path's encrypt-on-write pass; declaring it once here
// keeps the two halves in sync.
export const SCRAPE_PROVIDER_SECRET_FIELDS: Record<ScrapeProviderType, ReadonlyArray<string>> = {
	browserless: ['token'],
	flaresolverr: [],
	'browserbase-fetch': ['apiKey'],
	'browserbase-stagehand': ['apiKey'],
	'custom-http': ['customHeaders'],
	ai: [],
	'giftwrapt-scraper': ['token'],
	scrapfly: ['apiKey'],
}

export const appSettingsSchema = z.object({
	// Display title shown in the document <title>, PWA meta, OG tags, and
	// the sidebar header. Admin-editable from /admin; defaults to
	// 'GiftWrapt' until an admin changes it. Surfaced through the public
	// app-settings query so SSR and client hydration agree, preventing a
	// flash on first paint. Replaced the build-time VITE_APP_TITLE env
	// var, which baked into the JS at build time and silently fell back
	// to the default on Docker builds that didn't pass it as a build arg.
	appTitle: z.string().min(1).max(80),
	enableHolidayLists: z.boolean(),
	enableBirthdayLists: z.boolean(),
	enableTodoLists: z.boolean(),
	defaultListType: z.enum(['wishlist', 'christmas', 'birthday', 'giftideas', 'todos', 'test']),
	enableGiftsForNonUsers: z.boolean(),
	// Days after a birthday before claimed items are auto-archived.
	archiveDaysAfterBirthday: z.number().int().positive(),
	// Days after Dec 25 before claimed Christmas items are auto-archived.
	archiveDaysAfterChristmas: z.number().int().positive(),
	// Whether birthday emails (day-of + follow-up) are sent.
	enableBirthdayEmails: z.boolean(),
	// Whether Christmas emails are sent.
	enableChristmasEmails: z.boolean(),
	// Whether users can post comments on items.
	enableComments: z.boolean(),
	// Whether a notification email is sent to the list owner on new comments.
	enableCommentEmails: z.boolean(),
	// When true, item save (create/update) will fetch any non-storage
	// imageUrl, run it through the image pipeline, and persist the
	// resulting storage URL instead of the original. Best-effort: a
	// fetch/process failure leaves the original URL in place. No-op when
	// storage is not configured.
	mirrorExternalImagesOnSave: z.boolean(),
	// When true, signed-in users can see /settings/devices and mint
	// per-device API keys for the mobile companion app. Off by default
	// so the surface stays hidden until an admin opts in.
	enableMobileApp: z.boolean(),
	// Forces every admin account to have TOTP 2FA enrolled. While on,
	// the admin layout middleware sends admins to /settings/security
	// with an enrollment banner if `twoFactorEnabled === false` on
	// their session. Doesn't affect non-admins.
	require2faForAdmins: z.boolean(),
	// When true, the security page shows a passkeys panel and the
	// sign-in page surfaces a "Sign in with a passkey" button. The
	// underlying better-auth endpoints stay live regardless — this
	// only gates the UI surface. Off by default so an operator on a
	// non-HTTPS LAN deploy (where WebAuthn won't work anyway) doesn't
	// confuse users with a broken affordance.
	enablePasskeys: z.boolean(),
	// When true, /admin/oidc is reachable and the consent screen at
	// /oauth/consent is wired up. Off by default — the better-auth
	// plugin still mounts the .well-known + /oauth2/* routes
	// regardless, but third-party apps can't use them until at least
	// one oauthApplication row exists, which requires this UI to
	// create one.
	enableOidcProvider: z.boolean(),
	// =====================================================================
	// URL scraping
	// =====================================================================
	// Per-provider HTTP timeout in ms.
	scrapeProviderTimeoutMs: z.number().int().positive(),
	// Overall budget for a single scrape request in ms (covers sequential
	// chain + parallel racers).
	scrapeOverallTimeoutMs: z.number().int().positive(),
	// Quality threshold the orchestrator uses to short-circuit the chain.
	scrapeQualityThreshold: z.number().int(),
	// How long an existing scrape row counts as "fresh" for dedup. Set to
	// zero to disable URL-based caching.
	scrapeCacheTtlHours: z.number().int().min(0),
	// AI-extractor toggles. Both default off and gate on the configured AI
	// provider being usable.
	scrapeAiProviderEnabled: z.boolean(),
	scrapeAiCleanTitlesEnabled: z.boolean(),
	// Configured scrape providers (0:N). Each entry registers as its own
	// provider in the orchestrator chain, identified by `${type}:${id}`.
	// Built-in providers (browserless, flaresolverr, browserbase-fetch,
	// browserbase-stagehand) and custom-http entries all live here so the
	// admin can manage them in one place; the always-on `fetch-provider`
	// and the parallel `ai-provider` stay wired separately.
	//
	// Order in the array is the chain order. fetch-provider runs first;
	// these run next in array order; ai-provider races in parallel.
	// Drag-reorder in the admin UI persists the new order via
	// `updateAppSettings({ scrapeProviders })`.
	scrapeProviders: z.array(scrapeProviderEntrySchema).max(16),
})

// 2) Default values in code (for when DB is empty or missing keys)
export const DEFAULT_APP_SETTINGS: z.infer<typeof appSettingsSchema> = {
	appTitle: 'GiftWrapt',
	enableHolidayLists: true,
	enableBirthdayLists: true,
	enableTodoLists: true,
	defaultListType: 'wishlist',
	enableGiftsForNonUsers: false,
	archiveDaysAfterBirthday: 14,
	archiveDaysAfterChristmas: 14,
	enableBirthdayEmails: true,
	enableChristmasEmails: true,
	enableComments: true,
	enableCommentEmails: true,
	mirrorExternalImagesOnSave: false,
	enableMobileApp: false,
	require2faForAdmins: false,
	enablePasskeys: false,
	enableOidcProvider: false,
	// Per-provider HTTP timeout. Hosted scrapers (Stagehand / AI on
	// heavy pages) routinely need >10s; bumped from 10s after
	// sec-review L5. Tune downward in /admin/scraping if you only run
	// fast providers.
	scrapeProviderTimeoutMs: 20_000,
	// Overall budget for a single scrape (covers the entire chain +
	// any parallel racers). Bumped from 20s for the same reason.
	scrapeOverallTimeoutMs: 45_000,
	scrapeQualityThreshold: 3,
	scrapeCacheTtlHours: 24,
	scrapeAiProviderEnabled: false,
	scrapeAiCleanTitlesEnabled: false,
	scrapeProviders: [],
}

export type AppSettings = z.infer<typeof appSettingsSchema>

// 3) Helper to load raw key/value rows from DB. Server-only (Database
// type only resolves on the server), but written here so the loader can
// import a single source of truth.
export async function loadRawSettings(db: Database | SchemaDatabase): Promise<Record<string, unknown>> {
	const rows = await db.select().from(appSettings)
	return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

// 4) Lightweight envelope-shape detector. Doesn't import the crypto
// module so it's safe to keep here; `decryptAppSecret` is called by the
// server-only loader after this guard returns true.
export function looksLikeEncryptedEnvelope(value: unknown): boolean {
	if (!value || typeof value !== 'object') return false
	const v = value as Record<string, unknown>
	return v.v === 1 && typeof v.iv === 'string' && typeof v.tag === 'string' && typeof v.data === 'string'
}
