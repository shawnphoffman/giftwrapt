import { describe, expect, it } from 'vitest'

import { parseUrls } from '../urls'

describe('parseUrls', () => {
	it('returns one draft per http/https URL', () => {
		const out = parseUrls('https://a.com/x\nhttps://b.com/y')
		expect(out.map(d => d.url)).toEqual(['https://a.com/x', 'https://b.com/y'])
		expect(out.every(d => d.title === null)).toBe(true)
	})

	it('strips whitespace and drops blank lines', () => {
		const out = parseUrls('  https://a.com  \n\n   \n https://b.com\n')
		expect(out.map(d => d.url)).toEqual(['https://a.com/', 'https://b.com/'])
	})

	it('skips malformed URLs without throwing', () => {
		const out = parseUrls('not a url\nhttps://ok.com\n//bad')
		expect(out.map(d => d.url)).toEqual(['https://ok.com/'])
	})

	it('skips non-http schemes', () => {
		const out = parseUrls('mailto:a@b.com\njavascript:alert(1)\nftp://x.com\nhttps://ok.com')
		expect(out.map(d => d.url)).toEqual(['https://ok.com/'])
	})

	it('de-dupes URLs that differ only in trailing slash', () => {
		const out = parseUrls('https://a.com/foo\nhttps://a.com/foo/')
		expect(out.map(d => d.url)).toEqual(['https://a.com/foo'])
	})

	it('preserves query and hash as distinguishing parts', () => {
		const out = parseUrls('https://a.com/?id=1\nhttps://a.com/?id=2\nhttps://a.com/#frag')
		expect(out.map(d => d.url)).toEqual(['https://a.com/?id=1', 'https://a.com/?id=2', 'https://a.com/#frag'])
	})

	it('handles CRLF line endings', () => {
		const out = parseUrls('https://a.com\r\nhttps://b.com\r\n')
		expect(out.map(d => d.url)).toEqual(['https://a.com/', 'https://b.com/'])
	})

	it('returns empty array for empty input', () => {
		expect(parseUrls('')).toEqual([])
		expect(parseUrls('   \n\n  ')).toEqual([])
	})
})
