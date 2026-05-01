import { describe, expect, it } from 'vitest'

import { describeDevice, formatDate } from '../passkeys-panel'

describe('describeDevice', () => {
	it('labels multi-device passkeys as synced', () => {
		expect(describeDevice('multiDevice')).toBe('Synced passkey')
	})

	it('labels single-device passkeys as device-bound', () => {
		expect(describeDevice('singleDevice')).toBe('Device-bound passkey')
	})

	it('falls back to a generic label for unknown values', () => {
		expect(describeDevice(null)).toBe('Passkey')
		expect(describeDevice(undefined)).toBe('Passkey')
		expect(describeDevice('something-else')).toBe('Passkey')
	})
})

describe('formatDate', () => {
	it('formats a Date into a Mon DD, YYYY string', () => {
		const out = formatDate(new Date('2026-04-12T19:24:00Z'))
		// `toLocaleDateString` output varies a touch by env; just
		// assert the year and month are present so the test passes
		// across both `Apr 12, 2026` and `April 12, 2026`-style locales.
		expect(out).toMatch(/2026/)
		expect(out.toLowerCase()).toMatch(/apr/)
	})

	it('parses ISO strings the same as Date inputs', () => {
		const out = formatDate('2026-04-12T19:24:00Z')
		expect(out).toMatch(/2026/)
	})

	it('returns an empty string for unparseable input', () => {
		expect(formatDate('not-a-date')).toBe('')
	})
})
