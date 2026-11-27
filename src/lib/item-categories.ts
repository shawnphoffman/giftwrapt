// Client-safe types and helpers for item categories. The rules live in
// docs/logic.md "Item categories".

export type CategorySummary = {
	id: number
	name: string
	sortOrder: number
}

// The category a row shows under. A grouped item takes its group's category,
// even when the group has none, the same way it takes the group's priority.
export function effectiveCategoryId(
	item: { groupId: number | null; categoryId: number | null },
	groupCategoryById: ReadonlyMap<number, number | null>
): number | null {
	if (item.groupId === null) return item.categoryId
	return groupCategoryById.get(item.groupId) ?? null
}

// Display order: the owner's order from the Categories dialog, then id.
export function compareCategories(a: CategorySummary, b: CategorySummary): number {
	return a.sortOrder - b.sortOrder || a.id - b.id
}

// A category id, or 'none' for rows with no category.
export type CategoryKey = number | 'none'

type EntryLike = { kind: 'item'; item: { categoryId: number | null } } | { kind: 'group'; group: { categoryId?: number | null } }

// The key a list entry sits under. An ungrouped item uses its own category;
// a group entry uses the group's, which covers every member. An id that is
// not one of the list's categories reads as 'none'.
export function categoryKeyOfEntry(entry: EntryLike, known: ReadonlySet<number>): CategoryKey {
	const id = entry.kind === 'item' ? entry.item.categoryId : (entry.group.categoryId ?? null)
	return id !== null && known.has(id) ? id : 'none'
}

// How many entries each key holds. A group counts once.
export function countEntriesByCategory(entries: ReadonlyArray<EntryLike>, known: ReadonlySet<number>): Map<CategoryKey, number> {
	const counts = new Map<CategoryKey, number>()
	for (const entry of entries) {
		const key = categoryKeyOfEntry(entry, known)
		counts.set(key, (counts.get(key) ?? 0) + 1)
	}
	return counts
}
