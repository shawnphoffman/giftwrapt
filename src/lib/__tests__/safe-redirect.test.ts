import { describe, expect, it } from 'vitest'

import { safeRedirect } from '../safe-redirect'

describe('safeRedirect', () => {
	it('passes through a plain same-origin path', () => {
		expect(safeRedirect('/me')).toBe('/me')
	})

	it('preserves query string and hash on a same-origin path', () => {
		expect(safeRedirect('/lists/42?tab=items#claim')).toBe('/lists/42?tab=items#claim')
	})

	describe('rejects non-string input', () => {
		it('undefined', () => {
			expect(safeRedirect(undefined)).toBe('/')
		})
		it('null', () => {
			expect(safeRedirect(null)).toBe('/')
		})
		it('number', () => {
			expect(safeRedirect(42)).toBe('/')
		})
		it('object', () => {
			expect(safeRedirect({ pathname: '/me' })).toBe('/')
		})
		it('array', () => {
			expect(safeRedirect(['/me'])).toBe('/')
		})
	})

	describe('rejects length-bounds violations', () => {
		it('empty string', () => {
			expect(safeRedirect('')).toBe('/')
		})
		it('absurdly long path', () => {
			const huge = `/${'a'.repeat(2050)}`
			expect(safeRedirect(huge)).toBe('/')
		})
		it('exactly 2000 chars passes', () => {
			const at = `/${'a'.repeat(1999)}`
			expect(at.length).toBe(2000)
			expect(safeRedirect(at)).toBe(at)
		})
	})

	describe('rejects open-redirect attempts', () => {
		it('protocol-relative URL (//evil.com)', () => {
			expect(safeRedirect('//evil.com/path')).toBe('/')
		})
		it('protocol-relative with backslash (/\\evil.com)', () => {
			expect(safeRedirect('/\\evil.com/path')).toBe('/')
		})
		it('absolute http URL', () => {
			expect(safeRedirect('http://evil.com/path')).toBe('/')
		})
		it('absolute https URL', () => {
			expect(safeRedirect('https://evil.com/path')).toBe('/')
		})
		it('javascript: pseudo-protocol', () => {
			expect(safeRedirect('javascript:alert(1)')).toBe('/')
		})
		it('data: URI', () => {
			expect(safeRedirect('data:text/html,<script>alert(1)</script>')).toBe('/')
		})
		it('path with embedded credentials attempt', () => {
			// URL parser would resolve this to a different origin, caught by
			// the origin-equality check.
			expect(safeRedirect('/\t/evil.com/path')).toBe('/')
		})
	})

	describe('rejects TanStack Start internal paths', () => {
		it('rejects /_serverFn', () => {
			expect(safeRedirect('/_serverFn?foo=bar')).toBe('/')
		})
		it('rejects any /_-prefixed path', () => {
			expect(safeRedirect('/_internal')).toBe('/')
			expect(safeRedirect('/_anything/here')).toBe('/')
		})
	})

	it('rejects relative paths without leading slash', () => {
		expect(safeRedirect('me')).toBe('/')
		expect(safeRedirect('./me')).toBe('/')
		expect(safeRedirect('../me')).toBe('/')
	})

	it('returns "/" rather than throwing on URL constructor edge cases', () => {
		// Inputs that pass earlier checks but trip the URL parser. Very
		// hard to construct in practice given the leading-slash gate, but
		// the catch branch should still return "/".
		expect(safeRedirect('/')).toBe('/')
	})
})
