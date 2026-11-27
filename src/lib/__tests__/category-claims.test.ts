import { describe, expect, it } from 'vitest'

import type { GroupSummary } from '@/api/lists'
import { makeGift, makeItemWithGifts } from '@/components/items/_stories/fixtures'
import { claimStatsByCategory, isEntryClaimed } from '@/lib/category-claims'
import { buildListEntries } from '@/lib/list-entries'

const CLOTHES = 1
const TOYS = 2
const known = new Set([CLOTHES, TOYS])

function group(overrides: Partial<GroupSummary> & { id: number }): GroupSummary {
	return { type: 'or', name: null, priority: 'normal', sortOrder: null, categoryId: null, ...overrides }
}

describe('isEntryClaimed', () => {
	it('counts an item only once every unit it asks for is claimed', () => {
		const open = makeItemWithGifts({ quantity: 2, gifts: [makeGift({ quantity: 1 })] })
		const full = makeItemWithGifts({ quantity: 2, gifts: [makeGift({ quantity: 1 }), makeGift({ quantity: 1 })] })
		const [openEntry] = buildListEntries({ items: [open], groups: [] })
		const [fullEntry] = buildListEntries({ items: [full], groups: [] })
		expect(isEntryClaimed(openEntry)).toBe(false)
		expect(isEntryClaimed(fullEntry)).toBe(true)
	})

	it('counts a pick-one group as soon as any member has a claim', () => {
		const a = makeItemWithGifts({ groupId: 10, groupSortOrder: 0 })
		const b = makeItemWithGifts({ groupId: 10, groupSortOrder: 1, gifts: [makeGift()] })
		const untouched = buildListEntries({ items: [a], groups: [group({ id: 10 })] })
		const picked = buildListEntries({ items: [a, b], groups: [group({ id: 10 })] })
		expect(isEntryClaimed(untouched[0])).toBe(false)
		expect(isEntryClaimed(picked[0])).toBe(true)
	})

	it('counts an in-order group only once every member is fully claimed', () => {
		const first = makeItemWithGifts({ groupId: 11, groupSortOrder: 0, gifts: [makeGift()] })
		const second = makeItemWithGifts({ groupId: 11, groupSortOrder: 1 })
		const partly = buildListEntries({ items: [first, second], groups: [group({ id: 11, type: 'order' })] })
		expect(isEntryClaimed(partly[0])).toBe(false)
		const done = buildListEntries({
			items: [first, { ...second, gifts: [makeGift()] }],
			groups: [group({ id: 11, type: 'order' })],
		})
		expect(isEntryClaimed(done[0])).toBe(true)
	})
})

describe('claimStatsByCategory', () => {
	it('counts a group once, under the group category, and files unknown ids under none', () => {
		const entries = buildListEntries({
			items: [
				makeItemWithGifts({ categoryId: CLOTHES, gifts: [makeGift()] }),
				makeItemWithGifts({ categoryId: CLOTHES }),
				// Grouped: the group's category applies, not the members' own.
				makeItemWithGifts({ groupId: 10, groupSortOrder: 0, categoryId: CLOTHES, gifts: [makeGift()] }),
				makeItemWithGifts({ groupId: 10, groupSortOrder: 1, categoryId: CLOTHES }),
				makeItemWithGifts({ categoryId: null }),
				// A category the viewer was not sent reads as no category.
				makeItemWithGifts({ categoryId: 999 }),
			],
			groups: [group({ id: 10, categoryId: TOYS })],
		})
		const stats = claimStatsByCategory(entries, known)
		expect(stats.get(CLOTHES)).toEqual({ total: 2, claimed: 1 })
		expect(stats.get(TOYS)).toEqual({ total: 1, claimed: 1 })
		expect(stats.get('none')).toEqual({ total: 2, claimed: 0 })
	})
})
