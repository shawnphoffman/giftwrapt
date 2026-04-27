import { describe, expect, it } from 'vitest'

import { parseCustomHeaders } from '../parse-headers'

describe('parseCustomHeaders', () => {
	it('returns an empty object for empty / null / undefined input', () => {
		expect(parseCustomHeaders(undefined)).toEqual({})
		expect(parseCustomHeaders(null)).toEqual({})
		expect(parseCustomHeaders('')).toEqual({})
		expect(parseCustomHeaders('   \n  \n')).toEqual({})
	})

	it('parses a single Header-Name: value line', () => {
		expect(parseCustomHeaders('X-Token: abc123')).toEqual({ 'x-token': 'abc123' })
	})

	it('parses multiple lines and lowercases header names', () => {
		const out = parseCustomHeaders(['X-Token: abc123', 'Authorization: Bearer xyz', 'User-Agent: my-scraper/1.0'].join('\n'))
		expect(out).toEqual({
			'x-token': 'abc123',
			authorization: 'Bearer xyz',
			'user-agent': 'my-scraper/1.0',
		})
	})

	it('preserves the value verbatim except for surrounding whitespace', () => {
		expect(parseCustomHeaders('Authorization:    Bearer abc 123  ')).toEqual({ authorization: 'Bearer abc 123' })
	})

	it('keeps colons inside the value (only splits on the first one)', () => {
		expect(parseCustomHeaders('X-When: 2026-04-26T10:38:00Z')).toEqual({ 'x-when': '2026-04-26T10:38:00Z' })
	})

	it('handles CRLF line endings', () => {
		expect(parseCustomHeaders('A: 1\r\nB: 2\r\n')).toEqual({ a: '1', b: '2' })
	})

	it('skips blank lines and `#` comments', () => {
		const input = `
			# This is a comment
			X-One: foo

			# another comment
			X-Two: bar
		`
		expect(parseCustomHeaders(input)).toEqual({ 'x-one': 'foo', 'x-two': 'bar' })
	})

	it('skips lines without a colon', () => {
		expect(parseCustomHeaders('valid: yes\nnotaheaderline\nalso-valid: y')).toEqual({ valid: 'yes', 'also-valid': 'y' })
	})

	it('skips lines with empty name or empty value', () => {
		expect(parseCustomHeaders(': novalue\nX-Name: \nGood: ok')).toEqual({ good: 'ok' })
	})

	it('last duplicate header wins', () => {
		// Headers names are case-insensitive in HTTP, so two entries with the
		// same name (any case) collapse to the most recently seen value.
		expect(parseCustomHeaders('X-Same: first\nx-same: second')).toEqual({ 'x-same': 'second' })
	})
})
