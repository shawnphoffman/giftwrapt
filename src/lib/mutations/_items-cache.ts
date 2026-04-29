import type { QueryClient } from '@tanstack/react-query'

import type { ItemForEditing, ItemWithGifts } from '@/api/items'
import type { Item } from '@/db/schema/items'
import { itemsKeys } from '@/lib/queries/items'

export type ItemRowLike = ItemForEditing | ItemWithGifts
export type ItemCacheSnapshot = ReadonlyArray<readonly [unknown, ReadonlyArray<ItemRowLike> | undefined]>

type Transform = <T extends ItemRowLike>(items: ReadonlyArray<T>) => ReadonlyArray<T>

export async function snapshotItemCache(queryClient: QueryClient, listId: number): Promise<ItemCacheSnapshot> {
	const filter = { queryKey: itemsKeys.byList(listId) }
	await queryClient.cancelQueries(filter)
	return queryClient.getQueriesData<ReadonlyArray<ItemRowLike>>(filter) as ItemCacheSnapshot
}

export function rollbackItemCache(queryClient: QueryClient, snapshot: ItemCacheSnapshot | undefined): void {
	if (!snapshot) return
	for (const [key, data] of snapshot) {
		queryClient.setQueryData(key as ReadonlyArray<unknown>, data)
	}
}

export function transformItemCache(queryClient: QueryClient, listId: number, transform: Transform): void {
	const filter = { queryKey: itemsKeys.byList(listId) }
	const current = queryClient.getQueriesData<ReadonlyArray<ItemRowLike>>(filter)
	for (const [key, data] of current) {
		if (!data) continue
		queryClient.setQueryData(key, transform(data))
	}
}

export function patchItemById(itemId: number, patch: Partial<Item>): Transform {
	return <T extends ItemRowLike>(items: ReadonlyArray<T>): ReadonlyArray<T> =>
		items.map(it => (it.id === itemId ? { ...it, ...patch } : it))
}

export function patchItemsByIds(itemIds: ReadonlyArray<number>, patch: Partial<Item>): Transform {
	const set = new Set(itemIds)
	return <T extends ItemRowLike>(items: ReadonlyArray<T>): ReadonlyArray<T> => items.map(it => (set.has(it.id) ? { ...it, ...patch } : it))
}

export function filterOutItemIds(itemIds: ReadonlyArray<number>): Transform {
	const set = new Set(itemIds)
	return <T extends ItemRowLike>(items: ReadonlyArray<T>): ReadonlyArray<T> => items.filter(it => !set.has(it.id))
}

export function filterOutItemsInGroups(groupIds: ReadonlyArray<number>): Transform {
	const set = new Set(groupIds)
	return <T extends ItemRowLike>(items: ReadonlyArray<T>): ReadonlyArray<T> =>
		items.filter(it => it.groupId == null || !set.has(it.groupId))
}
