import { describe, expect, it } from 'vitest'

import {
	type AllowedRelation,
	buildAllowedRelation,
	checkDraw,
	checkMatching,
	drawAssignments,
	findLoops,
	findRepeats,
	findSwaps,
	type MemberPair,
	type RandomInt,
	willRepeat,
} from '../draw'

// mulberry32: small, seeded, good enough to make every test repeatable.
function seeded(seed: number): RandomInt {
	let a = seed >>> 0
	return max => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296
		return Math.floor(r * max)
	}
}

const people = (n: number) => Array.from({ length: n }, (_, i) => `m${String(i).padStart(2, '0')}`)

// Relation from an explicit list of who each giver can gift to.
function only(map: Record<string, Array<string>>): AllowedRelation {
	return new Map(Object.entries(map).map(([g, rs]) => [g, new Set(rs)]))
}

function expectValidDraw(memberIds: Array<string>, allowed: AllowedRelation, assignments: Map<string, string>) {
	expect([...assignments.keys()].sort()).toEqual([...memberIds].sort())
	expect([...assignments.values()].sort()).toEqual([...memberIds].sort())
	for (const [giver, recipient] of assignments) {
		expect(giver).not.toBe(recipient)
		expect(allowed.get(giver)?.has(recipient), `${giver} -> ${recipient}`).toBe(true)
	}
}

describe('checkDraw', () => {
	it('refuses two people and accepts three', () => {
		expect(checkDraw(people(2), buildAllowedRelation(people(2)))).toEqual({
			ok: false,
			reason: 'too-few-members',
			memberCount: 2,
			minimum: 3,
		})
		expect(checkDraw(people(3), buildAllowedRelation(people(3)))).toEqual({ ok: true })
	})

	it('names who has nobody to gift to and who nobody can gift to, before any group', () => {
		const ids = ['a', 'b', 'c', 'd']
		const allowed = only({ a: ['b', 'c'], b: ['a', 'c'], c: ['a', 'b'], d: [] })
		expect(checkDraw(ids, allowed)).toEqual({ ok: false, reason: 'no-options', nobodyToGiftTo: ['d'], nobodyCanGiftTo: ['d'] })
	})

	it('ignores self and members outside the set in the relation', () => {
		const allowed = only({ a: ['a', 'zz'], b: ['a', 'c'], c: ['a', 'b'] })
		expect(checkMatching(['a', 'b', 'c'], allowed)).toEqual({ ok: false, reason: 'no-options', nobodyToGiftTo: ['a'], nobodyCanGiftTo: [] })
	})

	it('reports a stuck group of givers ("X, Y and Z can only gift to A and B")', () => {
		// Ruth, Dana and Omar can only gift to Nora and Ben. Nora and Ben can
		// gift to anyone, but someone has to gift to each of them too.
		const ids = ['nora', 'ben', 'ruth', 'dana', 'omar']
		const allowed = only({
			nora: ['ben', 'ruth', 'dana', 'omar'],
			ben: ['nora', 'ruth', 'dana', 'omar'],
			ruth: ['nora', 'ben'],
			dana: ['nora', 'ben'],
			omar: ['nora', 'ben'],
		})
		expect(checkDraw(ids, allowed)).toEqual({
			ok: false,
			reason: 'stuck-group',
			group: { side: 'givers', givers: ['ruth', 'dana', 'omar'], recipients: ['nora', 'ben'] },
		})
	})

	it('reports a stuck group of recipients when that side is shorter ("Only A can gift to X and Y")', () => {
		// Only Ann can gift to Cal and Dee. On the giver side the smallest
		// stuck group has three people (Bea, Cal, Dee can only gift to Ann and
		// Bea), so the recipient side reads shorter.
		const ids = ['ann', 'bea', 'cal', 'dee']
		const allowed = only({ ann: ['bea', 'cal', 'dee'], bea: ['ann'], cal: ['ann', 'bea'], dee: ['ann', 'bea'] })
		expect(checkDraw(ids, allowed)).toEqual({
			ok: false,
			reason: 'stuck-group',
			group: { side: 'recipients', recipients: ['cal', 'dee'], givers: ['ann'] },
		})
	})
})

