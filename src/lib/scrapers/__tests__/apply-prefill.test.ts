import { describe, expect, it } from 'vitest'

import { applyScrapePrefill, type PrefillFields } from '../apply-prefill'
import type { ScrapeResult } from '../types'

const empty: PrefillFields = { title: '', price: '', notes: '', imageUrl: '' }

const fullScrape: ScrapeResult = {
	title: 'ACME Widget',
	description: 'A useful description',
	price: '29.99',
	imageUrls: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'],
	finalUrl: 'https://acme.test/widget',
}

describe('applyScrapePrefill: fill-from-empty', () => {
	it('fills every field when the form is blank and the scrape has values', () => {
		const update = applyScrapePrefill(empty, fullScrape)
		expect(update.title).toBe('ACME Widget')
		expect(update.price).toBe('29.99')
		expect(update.notes).toBe('A useful description')
		expect(update.imageUrl).toBe('https://cdn.test/a.jpg')
		expect(update.imageCandidates).toEqual(fullScrape.imageUrls)
	})

	it('preserves non-empty fields and only fills the empty ones', () => {
		const current: PrefillFields = { title: 'My title', price: '', notes: 'my notes', imageUrl: '' }
		const update = applyScrapePrefill(current, fullScrape)
		expect(update.title).toBeUndefined()
		expect(update.price).toBe('29.99')
		expect(update.notes).toBeUndefined()
		expect(update.imageUrl).toBe('https://cdn.test/a.jpg')
	})

	it('treats whitespace-only strings as empty', () => {
		const current: PrefillFields = { title: '   ', price: '\t', notes: '\n', imageUrl: '   ' }
		const update = applyScrapePrefill(current, fullScrape)
		expect(update.title).toBe('ACME Widget')
		expect(update.price).toBe('29.99')
		expect(update.notes).toBe('A useful description')
		expect(update.imageUrl).toBe('https://cdn.test/a.jpg')
	})
})

describe('applyScrapePrefill: missing scrape fields', () => {
	it('skips a field when the scrape has no value for it', () => {
		const sparse: ScrapeResult = { imageUrls: [] }
		const update = applyScrapePrefill(empty, sparse)
		expect(update.title).toBeUndefined()
		expect(update.price).toBeUndefined()
		expect(update.notes).toBeUndefined()
		expect(update.imageUrl).toBeUndefined()
		expect(update.imageCandidates).toEqual([])
	})

	it('only fills fields the scrape actually carries', () => {
		const titleOnly: ScrapeResult = { title: 'Just a title', imageUrls: [] }
		const update = applyScrapePrefill(empty, titleOnly)
		expect(update.title).toBe('Just a title')
		expect(update.price).toBeUndefined()
		expect(update.notes).toBeUndefined()
		expect(update.imageUrl).toBeUndefined()
	})
})

describe('applyScrapePrefill: image candidates', () => {
	it('always returns imageCandidates so the picker can refresh on re-scrape', () => {
		const current: PrefillFields = { title: 'kept', price: 'kept', notes: 'kept', imageUrl: 'kept' }
		const update = applyScrapePrefill(current, fullScrape)
		// All scalars are preserved (current values non-empty)…
		expect(update.title).toBeUndefined()
		expect(update.imageUrl).toBeUndefined()
		// …but the picker still gets the new candidate list.
		expect(update.imageCandidates).toEqual(fullScrape.imageUrls)
	})

	it('returns the same candidate list reference (no copy) for cheap updates', () => {
		const update = applyScrapePrefill(empty, fullScrape)
		expect(update.imageCandidates).toBe(fullScrape.imageUrls)
	})

	it('only auto-selects when imageUrl is empty', () => {
		const withImage: PrefillFields = { ...empty, imageUrl: 'https://existing.test/x.jpg' }
		const update = applyScrapePrefill(withImage, fullScrape)
		expect(update.imageUrl).toBeUndefined()
	})

	it('falls back gracefully when imageUrls is empty even though scrape has other fields', () => {
		const noImages: ScrapeResult = { title: 'Has title', imageUrls: [] }
		const update = applyScrapePrefill(empty, noImages)
		expect(update.title).toBe('Has title')
		expect(update.imageUrl).toBeUndefined()
		expect(update.imageCandidates).toEqual([])
	})
})

describe('applyScrapePrefill: idempotence', () => {
	it('re-running with the same inputs yields equivalent output', () => {
		const first = applyScrapePrefill(empty, fullScrape)
		const second = applyScrapePrefill(empty, fullScrape)
		expect(second).toEqual(first)
	})

	it('after applying once, a follow-up call against the now-populated form is a no-op for scalars', () => {
		// Simulates: scrape arrives → form fills. Parallel finishes + emits a
		// `result_updated` → effect re-runs. We expect no scalar updates the
		// second time around because the values are no longer empty.
		const first = applyScrapePrefill(empty, fullScrape)
		const populated: PrefillFields = {
			title: first.title ?? '',
			price: first.price ?? '',
			notes: first.notes ?? '',
			imageUrl: first.imageUrl ?? '',
		}
		const second = applyScrapePrefill(populated, fullScrape)
		expect(second.title).toBeUndefined()
		expect(second.price).toBeUndefined()
		expect(second.notes).toBeUndefined()
		expect(second.imageUrl).toBeUndefined()
		// Image candidates still flow through.
		expect(second.imageCandidates).toEqual(fullScrape.imageUrls)
	})
})
