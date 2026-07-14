// Server-only implementation for the "search my items" surface used by the
// My Lists page item-search dialog. Same client-bundle isolation rationale as
// the other `_*-impl.ts` files: `items.ts` only references this from inside a
// server-fn handler body, so `db` / drizzle ops stay off the client.

import { and, asc, eq, sql } from 'drizzle-orm'

import { db, type SchemaDatabase } from '@/db'
import { items, lists } from '@/db/schema'
import type { ListType } from '@/db/schema/enums'
import { visibleItemsWhere } from '@/lib/item-visibility'

// One lightweight row per item, carrying just enough for the search dialog to
// render a result and drive its actions (open the list, move the item). The
// dialog does the fuzzy matching client-side over `title` + `listName` +
// `notes`, so this is a plain "all my visible items" fetch, not a query-scoped
// search.
export type MyItemSearchRow = {
	itemId: number
	title: string
	notes: string | null
	url: string | null
	imageUrl: string | null
	price: string | null
	currency: string | null
	listId: number
	listName: string
	listType: ListType
	listIsPrivate: boolean
}

export type SearchMyItemsResult = {
	items: Array<MyItemSearchRow>
}

// Scope: items on lists the signed-in user personally owns. Mirrors the
// "owned" bucket of `getMyListsImpl` - active, non-dependent-subject lists the
// user is the `ownerId` of. Todo lists carry no `items` rows (todos live in
// `todo_items`), so they never appear here. Items are filtered to the
// viewer-facing `'visible'` mode, so archived (revealed) and pending-deletion
// items are excluded, matching what the owner sees on their lists.
export async function searchMyItemsImpl(userId: string, dbx: SchemaDatabase = db): Promise<SearchMyItemsResult> {
	const rows = await dbx
		.select({
			itemId: items.id,
			title: items.title,
			notes: items.notes,
			url: items.url,
			imageUrl: items.imageUrl,
			price: items.price,
			currency: items.currency,
			listId: lists.id,
			listName: lists.name,
			listType: lists.type,
			listIsPrivate: lists.isPrivate,
		})
		.from(items)
		.innerJoin(lists, eq(lists.id, items.listId))
		.where(and(eq(lists.ownerId, userId), eq(lists.isActive, true), sql`${lists.subjectDependentId} IS NULL`, visibleItemsWhere('visible')))
		.orderBy(asc(lists.name), asc(items.title))

	return { items: rows }
}