describe('drawAssignments', () => {
	it('refuses two people', () => {
		const result = drawAssignments(people(2), buildAllowedRelation(people(2)), { randomInt: seeded(1) })
		expect(result).toMatchObject({ ok: false, reason: 'too-few-members' })
	})

	it.each([3, 30])('draws a single loop through %i people when everyone can gift to everyone', n => {
		const ids = people(n)
		const allowed = buildAllowedRelation(ids)
		const result = drawAssignments(ids, allowed, { randomInt: seeded(n) })
		if (!result.ok) throw new Error(result.reason)
		expect(result.level).toBe('single-loop')
		expectValidDraw(ids, allowed, result.assignments)
		expect(findLoops(result.assignments)).toHaveLength(1)
	})

	it('finds a single loop when one exists among tight rules', () => {
		// The only loop is a -> b -> c -> d -> e -> a; every other edge leads
		// to a dead end or a smaller loop.
		const ids = ['a', 'b', 'c', 'd', 'e']
		const allowed = only({ a: ['b', 'c'], b: ['c', 'a'], c: ['d', 'a'], d: ['e', 'c'], e: ['a', 'd'] })
		for (let seed = 1; seed <= 25; seed++) {
			const result = drawAssignments(ids, allowed, { randomInt: seeded(seed) })
			if (!result.ok) throw new Error(result.reason)
			expect(result.level).toBe('single-loop')
			expect(Object.fromEntries(result.assignments)).toEqual({ a: 'b', b: 'c', c: 'd', d: 'e', e: 'a' })
		}
	})

	it('draws loops with no swaps when a single loop is impossible', () => {
		// Two households of three who may only gift inside their own household.
		const ids = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3']
		const across: Array<MemberPair> = []
		for (const g of ids) for (const r of ids) if (g[0] !== r[0]) across.push({ giverMemberId: g, recipientMemberId: r })
		const allowed = buildAllowedRelation(ids, across)
		for (let seed = 1; seed <= 25; seed++) {
			const result = drawAssignments(ids, allowed, { randomInt: seeded(seed) })
			if (!result.ok) throw new Error(result.reason)
			expect(result.level).toBe('no-swaps')
			expectValidDraw(ids, allowed, result.assignments)
			expect(findSwaps(result.assignments)).toEqual([])
			expect(findLoops(result.assignments)).toHaveLength(2)
		}
	})

	it('uses a swap only when nothing else is possible', () => {
		// Ann and Bea may only gift to each other, as may Cal and Dee.
		const ids = ['ann', 'bea', 'cal', 'dee']
		const allowed = only({ ann: ['bea'], bea: ['ann'], cal: ['dee'], dee: ['cal'] })
		const result = drawAssignments(ids, allowed, { randomInt: seeded(7) })
		if (!result.ok) throw new Error(result.reason)
		expect(result.level).toBe('any')
		expect(findSwaps(result.assignments)).toEqual([
			['ann', 'bea'],
			['cal', 'dee'],
		])
	})

	it('never uses a swap when a draw without one exists', () => {
		const ids = people(4)
		const allowed = buildAllowedRelation(ids)
		for (let seed = 1; seed <= 100; seed++) {
			const result = drawAssignments(ids, allowed, { randomInt: seeded(seed) })
			if (!result.ok) throw new Error(result.reason)
			expect(findSwaps(result.assignments)).toEqual([])
		}
	})

	it('never assigns a blocked or locked pair', () => {
		const ids = people(9)
		for (let seed = 1; seed <= 60; seed++) {
			const random = seeded(seed * 31)
			// Drop roughly half of all pairs at random.
			const disallowed: Array<MemberPair> = []
			for (const g of ids) for (const r of ids) if (g !== r && random(2) === 0) disallowed.push({ giverMemberId: g, recipientMemberId: r })
			const allowed = buildAllowedRelation(ids, disallowed)
			const check = checkDraw(ids, allowed)
			const result = drawAssignments(ids, allowed, { randomInt: seeded(seed) })
			expect(result.ok).toBe(check.ok)
			if (result.ok) expectValidDraw(ids, allowed, result.assignments)
		}
	})

	it('falls back to the next level when a step budget runs out', () => {
		const ids = people(6)
		const allowed = buildAllowedRelation(ids)
		const result = drawAssignments(ids, allowed, { randomInt: seeded(3), loopStepBudget: 0, noSwapStepBudget: 0 })
		if (!result.ok) throw new Error(result.reason)
		expect(result.level).toBe('any')
		expectValidDraw(ids, allowed, result.assignments)
	})

	it('is repeatable for the same seed and varies across seeds', () => {
		const ids = people(8)
		const allowed = buildAllowedRelation(ids)
		const draw = (seed: number) => {
			const result = drawAssignments(ids, allowed, { randomInt: seeded(seed) })
			if (!result.ok) throw new Error(result.reason)
			return Object.fromEntries(result.assignments)
		}
		expect(draw(42)).toEqual(draw(42))
		const distinct = new Set(Array.from({ length: 10 }, (_, i) => JSON.stringify(draw(i + 1))))
		expect(distinct.size).toBeGreaterThan(1)
	})

	it('returns the stuck group instead of a draw when none is possible', () => {
		const ids = ['ann', 'bea', 'cal', 'dee']
		const allowed = only({ ann: ['bea', 'cal', 'dee'], bea: ['ann'], cal: ['ann', 'bea'], dee: ['ann', 'bea'] })
		expect(drawAssignments(ids, allowed, { randomInt: seeded(1) })).toMatchObject({ ok: false, reason: 'stuck-group' })
	})
})

