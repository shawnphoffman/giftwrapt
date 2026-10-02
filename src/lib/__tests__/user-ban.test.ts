import { describe, expect, it } from 'vitest'

import { isUserBanned } from '../user-ban'

const now = new Date('2026-10-02T12:00:00Z')

describe('isUserBanned', () => {
	it('is false for an account that was never banned', () => {
		expect(isUserBanned({ banned: false, banExpires: null }, now)).toBe(false)
		expect(isUserBanned({ banned: null, banExpires: null }, now)).toBe(false)
	})

	it('is true for a ban with no expiry', () => {
		expect(isUserBanned({ banned: true, banExpires: null }, now)).toBe(true)
	})

	it('is true while a timed ban is still running', () => {
		expect(isUserBanned({ banned: true, banExpires: new Date('2026-10-03T00:00:00Z') }, now)).toBe(true)
	})

	it('is false once a timed ban has expired', () => {
		expect(isUserBanned({ banned: true, banExpires: new Date('2026-10-01T00:00:00Z') }, now)).toBe(false)
	})
})
