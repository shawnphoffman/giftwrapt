// Integration coverage for `lookupProductByBarcodeImpl`. Asserts the
// fixed guard order, cache semantics (TTL, normalized key collapse,
// stale-row refresh), provider null/throw mapping, and the
// barcode-disabled short-circuit.
//
// The provider is stubbed via `vi.mock` of the load-configured module
// so we never hit the real upcitemdb / Go-UPC HTTP endpoints. The
// in-process inflight Map persists across tests in this file, so each
// test uses a distinct GTIN to keep them isolated.

import { makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { lookupProductByBarcodeImpl, runBarcodeProviderProbeImpl } from '@/api/_products-impl'
import { barcodeLookupHistory, productLookups } from '@/db/schema'
import type { BarcodeProvider, ProviderResult } from '@/lib/barcode-providers/types'
import { sweepBarcodeLookupHistory } from '@/lib/barcodes/history'
import { type AppSettings, DEFAULT_APP_SETTINGS } from '@/lib/settings'

const loadConfiguredBarcodeProvider = vi.fn<() => Promise<BarcodeProvider | null>>()

vi.mock('@/lib/barcode-providers/load-configured', () => ({
	loadConfiguredBarcodeProvider: () => loadConfiguredBarcodeProvider(),
	loadAllBarcodeProvidersForAdmin: async () => [],
	isKnownBarcodeProviderId: () => true,
}))

beforeEach(() => {
	loadConfiguredBarcodeProvider.mockReset()
})

function settings(overrides: Partial<AppSettings['barcode']> = {}): AppSettings {
	return {
		...DEFAULT_APP_SETTINGS,
		barcode: { ...DEFAULT_APP_SETTINGS.barcode, enabled: true, ...overrides },
	}
}

function fakeProvider(opts: {
	id?: 'upcitemdb-trial' | 'go-upc'
	available?: boolean
	results?: Array<ProviderResult> | null
	throws?: Error
}): BarcodeProvider {
	return {
		id: opts.id ?? 'upcitemdb-trial',
		displayName: 'fake',
		isAvailable: () => opts.available !== false,
		lookup: vi.fn(async () => {
			if (opts.throws) throw opts.throws
			return opts.results ?? null
		}),
	}
}

// Well-formed test GTINs. Each test picks a unique one so the
// in-process coalescing Map doesn't bleed state between cases.
const GTIN_BOOK_RAW = '9781400052929' // EAN-13
const GTIN_BOOK_NORM = '09781400052929'

describe('lookupProductByBarcodeImpl', () => {
	it('returns barcode-disabled when the feature is off, BEFORE parsing the code', async () => {
		await withRollback(async tx => {
			const result = await lookupProductByBarcodeImpl({
				db: tx,
				rawCode: 'garbage',
				settings: { ...DEFAULT_APP_SETTINGS, barcode: { ...DEFAULT_APP_SETTINGS.barcode, enabled: false } },
			})
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('barcode-disabled')
		})
	})

	it('returns invalid-code without touching the cache', async () => {
		await withRollback(async tx => {
			const result = await lookupProductByBarcodeImpl({
				db: tx,
				rawCode: '012993441013', // off-by-one check digit
				settings: settings(),
			})
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('invalid-code')
			const rows = await tx.select().from(productLookups)
			expect(rows).toHaveLength(0)
			expect(loadConfiguredBarcodeProvider).not.toHaveBeenCalled()
		})
	})

	it('returns provider-unavailable when no provider is configured', async () => {
		await withRollback(async tx => {
			loadConfiguredBarcodeProvider.mockResolvedValue(null)
			const result = await lookupProductByBarcodeImpl({
				db: tx,
				rawCode: '0123456789012',
				settings: settings(),
			})
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('provider-unavailable')
		})
	})

	it('returns provider-unavailable when the provider throws', async () => {
		await withRollback(async tx => {
			loadConfiguredBarcodeProvider.mockResolvedValue(fakeProvider({ throws: new Error('boom') }))
			const result = await lookupProductByBarcodeImpl({
				db: tx,
				rawCode: '0123456789012',
				settings: settings(),
			})
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('provider-unavailable')
		})
	})

	it('returns not-found and DOES NOT cache when the provider returns null', async () => {
		await withRollback(async tx => {
			loadConfiguredBarcodeProvider.mockResolvedValue(fakeProvider({ results: null }))
			const result = await lookupProductByBarcodeImpl({
				db: tx,
				rawCode: '0123456789012',
				settings: settings(),
			})
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('not-found')
			const rows = await tx.select().from(productLookups)
			expect(rows).toHaveLength(0)
		})
	})

	it('caches the provider result and serves the second call from cache', async () => {
		await withRollback(async tx => {
			const provider = fakeProvider({
				results: [{ title: 'Hitchhiker', brand: 'Pan' }, { title: 'Hitchhiker (edition 2)' }],
			})
			loadConfiguredBarcodeProvider.mockResolvedValue(provider)

			const first = await lookupProductByBarcodeImpl({ db: tx, rawCode: GTIN_BOOK_RAW, settings: settings() })
			expect(first.kind).toBe('ok')
			if (first.kind === 'ok') {
				expect(first.source).toBe('provider')
				expect(first.cached).toBe(false)
				expect(first.gtin14).toBe(GTIN_BOOK_NORM)
				expect(first.results).toHaveLength(2)
			}

			// Second call hits the cache - provider must not be called again.
			const callCountBefore = (provider.lookup as unknown as { mock: { calls: Array<unknown> } }).mock.calls.length
			const second = await lookupProductByBarcodeImpl({ db: tx, rawCode: GTIN_BOOK_RAW, settings: settings() })
			expect(second.kind).toBe('ok')
			if (second.kind === 'ok') {
				expect(second.source).toBe('cache')
				expect(second.cached).toBe(true)
				expect(second.results).toEqual(first.kind === 'ok' ? first.results : [])
			}
			const callCountAfter = (provider.lookup as unknown as { mock: { calls: Array<unknown> } }).mock.calls.length
			expect(callCountAfter).toBe(callCountBefore)
		})
	})

	it('collapses length variants of the same GTIN to one cache row', async () => {
		await withRollback(async tx => {
			loadConfiguredBarcodeProvider.mockResolvedValue(fakeProvider({ results: [{ title: 'X' }] }))

			// UPC-A 12 digits.
			const r1 = await lookupProductByBarcodeImpl({ db: tx, rawCode: '012993441012', settings: settings() })
			// Same code padded to 13.
			const r2 = await lookupProductByBarcodeImpl({ db: tx, rawCode: '0012993441012', settings: settings() })
			// Same code padded to 14.
			const r3 = await lookupProductByBarcodeImpl({ db: tx, rawCode: '00012993441012', settings: settings() })

			expect(r1.kind === 'ok' && r2.kind === 'ok' && r3.kind === 'ok').toBe(true)
			if (r1.kind === 'ok' && r2.kind === 'ok' && r3.kind === 'ok') {
				expect(r1.gtin14).toBe(r2.gtin14)
				expect(r2.gtin14).toBe(r3.gtin14)
				expect(r1.source).toBe('provider')
				expect(r2.source).toBe('cache')
				expect(r3.source).toBe('cache')
			}

			const rows = await tx.select().from(productLookups)
			expect(rows).toHaveLength(1)
			expect(rows[0].code).toBe('00012993441012')
		})
	})

	it('refreshes a stale cache row when cacheTtlHours has elapsed', async () => {
		await withRollback(async tx => {
			// Seed an old row.
			await tx.insert(productLookups).values({
				code: GTIN_BOOK_NORM,
				providerId: 'stale-provider',
				results: [{ title: 'old' }],
				updatedAt: new Date('2020-01-01T00:00:00Z'),
			})

			loadConfiguredBarcodeProvider.mockResolvedValue(fakeProvider({ id: 'go-upc', results: [{ title: 'fresh' }] }))

			const result = await lookupProductByBarcodeImpl({
				db: tx,
				rawCode: GTIN_BOOK_RAW,
				settings: settings({ cacheTtlHours: 1 }),
			})
			expect(result.kind).toBe('ok')
			if (result.kind === 'ok') {
				expect(result.source).toBe('provider')
				expect(result.cached).toBe(false)
				expect(result.providerId).toBe('go-upc')
				expect(result.results).toEqual([{ title: 'fresh' }])
			}
			const after = await tx.select().from(productLookups).where(eq(productLookups.code, GTIN_BOOK_NORM))
			expect(after[0].providerId).toBe('go-upc')
		})
	})

	it('cacheTtlHours: 0 always treats cached rows as stale', async () => {
		await withRollback(async tx => {
			await tx.insert(productLookups).values({
				code: GTIN_BOOK_NORM,
				providerId: 'stale-provider',
				results: [{ title: 'old' }],
			})

			loadConfiguredBarcodeProvider.mockResolvedValue(fakeProvider({ results: [{ title: 'fresh' }] }))

			const result = await lookupProductByBarcodeImpl({
				db: tx,
				rawCode: GTIN_BOOK_RAW,
				settings: settings({ cacheTtlHours: 0 }),
			})
			expect(result.kind).toBe('ok')
			if (result.kind === 'ok') expect(result.source).toBe('provider')
		})
	})
})

describe('barcode lookup history', () => {
	it('writes nothing when the feature is off', async () => {
		await withRollback(async tx => {
			await lookupProductByBarcodeImpl({
				db: tx,
				rawCode: GTIN_BOOK_RAW,
				settings: { ...DEFAULT_APP_SETTINGS, barcode: { ...DEFAULT_APP_SETTINGS.barcode, enabled: false } },
			})
			expect(await tx.select().from(barcodeLookupHistory)).toHaveLength(0)
		})
	})

	it('records one row per lookup with the outcome, provider, and scanner', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			loadConfiguredBarcodeProvider.mockResolvedValue(fakeProvider({ id: 'go-upc', results: [{ title: 'Hitchhiker', brand: 'Pan' }] }))

			await lookupProductByBarcodeImpl({ db: tx, rawCode: GTIN_BOOK_RAW, settings: settings(), userId: user.id })
			await lookupProductByBarcodeImpl({ db: tx, rawCode: GTIN_BOOK_RAW, settings: settings(), userId: user.id })
			await lookupProductByBarcodeImpl({ db: tx, rawCode: '012993441013', settings: settings(), userId: user.id })

			const rows = await tx.select().from(barcodeLookupHistory).orderBy(asc(barcodeLookupHistory.id))
			expect(rows).toHaveLength(3)
			expect(rows[0]).toMatchObject({
				userId: user.id,
				rawCode: GTIN_BOOK_RAW,
				gtin14: GTIN_BOOK_NORM,
				outcome: 'ok',
				source: 'provider',
				providerId: 'go-upc',
				results: [{ title: 'Hitchhiker', brand: 'Pan' }],
			})
			expect(typeof rows[0].ms).toBe('number')
			expect(rows[1]).toMatchObject({ outcome: 'ok', source: 'cache', providerId: 'go-upc' })
			expect(rows[2]).toMatchObject({ rawCode: '012993441013', gtin14: null, outcome: 'invalid-code', providerId: null })
		})
	})

	it('records the provider on a miss and its message on a throw', async () => {
		await withRollback(async tx => {
			loadConfiguredBarcodeProvider.mockResolvedValueOnce(fakeProvider({ results: null }))
			await lookupProductByBarcodeImpl({ db: tx, rawCode: '0123456789012', settings: settings() })
			loadConfiguredBarcodeProvider.mockResolvedValueOnce(fakeProvider({ throws: new Error('quota exceeded') }))
			await lookupProductByBarcodeImpl({ db: tx, rawCode: '0123456789012', settings: settings() })

			const rows = await tx.select().from(barcodeLookupHistory).orderBy(asc(barcodeLookupHistory.id))
			expect(rows).toHaveLength(2)
			expect(rows[0]).toMatchObject({ outcome: 'not-found', source: null, providerId: 'upcitemdb-trial', results: null, userId: null })
			expect(rows[1]).toMatchObject({ outcome: 'provider-unavailable', providerId: 'upcitemdb-trial', errorMessage: 'quota exceeded' })
		})
	})

	it('sweeps rows older than the retention window', async () => {
		await withRollback(async tx => {
			const now = new Date('2026-10-29T12:00:00Z')
			const day = 86_400_000
			await tx.insert(barcodeLookupHistory).values([
				{ rawCode: 'old', outcome: 'invalid-code', createdAt: new Date(now.getTime() - 91 * day) },
				{ rawCode: 'recent', outcome: 'invalid-code', createdAt: new Date(now.getTime() - 89 * day) },
			])
			expect(await sweepBarcodeLookupHistory({ db: tx, now, retentionDays: 90 })).toEqual({ deleted: 1 })
			const left = await tx.select().from(barcodeLookupHistory)
			expect(left.map(r => r.rawCode)).toEqual(['recent'])
		})
	})
})

