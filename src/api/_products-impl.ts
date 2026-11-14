// Server-side impl for barcode → product-candidate lookups. The mobile
// route is a thin shim over this; the admin tester runs individual
// providers without touching `lookupProductByBarcodeImpl` (see
// `runBarcodeProviderProbeImpl` at the bottom).
//
// Deliberately INDEPENDENT from the URL-scrape pipeline: no scrape
// orchestrator, no scrape cache, no items writes. The iOS handoff is
// "result → prepopulated add-item sheet"; this endpoint never persists
// into `items`, `itemScrapes`, or any other domain table beyond its
// own `product_lookups` cache and `barcode_lookup_history` log.
//
// Flow (locked in):
//   1. enabled → otherwise 503 barcode-disabled (so the iOS
//      capabilities probe gets 503-not-400 on a disabled server).
//   2. normalizeGtin → 400 invalid-code (does NOT pollute the cache).
//   3. cache hit within `cacheTtlHours` → return cached candidates. A
//      cached miss (empty results) answers not-found for `MISS_TTL_HOURS`.
//   4. restricted-circulation code (a store's own numbering) → 404
//      not-found, no provider call: no product database holds these.
//   5. configured primary provider.
//   6. on success, optionally clean the first candidate with one AI text
//      call (`aiBarcodeIdentifyEnabled`), upsert cache + return.
//   7. on null → remember the miss, 404 not-found.
//   8. on throw → 503 provider-unavailable.
//   Every outcome from step 2 on also writes a `barcode_lookup_history`
//   row for the admin Lookup History card, except the all-zero code the
//   iOS capabilities probe sends.
//
// What leaves here is cleaned on the way out (`presentCandidates`): a
// link to the provider's own site is dropped, and the notes lines are
// written from the stored fields.

import { and, eq, gte, sql } from 'drizzle-orm'

import type { Database, SchemaDatabase } from '@/db'
import { type BarcodeCacheCandidate, barcodeLookupHistory, productLookups } from '@/db/schema'
import type { AiCallSource } from '@/lib/ai-call'
import { loadConfiguredBarcodeProvider } from '@/lib/barcode-providers/load-configured'
import {
	BARCODE_PROVIDER_OWN_HOSTS,
	type BarcodeProvider,
	type BarcodeProviderId,
	type ProviderResult,
} from '@/lib/barcode-providers/types'
import { isRestrictedCirculationGtin, normalizeGtin } from '@/lib/barcodes/gtin'
import { createLogger } from '@/lib/logger'
import { composeSuggestedNotes, identifyProduct, isEmptyIdentity, loadIdentifyModel, mergeSoldAt } from '@/lib/product-identify'
import { type AppSettings } from '@/lib/settings'

const log = createLogger('barcode-lookup')

export type LookupProductByBarcodeResult =
	| {
			kind: 'ok'
			gtin14: string
			providerId: BarcodeProviderId | string
			source: 'provider' | 'cache'
			cached: boolean
			results: Array<BarcodeCacheCandidate>
	  }
	| {
			kind: 'error'
			reason: 'invalid-code' | 'not-found' | 'provider-unavailable' | 'barcode-disabled'
	  }

interface LookupArgs {
	db: Database | SchemaDatabase
	rawCode: string
	settings: AppSettings
	signal?: AbortSignal
	// Who scanned, for the Lookup History row. Null in tests and scripts.
	userId?: string
	// Which surface asked, for the AI usage ledger when the clean-up runs.
	aiSource?: AiCallSource
}

// How long a miss is remembered. Short, because a product database can
// gain the code later; never longer than the admin's cache setting.
export const MISS_TTL_HOURS = 24

// The AI clean-up of a provider hit gets this long. Past it the raw
// candidate is returned and cached as is.
const IDENTIFY_TIMEOUT_MS = 5_000

// What a lookup produced, plus the history-only detail the wire result
// doesn't carry: which provider missed or threw, and what it threw.
interface LookupOutcome {
	result: LookupProductByBarcodeResult
	providerId?: string
	errorMessage?: string
}

// In-process request coalescing. Concurrent callers for the same GTIN
// in the same Node process await the same promise so we don't fire N
// provider calls for one barcode burst. Cross-process duplicates are
// tolerated; the cache upsert is idempotent.
const inflight = new Map<string, Promise<LookupOutcome>>()

function toCandidates(rs: Array<ProviderResult>): Array<BarcodeCacheCandidate> {
	return rs.map(r => {
		const c: BarcodeCacheCandidate = {}
		if (r.title) c.title = r.title
		if (r.brand) c.brand = r.brand
		if (r.imageUrl) c.imageUrl = r.imageUrl
		if (r.candidateUrl) c.candidateUrl = r.candidateUrl
		if (r.soldAt?.length) c.soldAt = r.soldAt
		return c
	})
}

// True when the URL points at the provider's own site (its catalog page
// or tracking redirect) or is not a web link at all.
function isUnusableCandidateUrl(providerId: string, url: string): boolean {
	let host: string
	try {
		const parsed = new URL(url)
		if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return true
		host = parsed.hostname.toLowerCase()
	} catch {
		return true
	}
	const own = BARCODE_PROVIDER_OWN_HOSTS[providerId] ?? []
	return own.some(h => host === h || host.endsWith(`.${h}`))
}

