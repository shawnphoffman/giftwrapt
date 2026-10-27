import { describe, expect, it } from 'vitest'

import type { GroupSummary } from '@/api/lists'
import type { Priority } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'
import { buildListEntries } from '@/lib/list-entries'

function item(id: number, priority: Priority, sortOrder: number | null, groupId: number | null = null): Item {
	return { id, priority, sortOrder, groupId, groupSortOrder: null } as Item
}

function group(id: number, priority: Priority, sortOrder: number | null): GroupSummary {
	return { id, type: 'or', name: null, priority, sortOrder }
}

const order = (entries: ReturnType<typeof buildListEntries>) => entries.map(e => `${e.kind}-${e.id}`)

describe('buildListEntries', () => {
	it('sorts by priority first', () => {
		const entries = buildListEntries({ items: [item(1, 'low', 0), item(2, 'very-high', 5)], groups: [] })
		expect(order(entries)).toEqual(['item-2', 'item-1'])
	})

	it('follows the saved sortOrder within a priority, not the id', () => {
		const entries = buildListEntries({
			items: [item(1, 'normal', 2), item(2, 'normal', 0), item(3, 'normal', 1, 10)],
			groups: [group(10, 'normal', 1)],
		})
		expect(order(entries)).toEqual(['item-2', 'group-10', 'item-1'])
	})

	it('puts entries without a sortOrder after ordered ones, by id', () => {
		const entries = buildListEntries({
			items: [item(5, 'high', null), item(4, 'high', null), item(9, 'high', 0)],
			groups: [],
		})
		expect(order(entries)).toEqual(['item-9', 'item-4', 'item-5'])
	})
})
