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
//   3. cache hit within `cacheTtlHours` → return cached candidates.
//   4. configured primary provider.
//   5. on success, upsert cache + return.
//   6. on null → 404 not-found.
//   7. on throw → 503 provider-unavailable.
//   Every outcome from step 2 on also writes a `barcode_lookup_history`
//   row for the admin Lookup History card.

import { and, eq, gte, sql } from 'drizzle-orm'

import type { Database, SchemaDatabase } from '@/db'
import { type BarcodeCacheCandidate, barcodeLookupHistory, productLookups } from '@/db/schema'
import { loadConfiguredBarcodeProvider } from '@/lib/barcode-providers/load-configured'
import type { BarcodeProvider, BarcodeProviderId, ProviderResult } from '@/lib/barcode-providers/types'
import { normalizeGtin } from '@/lib/barcodes/gtin'
import { createLogger } from '@/lib/logger'
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
}

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
		return c
	})
}

export async function lookupProductByBarcodeImpl(args: LookupArgs): Promise<LookupProductByBarcodeResult> {
	const { db, rawCode, settings, signal, userId } = args

	if (!settings.barcode.enabled) {
		return { kind: 'error', reason: 'barcode-disabled' }
	}

	const startedAt = Date.now()
	const normalized = normalizeGtin(rawCode)
	if (!normalized.ok) {
		await recordLookup(db, { userId, rawCode, gtin14: null, outcome: { result: { kind: 'error', reason: 'invalid-code' } }, startedAt })
		return { kind: 'error', reason: 'invalid-code' }
	}
	const gtin14 = normalized.gtin14

	let promise = inflight.get(gtin14)
	if (!promise) {
		promise = runLookup(db, gtin14, settings, signal).finally(() => {
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
	signal: AbortSignal | undefined
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
			return {
				result: {
					kind: 'ok',
					gtin14,
					providerId: hit.providerId,
					source: 'cache',
					cached: true,
					results: hit.results,
				},
			}
		}
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
	if (providerOutput === null) {
		return { result: { kind: 'error', reason: 'not-found' }, providerId: provider.id }
	}

	const candidates = toCandidates(providerOutput)
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

	return {
		result: {
			kind: 'ok',
			gtin14,
			providerId: provider.id,
			source: 'provider',
			cached: false,
			results: candidates,
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
		return { kind: 'ok', providerId, gtin14: normalized.gtin14, results: toCandidates(out) }
	} catch (err) {
		return {
			kind: 'unavailable',
			providerId,
			reason: 'threw',
			message: err instanceof Error ? err.message : String(err),
		}
	}
}
