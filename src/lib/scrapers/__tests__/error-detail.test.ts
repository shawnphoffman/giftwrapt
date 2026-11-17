import { describe, expect, it } from 'vitest'

import { readUpstreamErrorDetail, redactDiagnostic, secretsFromRequest } from '../error-detail'

function jsonResponse(status: number, body: unknown): Response {
	return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
}

describe('redactDiagnostic', () => {
	it('returns undefined for empty input', () => {
		expect(redactDiagnostic(undefined)).toBeUndefined()
		expect(redactDiagnostic('   ')).toBeUndefined()
	})

	it('leaves an ordinary message alone', () => {
		expect(redactDiagnostic('browser_unavailable: browser connect timed out after 10000ms')).toBe(
			'browser_unavailable: browser connect timed out after 10000ms'
		)
	})

	it('drops query strings and credentials from URLs, whatever the scheme', () => {
		const out = redactDiagnostic('connect failed: wss://user:hunter2@browser.test/path?token=abc123&stealth=true (530)')
		expect(out).toBe('connect failed: wss://browser.test/path?[query removed] (530)')
	})

	it('blanks bearer credentials and token-style pairs', () => {
		const out = redactDiagnostic('sent Authorization: Bearer abc.def-123 with api_key=zzz999 and "x-scrape-token": "qqq111"')
		expect(out).not.toContain('abc.def-123')
		expect(out).not.toContain('zzz999')
		expect(out).not.toContain('qqq111')
	})

	it('blanks the secrets it is given, wherever they appear', () => {
		expect(redactDiagnostic('upstream echoed s3cr3t-value back', ['s3cr3t-value'])).toBe('upstream echoed [redacted] back')
	})

	it('ignores secrets too short to match safely', () => {
		expect(redactDiagnostic('page had no title', ['no'])).toBe('page had no title')
	})

	it('collapses whitespace and caps the length', () => {
		const out = redactDiagnostic(`a\n\n  b ${'x'.repeat(500)}`)
		expect(out?.startsWith('a b x')).toBe(true)
		expect(out).toHaveLength(300)
		expect(out?.endsWith('…')).toBe(true)
	})
})

describe('secretsFromRequest', () => {
	it('collects header values, their credential part, and endpoint query values', () => {
		const secrets = secretsFromRequest(
			{ authorization: 'Bearer my-long-secret', accept: 'application/json' },
			new URL('https://scraper.test/scrape?key=endpoint-key-1&url=https%3A%2F%2Ftarget.test%2Fx')
		)
		expect(secrets).toEqual(expect.arrayContaining(['Bearer my-long-secret', 'my-long-secret', 'endpoint-key-1']))
	})
})

describe('readUpstreamErrorDetail', () => {
	it('reads the flat { error, message } shape', async () => {
		const detail = await readUpstreamErrorDetail(jsonResponse(503, { error: 'browser_unavailable', message: 'browser connect failed' }))
		expect(detail).toBe('browser_unavailable: browser connect failed')
	})

	it('reads the nested { error: { code, message } } shape', async () => {
		const detail = await readUpstreamErrorDetail(jsonResponse(502, { error: { code: 'bot_block', message: 'blocked by the site' } }))
		expect(detail).toBe('bot_block: blocked by the site')
	})

	it('redacts what the upstream echoes back', async () => {
		const detail = await readUpstreamErrorDetail(
			jsonResponse(500, { error: 'unknown', message: 'failed calling wss://browser.test/?token=abc123 with my-long-secret' }),
			['my-long-secret']
		)
		expect(detail).toBe('unknown: failed calling wss://browser.test/?[query removed] with [redacted]')
	})

	it('returns undefined for a non-JSON body', async () => {
		expect(await readUpstreamErrorDetail(jsonResponse(502, '<html><body>Bad Gateway</body></html>'))).toBeUndefined()
	})

	it('returns undefined for JSON with no error fields, or no body', async () => {
		expect(await readUpstreamErrorDetail(jsonResponse(500, { ok: false }))).toBeUndefined()
		expect(await readUpstreamErrorDetail(jsonResponse(500, ['nope']))).toBeUndefined()
		expect(await readUpstreamErrorDetail(new Response(null, { status: 500 }))).toBeUndefined()
	})
})