// The candidates as callers see them, from fresh results and cached rows
// alike (so rows cached before a rule changed are cleaned too):
// - a `candidateUrl` on the provider's own site is dropped;
// - `suggestedNotes` is written from the stored identity and stores.
export function presentCandidates(providerId: string, candidates: Array<BarcodeCacheCandidate>): Array<BarcodeCacheCandidate> {
	return candidates.map(c => {
		const { suggestedNotes: _stale, ...rest } = c
		const out: BarcodeCacheCandidate = { ...rest }
		if (out.candidateUrl && isUnusableCandidateUrl(providerId, out.candidateUrl)) delete out.candidateUrl
		const soldAt = mergeSoldAt(out.soldAt)
		if (soldAt.length > 0) out.soldAt = soldAt
		else delete out.soldAt
		// The brand line only when the title does not already carry it.
		const notes = composeSuggestedNotes({ ...out.identity, title: out.title, brand: out.identity?.brand ?? out.brand, soldAt })
		if (notes) out.suggestedNotes = notes
		return out
	})
}

// One AI text call that turns the provider's raw title into a clean one
// and pulls the size and color out of it. Best effort: any failure
// (no AI configured, timeout, refused call, budget reached) leaves the
// candidate exactly as the provider returned it.
async function cleanFirstCandidate(
	db: Database | SchemaDatabase,
	gtin14: string,
	candidates: Array<BarcodeCacheCandidate>,
	settings: AppSettings,
	meta: { userId?: string; aiSource?: AiCallSource },
	signal: AbortSignal | undefined
): Promise<void> {
	const first = candidates.at(0)
	if (!settings.aiBarcodeIdentifyEnabled || !first?.title) return
	try {
		const ai = await loadIdentifyModel(db)
		if (!ai) return
		const timeout = AbortSignal.timeout(IDENTIFY_TIMEOUT_MS)
		const identity = await identifyProduct(
			{ feature: 'barcode-identify', userId: meta.userId ?? null, source: meta.aiSource ?? 'mobile' },
			ai,
			{ candidate: { title: first.title, brand: first.brand }, scannedCode: gtin14 },
			signal ? AbortSignal.any([signal, timeout]) : timeout
		)
		if (isEmptyIdentity(identity)) return
		// Where it is sold comes from the provider, never from the model: a
		// title carries no evidence of a store. Price is not the provider's
		// to give here either.
		const { soldAt: _soldAt, price: _price, currency: _currency, title, ...fields } = identity
		if (title && title !== first.title) {
			first.rawTitle = first.title
			first.title = title
		}
		if (Object.keys(fields).length > 0) first.identity = fields
	} catch (err) {
		log.warn(
			{ err: err instanceof Error ? err.message : String(err), gtin14 },
			'barcode clean-up failed; returning the provider result as is'
		)
	}
}

export async function lookupProductByBarcodeImpl(args: LookupArgs): Promise<LookupProductByBarcodeResult> {
	const { db, rawCode, settings, signal, userId, aiSource } = args

	if (!settings.barcode.enabled) {
		return { kind: 'error', reason: 'barcode-disabled' }
	}

	const startedAt = Date.now()
	const normalized = normalizeGtin(rawCode)
	if (!normalized.ok) {
		// The iOS capabilities probe sends all zeros on every launch. It is
		// not a scan, so it stays out of the history.
		if (/^0+$/.test(rawCode.trim())) return { kind: 'error', reason: 'invalid-code' }
		await recordLookup(db, { userId, rawCode, gtin14: null, outcome: { result: { kind: 'error', reason: 'invalid-code' } }, startedAt })
		return { kind: 'error', reason: 'invalid-code' }
	}
	const gtin14 = normalized.gtin14

	let promise = inflight.get(gtin14)
	if (!promise) {
		promise = runLookup(db, gtin14, settings, signal, { userId, aiSource }).finally(() => {
			inflight.delete(gtin14)
		})
		inflight.set(gtin14, promise)
	}
	const outcome = await promise
	// Coalesced callers each get their own history row: every scan is an
	// event, even when two of them shared one provider call.
	await recordLookup(db, { userId, rawCode, gtin14, outcome, startedAt })
	return outcome.result
}