describe('runBarcodeProviderProbeImpl', () => {
	it('rejects an unknown provider id', async () => {
		const result = await runBarcodeProviderProbeImpl({
			providerId: 'no-such-thing',
			rawCode: GTIN_BOOK_RAW,
			allProviders: [],
		})
		expect(result.kind).toBe('error')
		if (result.kind === 'error') expect(result.reason).toBe('unknown-provider')
	})

	it('rejects an invalid barcode without invoking the provider', async () => {
		const lookup = vi.fn()
		const provider: BarcodeProvider = {
			id: 'upcitemdb-trial',
			displayName: 'fake',
			isAvailable: () => true,
			lookup,
		}
		const result = await runBarcodeProviderProbeImpl({
			providerId: 'upcitemdb-trial',
			rawCode: 'not-a-code',
			allProviders: [provider],
		})
		expect(result.kind).toBe('error')
		if (result.kind === 'error') expect(result.reason).toBe('invalid-code')
		expect(lookup).not.toHaveBeenCalled()
	})

	it('reports not-configured when the provider is unavailable', async () => {
		const provider = fakeProvider({ available: false })
		const result = await runBarcodeProviderProbeImpl({
			providerId: provider.id,
			rawCode: GTIN_BOOK_RAW,
			allProviders: [provider],
		})
		expect(result.kind).toBe('unavailable')
		if (result.kind === 'unavailable') expect(result.reason).toBe('not-configured')
	})

	it('reports threw with the message when the provider raises', async () => {
		const provider = fakeProvider({ throws: new Error('upstream 502') })
		const result = await runBarcodeProviderProbeImpl({
			providerId: provider.id,
			rawCode: GTIN_BOOK_RAW,
			allProviders: [provider],
		})
		expect(result.kind).toBe('unavailable')
		if (result.kind === 'unavailable') {
			expect(result.reason).toBe('threw')
			expect(result.message).toBe('upstream 502')
		}
	})

	it('returns the candidates on a hit', async () => {
		const provider = fakeProvider({ results: [{ title: 'A' }, { title: 'B' }] })
		const result = await runBarcodeProviderProbeImpl({
			providerId: provider.id,
			rawCode: GTIN_BOOK_RAW,
			allProviders: [provider],
		})
		expect(result.kind).toBe('ok')
		if (result.kind === 'ok') {
			expect(result.gtin14).toBe(GTIN_BOOK_NORM)
			expect(result.results).toEqual([{ title: 'A' }, { title: 'B' }])
		}
	})

	it('returns miss when the provider returns null', async () => {
		const provider = fakeProvider({ results: null })
		const result = await runBarcodeProviderProbeImpl({
			providerId: provider.id,
			rawCode: GTIN_BOOK_RAW,
			allProviders: [provider],
		})
		expect(result.kind).toBe('miss')
	})
})
