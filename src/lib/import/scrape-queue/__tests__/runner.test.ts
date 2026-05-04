import { describe, expect, it } from 'vitest'

import { backoffSecondsForAttempts } from '../runner'

describe('backoffSecondsForAttempts', () => {
	it('uses 60s base and doubles per attempt', () => {
		expect(backoffSecondsForAttempts(1)).toBe(60)
		expect(backoffSecondsForAttempts(2)).toBe(120)
		expect(backoffSecondsForAttempts(3)).toBe(240)
		expect(backoffSecondsForAttempts(4)).toBe(480)
	})

	it('caps at one hour (3600s)', () => {
		expect(backoffSecondsForAttempts(7)).toBe(3600)
		expect(backoffSecondsForAttempts(20)).toBe(3600)
	})

	it('clamps zero/negative attempts to the base delay', () => {
		expect(backoffSecondsForAttempts(0)).toBe(60)
		expect(backoffSecondsForAttempts(-3)).toBe(60)
	})
})