async function runLookup(
	db: Database | SchemaDatabase,
	gtin14: string,
	settings: AppSettings,
	signal: AbortSignal | undefined,
	meta: { userId?: string; aiSource?: AiCallSource }
): Promise<LookupOutcome> {
	const ttlHours = settings.barcode.cacheTtlHours
	if (ttlHours > 0) {
		const freshCutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000)
		const cached = await db
			.select()
			.from(productLookups)
			.where(and(eq(productLookups.code, gtin14), gte(productLookups.updatedAt, freshCutoff)))
			.limit(1)
		if (cached.length > 0) {
			const hit = cached[0]
			if (hit.results.length > 0) {
				return {
					result: {
						kind: 'ok',
						gtin14,
						providerId: hit.providerId,
						source: 'cache',
						cached: true,
						results: presentCandidates(hit.providerId, hit.results),
					},
				}
			}
			// A remembered miss. Past its shorter window, ask the provider again.
			const missCutoff = Date.now() - Math.min(MISS_TTL_HOURS, ttlHours) * 60 * 60 * 1000
			if (hit.updatedAt.getTime() >= missCutoff) {
				return { result: { kind: 'error', reason: 'not-found' }, providerId: hit.providerId }
			}
		}
	}

	if (isRestrictedCirculationGtin(gtin14)) {
		return { result: { kind: 'error', reason: 'not-found' } }
	}

	const provider = await loadConfiguredBarcodeProvider()
	if (!provider) {
		return { result: { kind: 'error', reason: 'provider-unavailable' } }
	}

	let providerOutput: Array<ProviderResult> | null
	try {
		providerOutput = await provider.lookup(gtin14, signal ?? new AbortController().signal)
	} catch (err) {
		return {
			result: { kind: 'error', reason: 'provider-unavailable' },
			providerId: provider.id,
			errorMessage: err instanceof Error ? err.message : String(err),
		}
	}

	const candidates = providerOutput === null ? [] : toCandidates(providerOutput)
	if (candidates.length > 0) await cleanFirstCandidate(db, gtin14, candidates, settings, meta, signal)

	// An empty array records the miss. With caching off (ttl 0) nothing is
	// read back, so skip the write for a miss.
	if (candidates.length > 0 || ttlHours > 0) {
		await db
			.insert(productLookups)
			.values({
				code: gtin14,
				providerId: provider.id,
				results: candidates,
			})
			.onConflictDoUpdate({
				target: productLookups.code,
				set: {
					providerId: provider.id,
					results: candidates,
					updatedAt: sql`now()`,
				},
			})
	}

	if (candidates.length === 0) {
		return { result: { kind: 'error', reason: 'not-found' }, providerId: provider.id }
	}

	return {
		result: {
			kind: 'ok',
			gtin14,
			providerId: provider.id,
			source: 'provider',
			cached: false,
			results: presentCandidates(provider.id, candidates),
		},
	}
}

// Writes the Lookup History row. Diagnostics only: a failed insert is
// logged and swallowed so it never costs the caller their lookup.
async function recordLookup(
	db: Database | SchemaDatabase,
	args: { userId?: string; rawCode: string; gtin14: string | null; outcome: LookupOutcome; startedAt: number }
): Promise<void> {
	const { result } = args.outcome
	try {
		await db.insert(barcodeLookupHistory).values({
			userId: args.userId ?? null,
			rawCode: args.rawCode,
			gtin14: args.gtin14,
			outcome: result.kind === 'ok' ? 'ok' : result.reason,
			source: result.kind === 'ok' ? result.source : null,
			providerId: result.kind === 'ok' ? result.providerId : (args.outcome.providerId ?? null),
			results: result.kind === 'ok' ? result.results : null,
			errorMessage: args.outcome.errorMessage ?? null,
			ms: Date.now() - args.startedAt,
		})
	} catch (err) {
		log.warn({ err, gtin14: args.gtin14 }, 'failed to record barcode lookup history')
	}
}

// =====================================================================
// Admin tester. Probes a specific provider in isolation - no cache
// read, no cache write. Returns the raw provider outcome so the
// admin UI can render a clear "missing key" / "unavailable" / "ok"
// state per provider.
// =====================================================================

export type BarcodeProviderProbeResult =
	| { kind: 'ok'; providerId: string; gtin14: string; results: Array<BarcodeCacheCandidate> }
	| { kind: 'miss'; providerId: string; gtin14: string }
	| { kind: 'unavailable'; providerId: string; reason: 'not-configured' | 'threw'; message?: string }
	| { kind: 'error'; providerId: string; reason: 'invalid-code' | 'unknown-provider' }

export async function runBarcodeProviderProbeImpl(args: {
	providerId: string
	rawCode: string
	allProviders: ReadonlyArray<BarcodeProvider>
	signal?: AbortSignal
}): Promise<BarcodeProviderProbeResult> {
	const { providerId, rawCode, allProviders, signal } = args
	const provider = allProviders.find(p => p.id === providerId)
	if (!provider) return { kind: 'error', providerId, reason: 'unknown-provider' }
	const normalized = normalizeGtin(rawCode)
	if (!normalized.ok) return { kind: 'error', providerId, reason: 'invalid-code' }
	if (!provider.isAvailable()) {
		return { kind: 'unavailable', providerId, reason: 'not-configured' }
	}
	try {
		const out = await provider.lookup(normalized.gtin14, signal ?? new AbortController().signal)
		if (out === null) return { kind: 'miss', providerId, gtin14: normalized.gtin14 }
		return { kind: 'ok', providerId, gtin14: normalized.gtin14, results: presentCandidates(providerId, toCandidates(out)) }
	} catch (err) {
		return {
			kind: 'unavailable',
			providerId,
			reason: 'threw',
			message: err instanceof Error ? err.message : String(err),
		}
	}
}
