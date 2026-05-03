import { describe, expect, it } from 'vitest'

import { fingerprintFor } from '../fingerprint'
import { combineHashes, sha256Hex } from '../hash'

describe('fingerprintFor', () => {
	it('is stable across target order', () => {
		const a = fingerprintFor({ analyzerId: 'stale-items', kind: 'old-items', fingerprintTargets: ['1', '2', '3'] })
		const b = fingerprintFor({ analyzerId: 'stale-items', kind: 'old-items', fingerprintTargets: ['3', '1', '2'] })
		expect(a).toBe(b)
	})

	it('changes when analyzerId changes', () => {
		const a = fingerprintFor({ analyzerId: 'stale-items', kind: 'old-items', fingerprintTargets: ['1'] })
		const b = fingerprintFor({ analyzerId: 'duplicates', kind: 'old-items', fingerprintTargets: ['1'] })
		expect(a).not.toBe(b)
	})

	it('changes when kind changes', () => {
		const a = fingerprintFor({ analyzerId: 'stale-items', kind: 'old-items', fingerprintTargets: ['1'] })
		const b = fingerprintFor({ analyzerId: 'stale-items', kind: 'broken-link', fingerprintTargets: ['1'] })
		expect(a).not.toBe(b)
	})

	it('changes when targets change', () => {
		const a = fingerprintFor({ analyzerId: 'stale-items', kind: 'old-items', fingerprintTargets: ['1', '2'] })
		const b = fingerprintFor({ analyzerId: 'stale-items', kind: 'old-items', fingerprintTargets: ['1', '2', '3'] })
		expect(a).not.toBe(b)
	})

	it('handles empty targets (single rec per user case)', () => {
		const a = fingerprintFor({ analyzerId: 'primary-list', kind: 'no-primary', fingerprintTargets: [] })
		const b = fingerprintFor({ analyzerId: 'primary-list', kind: 'no-primary', fingerprintTargets: [] })
		expect(a).toBe(b)
	})
})

describe('combineHashes', () => {
	it('returns null when no slices contributed', () => {
		expect(combineHashes([null, null])).toBeNull()
		expect(combineHashes([])).toBeNull()
	})

	it('is order-independent', () => {
		const h1 = sha256Hex('a')
		const h2 = sha256Hex('b')
		expect(combineHashes([h1, h2])).toBe(combineHashes([h2, h1]))
	})

	it('returns a deterministic hex hash', () => {
		const a = combineHashes([sha256Hex('x'), sha256Hex('y')])
		expect(a).toMatch(/^[0-9a-f]{64}$/)
	})

	it('changes when any slice changes', () => {
		const a = combineHashes([sha256Hex('x'), sha256Hex('y')])
		const b = combineHashes([sha256Hex('x'), sha256Hex('z')])
		expect(a).not.toBe(b)
	})
})
