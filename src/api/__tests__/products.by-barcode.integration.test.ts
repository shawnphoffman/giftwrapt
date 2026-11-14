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

import { lookupProductByBarcodeImpl, MISS_TTL_HOURS, runBarcodeProviderProbeImpl } from '@/api/_products-impl'
import { barcodeLookupHistory, productLookups } from '@/db/schema'
import type { BarcodeProvider, ProviderResult } from '@/lib/barcode-providers/types'
import { sweepBarcodeLookupHistory } from '@/lib/barcodes/history'
import type * as ProductIdentifyModule from '@/lib/product-identify'
import type { ProductIdentity } from '@/lib/product-identify'
import { type AppSettings, DEFAULT_APP_SETTINGS } from '@/lib/settings'

const loadConfiguredBarcodeProvider = vi.fn<() => Promise<BarcodeProvider | null>>()

vi.mock('@/lib/barcode-providers/load-configured', () => ({
	loadConfiguredBarcodeProvider: () => loadConfiguredBarcodeProvider(),
	loadAllBarcodeProvidersForAdmin: async () => [],
	isKnownBarcodeProviderId: () => true,
}))

// The model call itself is stubbed; the cleaning and notes-writing halves
// of the module stay real.
const identifyProduct = vi.fn<(...args: Array<unknown>) => Promise<ProductIdentity>>()
const loadIdentifyModel = vi.fn<() => Promise<{ model: never } | null>>()

vi.mock('@/lib/product-identify', async importOriginal => ({
	...(await importOriginal<typeof ProductIdentifyModule>()),
	identifyProduct: (...args: Array<unknown>) => identifyProduct(...args),
	loadIdentifyModel: () => loadIdentifyModel(),
}))

