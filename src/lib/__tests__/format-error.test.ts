import { describe, expect, it } from 'vitest'

import { formatErrorForUser } from '../format-error'

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
