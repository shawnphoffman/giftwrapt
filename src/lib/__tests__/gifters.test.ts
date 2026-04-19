import { describe, expect, it } from 'vitest'

import { displayName, formatGifterNames, namesForGifter, type PartneredUser } from '../gifters'

describe('formatGifterNames', () => {
	it('returns an empty string with no names', () => {
		expect(formatGifterNames([])).toBe('')
	})

	it('renders a single name as-is', () => {
		expect(formatGifterNames(['Alice'])).toBe('Alice')
	})

	it('joins two names with an ampersand', () => {
		expect(formatGifterNames(['Alice', 'Bob'])).toBe('Alice & Bob')
	})

	it('uses commas with a trailing ampersand for 3+ names', () => {
		expect(formatGifterNames(['Alice', 'Bob', 'Carol'])).toBe('Alice, Bob & Carol')
	})

	it('dedupes while preserving first-seen order', () => {
		// Common case: the primary gifter also shows up in additionalGifterIds.
		expect(formatGifterNames(['Alice', 'Bob', 'Alice'])).toBe('Alice & Bob')
	})

	it('ignores empty and whitespace-only entries', () => {
		expect(formatGifterNames(['Alice', '', '   ', 'Bob'])).toBe('Alice & Bob')
	})

	it('trims surrounding whitespace before comparing', () => {
		expect(formatGifterNames(['Alice', '  Alice  '])).toBe('Alice')
	})
})

describe('displayName', () => {
	it('prefers the user name', () => {
		expect(displayName({ name: 'Alice', email: 'alice@example.com' })).toBe('Alice')
	})

	it('falls back to email when name is null', () => {
		expect(displayName({ name: null, email: 'alice@example.com' })).toBe('alice@example.com')
	})

	it('falls back to email when name is empty', () => {
		expect(displayName({ name: '', email: 'alice@example.com' })).toBe('alice@example.com')
	})
})

describe('namesForGifter', () => {
	function buildLookup(users: Array<PartneredUser>): Map<string, PartneredUser> {
		const map = new Map<string, PartneredUser>()
		for (const u of users) map.set(u.id!, u)
		return map
	}

	it('returns an empty array when the id is unknown', () => {
		expect(namesForGifter('missing', new Map())).toEqual([])
	})

	it('returns only the gifter when they have no partner', () => {
		const lookup = buildLookup([{ id: 'u1', name: 'Alice', email: 'a@example.com', partnerId: null }])
		expect(namesForGifter('u1', lookup)).toEqual(['Alice'])
	})

	it('expands to [gifter, partner] when the partner is resolvable', () => {
		const lookup = buildLookup([
			{ id: 'u1', name: 'Alice', email: 'a@example.com', partnerId: 'u2' },
			{ id: 'u2', name: 'Bob', email: 'b@example.com', partnerId: 'u1' },
		])
		expect(namesForGifter('u1', lookup)).toEqual(['Alice', 'Bob'])
	})

	it('omits the partner silently when they are missing from the lookup', () => {
		// Data drift is possible (partner deleted etc). Falling back to just the
		// primary keeps the email renderable without a hard failure.
		const lookup = buildLookup([{ id: 'u1', name: 'Alice', email: 'a@example.com', partnerId: 'u2' }])
		expect(namesForGifter('u1', lookup)).toEqual(['Alice'])
	})

	it('uses email fallback for unnamed users', () => {
		const lookup = buildLookup([
			{ id: 'u1', name: null, email: 'alice@example.com', partnerId: 'u2' },
			{ id: 'u2', name: null, email: 'bob@example.com', partnerId: 'u1' },
		])
		expect(namesForGifter('u1', lookup)).toEqual(['alice@example.com', 'bob@example.com'])
	})
})
