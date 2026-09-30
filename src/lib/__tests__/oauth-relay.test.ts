import { describe, expect, it } from 'vitest'

import { authorizeRelayPath, isAuthorizeRelay, MCP_AUTHORIZE_PATH, passThroughSearch, resolvePostAuthRedirect } from '@/lib/oauth-relay'

describe('authorizeRelayPath', () => {
	it('returns null for an ordinary sign-in search', () => {
		expect(authorizeRelayPath({})).toBeNull()
		expect(authorizeRelayPath({ redirect: '/lists/1' })).toBeNull()
	})

	it('requires both client_id and redirect_uri', () => {
		expect(authorizeRelayPath({ client_id: 'abc' })).toBeNull()
		expect(authorizeRelayPath({ redirect_uri: 'https://client.example/cb' })).toBeNull()
	})

	it('forwards every string-valued param to the authorize endpoint', () => {
		const relay = authorizeRelayPath({
			client_id: 'abc',
			redirect_uri: 'https://client.example/cb',
			response_type: 'code',
			code_challenge: 'xyz',
			code_challenge_method: 'S256',
			state: 's1',
			prompt: 'consent',
			nested: { ignored: true },
			count: 3,
		})
		expect(relay).not.toBeNull()
		const url = new URL(relay!, 'http://placeholder.invalid')
		expect(url.pathname).toBe(MCP_AUTHORIZE_PATH)
		expect(url.searchParams.get('client_id')).toBe('abc')
		expect(url.searchParams.get('redirect_uri')).toBe('https://client.example/cb')
		expect(url.searchParams.get('code_challenge_method')).toBe('S256')
		expect(url.searchParams.get('prompt')).toBe('consent')
		expect(url.searchParams.has('nested')).toBe(false)
		expect(url.searchParams.has('count')).toBe(false)
		expect(isAuthorizeRelay(relay!)).toBe(true)
	})

	it('produces a same-origin path that safeRedirect accepts', async () => {
		const { safeRedirect } = await import('@/lib/safe-redirect')
		const relay = authorizeRelayPath({ client_id: 'abc', redirect_uri: 'https://client.example/cb' })!
		expect(safeRedirect(relay)).toBe(relay)
	})
})

const AUTHORIZE_QUERY = {
	client_id: 'abc',
	redirect_uri: 'https://client.example/cb',
	response_type: 'code',
	scope: 'openid profile',
	state: 's1',
	code_challenge: 'xyz',
	code_challenge_method: 'S256',
	prompt: 'consent',
}

describe('passThroughSearch', () => {
	it('is idempotent, so the router never redirects to a normalised URL', () => {
		// Folding the authorize query into `redirect` inside validateSearch
		// made /sign-in 307 to itself with an ever-growing URL (2026-09-30).
		const once = passThroughSearch(AUTHORIZE_QUERY)
		expect(once).toEqual(AUTHORIZE_QUERY)
		expect(passThroughSearch(once)).toEqual(once)
		expect(passThroughSearch({ redirect: '/lists/1' })).toEqual({ redirect: '/lists/1' })
		expect(passThroughSearch({})).toEqual({})
	})

	it('drops non-string params', () => {
		expect(passThroughSearch({ redirect: '/x', nested: { a: 1 }, n: 2, flag: true })).toEqual({ redirect: '/x' })
	})
})

describe('resolvePostAuthRedirect', () => {
	it('prefers the authorize relay over a plain redirect', () => {
		const target = resolvePostAuthRedirect({ ...AUTHORIZE_QUERY, redirect: '/lists/1' })
		expect(isAuthorizeRelay(target)).toBe(true)
		const url = new URL(target!, 'http://placeholder.invalid')
		expect(url.searchParams.get('client_id')).toBe('abc')
		expect(url.searchParams.get('prompt')).toBe('consent')
		// The sign-in page's own param never reaches the authorize endpoint.
		expect(url.searchParams.has('redirect')).toBe(false)
	})

	it('falls back to the plain redirect, or nothing', () => {
		expect(resolvePostAuthRedirect({ redirect: '/lists/1' })).toBe('/lists/1')
		expect(resolvePostAuthRedirect({})).toBeUndefined()
	})

	it('a relay stored in redirect (after the two-factor hop) survives a second pass', () => {
		const relay = resolvePostAuthRedirect(AUTHORIZE_QUERY)!
		expect(resolvePostAuthRedirect(passThroughSearch({ redirect: relay }))).toBe(relay)
	})
})
