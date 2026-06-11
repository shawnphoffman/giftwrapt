import { describe, expect, it } from 'vitest'

import { buildGifterUnits, type GifterUserMeta } from '../gifter-units'

function user(id: string, name: string, partnerId: string | null = null): GifterUserMeta {
	return { id, name, email: `${id}@example.com`, partnerId, image: null }
}

function lookupOf(...users: Array<GifterUserMeta>): Map<string, GifterUserMeta> {
	return new Map(users.map(u => [u.id!, u]))
}

describe('buildGifterUnits', () => {
	it('renders a solo gifter as a unit of one', () => {
		const units = buildGifterUnits('a', null, null, lookupOf(user('a', 'Alice')))
		expect(units).toEqual([{ key: 'solo:a', label: 'Alice', members: [{ id: 'a', name: 'Alice', image: null }] }])
	})

	it('pairs a gifter with their partner into one unit', () => {
		const units = buildGifterUnits('a', null, null, lookupOf(user('a', 'Alice', 'b'), user('b', 'Bob', 'a')))
		expect(units).toHaveLength(1)
		expect(units[0].key).toBe('pair:a:b')
		expect(units[0].label).toBe('Alice & Bob')
		expect(units[0].members.map(m => m.id)).toEqual(['a', 'b'])
	})

	it('excludes the recipient from a gifter unit (buying for your partner shows you solo)', () => {
		// Alice (partnered to Bob) gifts Bob. Bob is the recipient, so Alice shows solo.
		const units = buildGifterUnits('a', null, 'b', lookupOf(user('a', 'Alice', 'b'), user('b', 'Bob', 'a')))
		expect(units).toEqual([{ key: 'solo:a', label: 'Alice', members: [{ id: 'a', name: 'Alice', image: null }] }])
	})

	it('excludes the recipient via the symmetric partner check (only the recipient names the link)', () => {
		// Alice has no partnerId set, but Bob (the recipient) names Alice as his partner.
		const units = buildGifterUnits('a', null, 'b', lookupOf(user('a', 'Alice', null), user('b', 'Bob', 'a')))
		expect(units).toEqual([{ key: 'solo:a', label: 'Alice', members: [{ id: 'a', name: 'Alice', image: null }] }])
	})

	it('collapses two co-gifters from the same household into one unit', () => {
		const units = buildGifterUnits('p', ['a', 'b'], null, lookupOf(user('p', 'Pat'), user('a', 'Alice', 'b'), user('b', 'Bob', 'a')))
		expect(units.map(u => u.key).sort()).toEqual(['pair:a:b', 'solo:p'])
	})

	it('keeps unrelated co-gifters as separate units', () => {
		const units = buildGifterUnits('p', ['a'], null, lookupOf(user('p', 'Pat'), user('a', 'Alice')))
		expect(units.map(u => u.key)).toEqual(['solo:p', 'solo:a'])
	})

	it('skips gifter ids missing from the lookup', () => {
		const units = buildGifterUnits('p', ['missing'], null, lookupOf(user('p', 'Pat')))
		expect(units).toEqual([{ key: 'solo:p', label: 'Pat', members: [{ id: 'p', name: 'Pat', image: null }] }])
	})

	it('falls back to solo when the partner is not in the lookup', () => {
		const units = buildGifterUnits('a', null, null, lookupOf(user('a', 'Alice', 'b')))
		expect(units).toEqual([{ key: 'solo:a', label: 'Alice', members: [{ id: 'a', name: 'Alice', image: null }] }])
	})
})