// Avoiding the pairs of an earlier exchange (plan 40).
describe('drawAssignments with pairs to avoid', () => {
	const pairs = (list: Array<[string, string]>): Array<MemberPair> =>
		list.map(([giverMemberId, recipientMemberId]) => ({ giverMemberId, recipientMemberId }))
	const draw = (ids: Array<string>, allowed: AllowedRelation, avoid: Array<MemberPair>, seed: number) => {
		const result = drawAssignments(ids, allowed, { randomInt: seeded(seed), avoid })
		if (!result.ok) throw new Error(result.reason)
		expectValidDraw(ids, allowed, result.assignments)
		return result
	}

	// Two families of three. Inside a family anyone can gift to anyone; the
	// only ways across are c -> d and f -> a, so every loop through all six
	// uses both.
	const TWO_FAMILIES = only({
		a: ['b', 'c'],
		b: ['a', 'c'],
		c: ['a', 'b', 'd'],
		d: ['e', 'f'],
		e: ['d', 'f'],
		f: ['d', 'e', 'a'],
	})
	const SIX = ['a', 'b', 'c', 'd', 'e', 'f']

	// The only draws: the loop a -> b -> c -> d -> a, or the swaps a/b and c/d.
	const LOOP_OR_SWAPS = only({ a: ['b'], b: ['c', 'a'], c: ['d'], d: ['a', 'c'] })
	const FOUR = ['a', 'b', 'c', 'd']

	// a and b can only have each other, so every draw has that swap; c, d and
	// e go round one way or the other.
	const ALWAYS_A_SWAP = only({ a: ['b'], b: ['a'], c: ['d', 'e'], d: ['c', 'e'], e: ['c', 'd'] })
	const FIVE = ['a', 'b', 'c', 'd', 'e']

	it('never repeats a pair across 200 draws when a draw with no repeats and no swaps exists', () => {
		const ids = people(6)
		const allowed = buildAllowedRelation(ids)
		// Last time was one loop through everyone, in order.
		const avoid = pairs(ids.map((id, i) => [id, ids[(i + 1) % ids.length]]))
		for (let seed = 1; seed <= 200; seed++) {
			const result = draw(ids, allowed, avoid, seed)
			expect(findRepeats(result.assignments, avoid), `seed ${seed}`).toEqual([])
			expect(findSwaps(result.assignments), `seed ${seed}`).toEqual([])
			expect(result.level).toBe('single-loop')
		}
		expect(willRepeat(ids, allowed, avoid)).toBe(false)
	})

	it('still draws when a repeat cannot be avoided', () => {
		const ids = ['a', 'b', 'c']
		const allowed = only({ a: ['b'], b: ['c'], c: ['a'] })
		const avoid = pairs([['a', 'b']])
		const result = draw(ids, allowed, avoid, 1)
		expect(findRepeats(result.assignments, avoid)).toEqual(avoid)
		expect(willRepeat(ids, allowed, avoid)).toBe(true)
	})

	it('gives up the single loop to avoid a repeat', () => {
		const avoid = pairs([['c', 'd']])
		for (let seed = 1; seed <= 50; seed++) {
			const result = draw(SIX, TWO_FAMILIES, avoid, seed)
			expect(result.level, `seed ${seed}`).toBe('no-swaps')
			expect(findRepeats(result.assignments, avoid)).toEqual([])
			expect(findSwaps(result.assignments)).toEqual([])
		}
		expect(willRepeat(SIX, TWO_FAMILIES, avoid)).toBe(false)
		// With nothing to avoid the same rules give the loop.
		expect(draw(SIX, TWO_FAMILIES, [], 1).level).toBe('single-loop')
	})

	it('never accepts a swap to avoid a repeat when a draw without swaps exists', () => {
		const avoid = pairs([['b', 'c']])
		for (let seed = 1; seed <= 50; seed++) {
			const result = draw(FOUR, LOOP_OR_SWAPS, avoid, seed)
			expect(findSwaps(result.assignments), `seed ${seed}`).toEqual([])
			expect(findRepeats(result.assignments, avoid)).toEqual(avoid)
		}
		expect(willRepeat(FOUR, LOOP_OR_SWAPS, avoid)).toBe(true)
	})

	it('avoids a repeat among draws that all have a swap', () => {
		const avoid = pairs([
			['c', 'd'],
			['d', 'e'],
			['e', 'c'],
		])
		for (let seed = 1; seed <= 50; seed++) {
			const result = draw(FIVE, ALWAYS_A_SWAP, avoid, seed)
			expect(result.level).toBe('any')
			expect(findRepeats(result.assignments, avoid), `seed ${seed}`).toEqual([])
		}
		expect(willRepeat(FIVE, ALWAYS_A_SWAP, avoid)).toBe(false)
	})

	it('counts a pair in the direction it was drawn only', () => {
		const ids = ['a', 'b', 'c']
		const allowed = buildAllowedRelation(ids)
		// a had b last time. The other loop has b gifting to a, which is fine.
		const avoid = pairs([['a', 'b']])
		for (let seed = 1; seed <= 30; seed++) {
			const result = draw(ids, allowed, avoid, seed)
			expect(Object.fromEntries(result.assignments), `seed ${seed}`).toEqual({ a: 'c', c: 'b', b: 'a' })
		}
	})

	it('draws exactly as before when nothing in the list applies', () => {
		const ids = people(8)
		const allowed = buildAllowedRelation(ids, [{ giverMemberId: 'm00', recipientMemberId: 'm01' }])
		const plain = (seed: number) => {
			const result = drawAssignments(ids, allowed, { randomInt: seeded(seed) })
			if (!result.ok) throw new Error(result.reason)
			return Object.fromEntries(result.assignments)
		}
		// Someone who isn't in this exchange, a pair the rules already forbid, and a self pair.
		const stray = pairs([
			['zz', 'm00'],
			['m00', 'zz'],
			['m00', 'm01'],
			['m02', 'm02'],
		])
		for (const seed of [1, 7, 42]) {
			expect(Object.fromEntries(draw(ids, allowed, [], seed).assignments)).toEqual(plain(seed))
			expect(Object.fromEntries(draw(ids, allowed, stray, seed).assignments)).toEqual(plain(seed))
		}
		expect(willRepeat(ids, allowed, stray)).toBe(false)
	})

	it('says no repeat is coming when names cannot be drawn at all', () => {
		const ids = ['ann', 'bea', 'cal', 'dee']
		const allowed = only({ ann: ['bea', 'cal', 'dee'], bea: ['ann'], cal: ['ann', 'bea'], dee: ['ann', 'bea'] })
		expect(willRepeat(ids, allowed, pairs([['bea', 'ann']]))).toBe(false)
	})
})
