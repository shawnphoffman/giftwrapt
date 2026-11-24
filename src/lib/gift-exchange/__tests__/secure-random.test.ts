import { describe, expect, it } from 'vitest'

import { secureRandomInt } from '../secure-random'

// A fill that hands out the given 32-bit values in order.
function scripted(values: Array<number>) {
	const queue = [...values]
	let calls = 0
	const fill = (array: Uint32Array) => {
		calls += 1
		const next = queue.shift()
		if (next === undefined) throw new Error('scripted fill ran out of values')
		array[0] = next
	}
	return { fill, calls: () => calls }
}

describe('secureRandomInt', () => {
	it('stays in [0, max) with the real Web Crypto source', () => {
		for (const max of [1, 2, 3, 7, 10, 1000, 2 ** 31 + 1]) {
			for (let i = 0; i < 200; i++) {
				const n = secureRandomInt(max)
				expect(Number.isInteger(n)).toBe(true)
				expect(n).toBeGreaterThanOrEqual(0)
				expect(n).toBeLessThan(max)
			}
		}
	})

	it('returns 0 for a max of 1 without drawing', () => {
		const source = scripted([])
		expect(secureRandomInt(1, source.fill)).toBe(0)
		expect(source.calls()).toBe(0)
	})

	it('rejects values in the uneven tail and draws again', () => {
		// 2^32 = 3 * 1431655765 + 1, so the single value 2^32 - 1 would make 0
		// slightly more likely than 1 and 2. It must be thrown away.
		const source = scripted([2 ** 32 - 1, 2 ** 32 - 1, 5])
		expect(secureRandomInt(3, source.fill)).toBe(5 % 3)
		expect(source.calls()).toBe(3)
	})

	it('accepts the largest value below the limit', () => {
		const limit = 2 ** 32 - (2 ** 32 % 3)
		const source = scripted([limit - 1])
		expect(secureRandomInt(3, source.fill)).toBe((limit - 1) % 3)
		expect(source.calls()).toBe(1)
	})

	it('maps every accepted value to each result equally often', () => {
		// Over one full block of accepted values (0 to 5 for max 3) each result
		// appears exactly twice.
		const source = scripted([0, 1, 2, 3, 4, 5])
		const counts = [0, 0, 0]
		for (let i = 0; i < 6; i++) counts[secureRandomInt(3, source.fill)] += 1
		expect(counts).toEqual([2, 2, 2])
	})

	it('spreads real draws roughly evenly', () => {
		const counts = new Array(6).fill(0)
		const draws = 60_000
		for (let i = 0; i < draws; i++) counts[secureRandomInt(6)] += 1
		// Expected 10,000 each; 5 standard deviations is about 456.
		for (const c of counts) expect(Math.abs(c - draws / 6)).toBeLessThan(600)
	})

	it('refuses a max that is not a positive integer up to 2^32', () => {
		for (const bad of [0, -1, 1.5, Number.NaN, 2 ** 32 + 1]) {
			expect(() => secureRandomInt(bad)).toThrow(RangeError)
		}
	})
})
