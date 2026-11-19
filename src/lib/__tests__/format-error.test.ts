import { describe, expect, it } from 'vitest'

import { formatErrorForUser, isNetworkFailure } from '../format-error'

describe('formatErrorForUser', () => {
	it('parses TanStack Start HTTPError JSON in error.message', () => {
		const err = new Error('{"status":500,"unhandled":true,"message":"HTTPError"}')
		const out = formatErrorForUser(err)
		expect(out.status).toBe(500)
		expect(out.title).toMatch(/end/i)
		expect(out.body).not.toContain('HTTPError')
		expect(out.body).not.toContain('"status"')
	})

	it('maps 401 to sign-in copy', () => {
		const out = formatErrorForUser({ status: 401, message: 'Unauthorized' })
		expect(out.status).toBe(401)
		expect(out.title.toLowerCase()).toContain('sign in')
	})

	it('maps 403 to access-denied copy', () => {
		const out = formatErrorForUser({ status: 403 })
		expect(out.title.toLowerCase()).toContain("don't have access")
	})

	it('maps 404 to not-found copy', () => {
		const out = formatErrorForUser({ status: 404 })
		expect(out.title.toLowerCase()).toContain('not found')
	})

	it('uses a server-provided statusMessage when present', () => {
		const err = new Error(JSON.stringify({ status: 400, statusMessage: 'List is archived' }))
		const out = formatErrorForUser(err)
		expect(out.body).toBe('List is archived')
	})

	it('falls back to error.message for plain Errors', () => {
		const out = formatErrorForUser(new Error('boom'))
		expect(out.body).toBe('boom')
	})

	it('handles unknown shapes', () => {
		expect(formatErrorForUser(null).body).toBeTruthy()
		expect(formatErrorForUser(undefined).body).toBeTruthy()
		expect(formatErrorForUser(42).body).toBeTruthy()
	})

	it('does not surface bare "HTTPError" string', () => {
		const out = formatErrorForUser(new Error('HTTPError'))
		expect(out.body).not.toBe('HTTPError')
	})
})

describe('error kind', () => {
	it('marks a failed fetch as a network failure, whatever the browser calls it', () => {
		expect(formatErrorForUser(new TypeError('Failed to fetch')).kind).toBe('network')
		expect(formatErrorForUser(new TypeError('Load failed')).kind).toBe('network')
		expect(formatErrorForUser(new TypeError('NetworkError when attempting to fetch resource.')).kind).toBe('network')
	})

	it('shows catalog text for a failed fetch, not the browser wording', () => {
		const formatted = formatErrorForUser(new TypeError('Load failed'))
		expect(formatted.body).not.toBe('Load failed')
		expect(formatted.body.length).toBeGreaterThan(0)
	})

	it('marks a timeout from the server as a network failure', () => {
		expect(formatErrorForUser({ status: 504 }).kind).toBe('network')
		expect(formatErrorForUser({ status: 408 }).kind).toBe('network')
	})

	it('marks everything else as other', () => {
		expect(formatErrorForUser(new Error('boom')).kind).toBe('other')
		expect(formatErrorForUser(new TypeError('x is not a function')).kind).toBe('other')
		expect(formatErrorForUser({ status: 500 }).kind).toBe('other')
		expect(formatErrorForUser(null).kind).toBe('other')
	})

	it('isNetworkFailure agrees with the kind', () => {
		expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true)
		expect(isNetworkFailure(new Error('Failed to fetch'))).toBe(false)
	})
})