beforeEach(() => {
	loadConfiguredBarcodeProvider.mockReset()
	identifyProduct.mockReset()
	loadIdentifyModel.mockReset()
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

	it('remembers a miss so a repeat scan makes no second provider call', async () => {
		await withRollback(async tx => {
			const provider = fakeProvider({ results: null })
			loadConfiguredBarcodeProvider.mockResolvedValue(provider)
			const first = await lookupProductByBarcodeImpl({ db: tx, rawCode: '0123456789012', settings: settings() })
			const second = await lookupProductByBarcodeImpl({ db: tx, rawCode: '0123456789012', settings: settings() })
			for (const result of [first, second]) {
				expect(result.kind).toBe('error')
				if (result.kind === 'error') expect(result.reason).toBe('not-found')
			}
			expect(provider.lookup).toHaveBeenCalledTimes(1)
			const rows = await tx.select().from(productLookups)
			expect(rows).toHaveLength(1)
			expect(rows[0].results).toEqual([])
		})
	})

	it('asks the provider again once a remembered miss is older than its window', async () => {
		await withRollback(async tx => {
			const stale = new Date(Date.now() - (MISS_TTL_HOURS + 1) * 60 * 60 * 1000)
			await tx.insert(productLookups).values({ code: '00123456789012', providerId: 'upcitemdb-trial', results: [], updatedAt: stale })
			const provider = fakeProvider({ results: [{ title: 'Now Listed' }] })
			loadConfiguredBarcodeProvider.mockResolvedValue(provider)
			const result = await lookupProductByBarcodeImpl({ db: tx, rawCode: '0123456789012', settings: settings() })
			expect(result.kind).toBe('ok')
			if (result.kind === 'ok') expect(result.source).toBe('provider')
			expect(provider.lookup).toHaveBeenCalledTimes(1)
		})
	})

	it('does not write a miss when caching is off', async () => {
		await withRollback(async tx => {
			loadConfiguredBarcodeProvider.mockResolvedValue(fakeProvider({ results: null }))
			await lookupProductByBarcodeImpl({ db: tx, rawCode: '0123456789012', settings: settings({ cacheTtlHours: 0 }) })
			expect(await tx.select().from(productLookups)).toHaveLength(0)
		})
	})

	it('answers not-found for a store-internal code without calling the provider', async () => {
		await withRollback(async tx => {
			const provider = fakeProvider({ results: [{ title: 'Should not be reached' }] })
			loadConfiguredBarcodeProvider.mockResolvedValue(provider)
			// An American Eagle hang tag: number system 4, in-store use.
			const result = await lookupProductByBarcodeImpl({ db: tx, rawCode: '0400459324311', settings: settings() })
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('not-found')
			expect(loadConfiguredBarcodeProvider).not.toHaveBeenCalled()
			expect(provider.lookup).not.toHaveBeenCalled()
		})
	})

	it('rejects the all-zero probe code and keeps it out of the history', async () => {
		await withRollback(async tx => {
			const result = await lookupProductByBarcodeImpl({ db: tx, rawCode: '0000000000000', settings: settings() })
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('invalid-code')
			expect(loadConfiguredBarcodeProvider).not.toHaveBeenCalled()
			expect(await tx.select().from(barcodeLookupHistory)).toHaveLength(0)
		})
	})

	it("drops a link to the provider's own site, on fresh results and on rows cached before the rule", async () => {
		await withRollback(async tx => {
			const redirect = 'https://www.upcitemdb.com/norob/alink/?id=abc&tid=1'
			loadConfiguredBarcodeProvider.mockResolvedValue(
				fakeProvider({
					results: [
						{ title: 'Pajama Pants', brand: 'Outerstuff', candidateUrl: redirect, soldAt: ["Kohl's"] },
						{ title: 'Store Page', candidateUrl: 'https://www.kohls.com/product/prd-1.jsp' },
						{ title: 'Not A Link', candidateUrl: 'javascript:alert(1)' },
					],
				})
			)
			const fresh = await lookupProductByBarcodeImpl({ db: tx, rawCode: '197092561820', settings: settings() })
			expect(fresh.kind).toBe('ok')
			if (fresh.kind === 'ok') {
				expect(fresh.results[0].candidateUrl).toBeUndefined()
				expect(fresh.results[0].suggestedNotes).toBe("Brand: Outerstuff\nSold at: Kohl's")
				expect(fresh.results[1].candidateUrl).toBe('https://www.kohls.com/product/prd-1.jsp')
				expect(fresh.results[2].candidateUrl).toBeUndefined()
			}

			// A row written before this rule existed still holds the redirect.
			await tx
				.insert(productLookups)
				.values({ code: '00074101944686', providerId: 'upcitemdb-trial', results: [{ title: 'Instax Film', candidateUrl: redirect }] })
			const cached = await lookupProductByBarcodeImpl({ db: tx, rawCode: '074101944686', settings: settings() })
			expect(cached.kind).toBe('ok')
			if (cached.kind === 'ok') {
				expect(cached.source).toBe('cache')
				expect(cached.results[0]).toEqual({ title: 'Instax Film' })
			}
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

describe('AI clean-up of a barcode hit', () => {
	const RAW_TITLE = "Youth Royal Indianapolis Colts Team-Colored Printed Pajama Pants, Boy's, Size: YTH Medium, Blue"
	const on = (): AppSettings => ({ ...settings(), aiBarcodeIdentifyEnabled: true })

	it('is off by default: no model call, the provider title is returned', async () => {
		await withRollback(async tx => {
			loadConfiguredBarcodeProvider.mockResolvedValue(fakeProvider({ results: [{ title: RAW_TITLE, brand: 'Outerstuff' }] }))
			const result = await lookupProductByBarcodeImpl({ db: tx, rawCode: '036000291452', settings: settings() })
			expect(identifyProduct).not.toHaveBeenCalled()
			expect(loadIdentifyModel).not.toHaveBeenCalled()
			if (result.kind === 'ok') expect(result.results[0].title).toBe(RAW_TITLE)
		})
	})

	it('does nothing when no AI provider is configured', async () => {
		await withRollback(async tx => {
			loadIdentifyModel.mockResolvedValue(null)
			loadConfiguredBarcodeProvider.mockResolvedValue(fakeProvider({ results: [{ title: RAW_TITLE }] }))
			const result = await lookupProductByBarcodeImpl({ db: tx, rawCode: '036000291469', settings: on() })
			expect(identifyProduct).not.toHaveBeenCalled()
			expect(result.kind).toBe('ok')
			if (result.kind === 'ok') expect(result.results[0]).toEqual({ title: RAW_TITLE })
		})
	})

	it('cleans the first candidate once, caches it, and takes stores from the provider only', async () => {
		await withRollback(async tx => {
			loadIdentifyModel.mockResolvedValue({ model: {} as never })
			identifyProduct.mockResolvedValue({
				title: 'Indianapolis Colts Youth Pajama Pants',
				brand: 'Outerstuff',
				size: 'Youth Medium',
				color: 'Royal Blue',
				soldAt: ['made-up-store.example'],
				price: '19.99',
			})
			loadConfiguredBarcodeProvider.mockResolvedValue(
				fakeProvider({ results: [{ title: RAW_TITLE, brand: 'Outerstuff', soldAt: ["Kohl's"] }, { title: 'Second Candidate' }] })
			)

			const first = await lookupProductByBarcodeImpl({ db: tx, rawCode: '036000291476', settings: on(), aiSource: 'mobile' })
			expect(first.kind).toBe('ok')
			if (first.kind !== 'ok') return
			expect(first.results[0]).toEqual({
				title: 'Indianapolis Colts Youth Pajama Pants',
				rawTitle: RAW_TITLE,
				brand: 'Outerstuff',
				soldAt: ["Kohl's"],
				identity: { brand: 'Outerstuff', size: 'Youth Medium', color: 'Royal Blue' },
				suggestedNotes: "Brand: Outerstuff\nSize: Youth Medium\nColor: Royal Blue\nSold at: Kohl's",
			})
			expect(first.results[1]).toEqual({ title: 'Second Candidate' })
			expect(identifyProduct.mock.calls[0][0]).toMatchObject({ feature: 'barcode-identify', source: 'mobile' })
			expect(identifyProduct.mock.calls[0][2]).toEqual({
				candidate: { title: RAW_TITLE, brand: 'Outerstuff' },
				scannedCode: '00036000291476',
			})

			const second = await lookupProductByBarcodeImpl({ db: tx, rawCode: '036000291476', settings: on() })
			expect(second.kind === 'ok' && second.source).toBe('cache')
			if (second.kind === 'ok') expect(second.results).toEqual(first.results)
			expect(identifyProduct).toHaveBeenCalledTimes(1)

			// The notes are written on read, never stored.
			const [row] = await tx.select().from(productLookups).where(eq(productLookups.code, '00036000291476'))
			expect(row.results[0].suggestedNotes).toBeUndefined()
		})
	})

	it('returns and caches the provider result untouched when the model call fails', async () => {
		await withRollback(async tx => {
			loadIdentifyModel.mockResolvedValue({ model: {} as never })
			identifyProduct.mockRejectedValue(new Error('The operation was aborted due to timeout'))
			loadConfiguredBarcodeProvider.mockResolvedValue(fakeProvider({ results: [{ title: RAW_TITLE }] }))
			const result = await lookupProductByBarcodeImpl({ db: tx, rawCode: '036000291483', settings: on() })
			expect(result.kind).toBe('ok')
			if (result.kind === 'ok') expect(result.results).toEqual([{ title: RAW_TITLE }])
			const [row] = await tx.select().from(productLookups).where(eq(productLookups.code, '00036000291483'))
			expect(row.results).toEqual([{ title: RAW_TITLE }])
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
			// A different code: the first one is now a remembered miss and would
			// not reach the provider again.
			loadConfiguredBarcodeProvider.mockResolvedValueOnce(fakeProvider({ throws: new Error('quota exceeded') }))
			await lookupProductByBarcodeImpl({ db: tx, rawCode: '036000291452', settings: settings() })

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
