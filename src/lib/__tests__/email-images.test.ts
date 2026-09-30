import { describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({
	env: {
		LOG_LEVEL: 'silent',
		LOG_PRETTY: false,
		BETTER_AUTH_SECRET: 'test-secret',
		BETTER_AUTH_URL: 'https://gifts.test',
		STORAGE_PUBLIC_URL: 'https://cdn.test/',
	},
}))

const safeFetch = vi.fn()
vi.mock('@/lib/scrapers/safe-fetch', () => ({ safeFetch: (...args: Array<unknown>) => safeFetch(...args) }))

const { absoluteEmailImageUrl, isLoadableEmailImage, resolveEmailImages } = await import('@/lib/email-images')

function response(status: number, contentType: string | null): Response {
	return new Response(null, { status, headers: contentType ? { 'content-type': contentType } : {} })
}

describe('absoluteEmailImageUrl', () => {
	it('prefixes root-relative storage paths with the app base URL', () => {
		expect(absoluteEmailImageUrl('/api/files/items/42/abc.webp')).toBe('https://gifts.test/api/files/items/42/abc.webp')
	})

	it('upgrades http and protocol-relative URLs to https', () => {
		expect(absoluteEmailImageUrl('http://vendor.test/a.jpg')).toBe('https://vendor.test/a.jpg')
		expect(absoluteEmailImageUrl('//vendor.test/a.jpg')).toBe('https://vendor.test/a.jpg')
	})

	it('returns null for empty, data: and unparseable values', () => {
		expect(absoluteEmailImageUrl(null)).toBeNull()
		expect(absoluteEmailImageUrl('   ')).toBeNull()
		expect(absoluteEmailImageUrl('data:image/png;base64,AAAA')).toBeNull()
		expect(absoluteEmailImageUrl('not a url')).toBeNull()
	})
})

describe('isLoadableEmailImage', () => {
	it('accepts a 2xx image response', async () => {
		safeFetch.mockResolvedValueOnce(response(200, 'image/jpeg'))
		expect(await isLoadableEmailImage('https://vendor.test/a.jpg')).toBe(true)
	})

	it('rejects error statuses, non-image bodies, SVG, and fetch failures', async () => {
		safeFetch.mockResolvedValueOnce(response(404, 'image/jpeg'))
		expect(await isLoadableEmailImage('https://vendor.test/a.jpg')).toBe(false)
		safeFetch.mockResolvedValueOnce(response(200, 'text/html; charset=utf-8'))
		expect(await isLoadableEmailImage('https://vendor.test/a.jpg')).toBe(false)
		safeFetch.mockResolvedValueOnce(response(200, 'image/svg+xml'))
		expect(await isLoadableEmailImage('https://vendor.test/a.svg')).toBe(false)
		safeFetch.mockRejectedValueOnce(new Error('private address'))
		expect(await isLoadableEmailImage('https://vendor.test/a.jpg')).toBe(false)
	})
})

describe('resolveEmailImages', () => {
	it('probes only external URLs and nulls the ones that fail', async () => {
		const probe = vi.fn((url: string) => Promise.resolve(!url.includes('gone')))
		const resolved = await resolveEmailImages(
			[
				'/api/files/items/1/a.webp',
				'https://cdn.test/items/2/b.webp',
				'http://vendor.test/ok.jpg',
				'https://vendor.test/gone.jpg',
				null,
				'',
			],
			{ probe }
		)
		expect(probe.mock.calls.map(([url]) => url).sort()).toEqual(['https://vendor.test/gone.jpg', 'https://vendor.test/ok.jpg'])
		expect(resolved.get('/api/files/items/1/a.webp')).toBe('https://gifts.test/api/files/items/1/a.webp')
		expect(resolved.get('https://cdn.test/items/2/b.webp')).toBe('https://cdn.test/items/2/b.webp')
		expect(resolved.get('http://vendor.test/ok.jpg')).toBe('https://vendor.test/ok.jpg')
		expect(resolved.get('https://vendor.test/gone.jpg')).toBeNull()
		expect(resolved.has('')).toBe(false)
	})

	it('probes each distinct URL once', async () => {
		const probe = vi.fn(() => Promise.resolve(true))
		await resolveEmailImages(['https://vendor.test/a.jpg', 'https://vendor.test/a.jpg', 'https://vendor.test/b.jpg'], { probe })
		expect(probe).toHaveBeenCalledTimes(2)
	})

	it('stops probing once the budget is spent and keeps the remaining URLs', async () => {
		let t = 0
		const probe = vi.fn(() => {
			t += 10_000
			return Promise.resolve(false)
		})
		const urls = ['https://vendor.test/1.jpg', 'https://vendor.test/2.jpg', 'https://vendor.test/3.jpg', 'https://vendor.test/4.jpg']
		const resolved = await resolveEmailImages(urls, { probe, budgetMs: 15_000, now: () => t })
		const nulled = urls.filter(u => resolved.get(u) === null)
		const kept = urls.filter(u => resolved.get(u) !== null)
		expect(nulled.length).toBeGreaterThan(0)
		expect(kept.length).toBeGreaterThan(0)
		expect(probe.mock.calls.length).toBe(nulled.length)
	})
})
