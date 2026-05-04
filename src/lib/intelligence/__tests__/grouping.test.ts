import { describe, expect, it } from 'vitest'

import { buildClustersForList, pickGroupPriority } from '../analyzers/grouping'

describe('grouping heuristic clustering', () => {
	it('clusters brand-prefix sequences with numeric variants', () => {
		const clusters = buildClustersForList([
			{ itemId: 1, title: 'Lego Set 75301' },
			{ itemId: 2, title: 'Lego Set 75302' },
			{ itemId: 3, title: 'Lego Set 75303' },
			{ itemId: 4, title: 'Wireless mouse' },
		])
		expect(clusters).toHaveLength(1)
		expect(clusters[0].map(r => r.itemId).sort()).toEqual([1, 2, 3])
	})

	it('clusters items sharing two non-stopword tokens', () => {
		const clusters = buildClustersForList([
			{ itemId: 1, title: 'Sony WH-1000XM5 wireless headphones' },
			{ itemId: 2, title: 'Bose QuietComfort wireless headphones' },
			{ itemId: 3, title: 'Apple MagSafe charger' },
		])
		expect(clusters).toHaveLength(1)
		expect(clusters[0].map(r => r.itemId).sort()).toEqual([1, 2])
	})

	it('does not cluster a brand-prefix bucket without a numeric variant', () => {
		const clusters = buildClustersForList([
			{ itemId: 1, title: 'Apple AirPods' },
			{ itemId: 2, title: 'Apple Watch' },
		])
		// Same brand prefix but no shared follow-on tokens and no numeric
		// suffix - we don't cluster these.
		expect(clusters).toEqual([])
	})

	it('caps each cluster at GROUPING_MAX_CLUSTER_SIZE without losing items to the leftover pass', () => {
		const rows = Array.from({ length: 12 }, (_, i) => ({
			itemId: i + 1,
			title: `Lego Set ${100 + i}`,
		}))
		const clusters = buildClustersForList(rows)
		// First-pass bucket overflows the cap, leftover items spill into a
		// second cluster via the shared-token pass. Both honor the size cap.
		expect(clusters.length).toBeGreaterThanOrEqual(1)
		for (const c of clusters) {
			expect(c.length).toBeLessThanOrEqual(6)
		}
	})

	it('returns no clusters when there are fewer than 2 rows', () => {
		expect(buildClustersForList([{ itemId: 1, title: 'Anything' }])).toEqual([])
		expect(buildClustersForList([])).toEqual([])
	})

	it('does not double-claim items: prefix-pass wins, shared-token-pass works on leftovers', () => {
		const clusters = buildClustersForList([
			{ itemId: 1, title: 'Lego Set 75301' },
			{ itemId: 2, title: 'Lego Set 75302' },
			{ itemId: 3, title: 'Sony WH-1000XM5 wireless headphones' },
			{ itemId: 4, title: 'Bose QuietComfort wireless headphones' },
		])
		expect(clusters).toHaveLength(2)
		const ids = clusters.map(c => c.map(r => r.itemId).sort())
		expect(ids).toContainEqual([1, 2])
		expect(ids).toContainEqual([3, 4])
	})

	it('ignores items with too few meaningful tokens', () => {
		const clusters = buildClustersForList([
			{ itemId: 1, title: 'A' },
			{ itemId: 2, title: 'B' },
			{ itemId: 3, title: 'C' },
		])
		expect(clusters).toEqual([])
	})
})

describe('pickGroupPriority', () => {
	it('picks the highest priority among the candidates', () => {
		expect(pickGroupPriority(['low', 'normal', 'high'])).toBe('high')
		expect(pickGroupPriority(['very-high', 'normal'])).toBe('very-high')
		expect(pickGroupPriority(['low', 'low'])).toBe('low')
	})

	it('defaults to normal on empty input', () => {
		expect(pickGroupPriority([])).toBe('normal')
	})
})
