import type { GroupSummary } from '@/api/lists'
import type { Priority } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'

export type ListEntry<T extends Item = Item> =
	| { kind: 'item'; priority: Priority; id: number; item: T }
	| { kind: 'group'; priority: Priority; id: number; group: GroupSummary; items: Array<T> }

const priorityRank: Record<Priority, number> = { 'very-high': 4, high: 3, normal: 2, low: 1 }

export function buildListEntries<T extends Item>(list: { items: Array<T>; groups: Array<GroupSummary> }): Array<ListEntry<T>> {
	const ungroupedItems = list.items.filter(i => i.groupId === null)
	const itemsByGroup = new Map<number, Array<T>>()
	for (const item of list.items) {
		if (item.groupId !== null) {
			if (!itemsByGroup.has(item.groupId)) itemsByGroup.set(item.groupId, [])
			itemsByGroup.get(item.groupId)!.push(item)
		}
	}
	for (const arr of itemsByGroup.values()) {
		arr.sort((a, b) => {
			const aOrder = a.groupSortOrder ?? Number.MAX_SAFE_INTEGER
			const bOrder = b.groupSortOrder ?? Number.MAX_SAFE_INTEGER
			if (aOrder !== bOrder) return aOrder - bOrder
			return a.id - b.id
		})
	}
	const entries: Array<ListEntry<T>> = [
		...ungroupedItems.map((item): ListEntry<T> => ({ kind: 'item', priority: item.priority, id: item.id, item })),
		...list.groups.map(
			(group): ListEntry<T> => ({
				kind: 'group',
				priority: group.priority,
				id: group.id,
				group,
				items: itemsByGroup.get(group.id) ?? [],
			})
		),
	]
	entries.sort((a, b) => {
		const rDiff = priorityRank[b.priority] - priorityRank[a.priority]
		if (rDiff !== 0) return rDiff
		return a.id - b.id
	})
	return entries
}
