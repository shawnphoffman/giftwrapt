// Server-only implementation for the "search my items" surface used by the
// My Lists page item-search dialog. Same client-bundle isolation rationale as
// the other `_*-impl.ts` files: `items.ts` only references this from inside a
// server-fn handler body, so `db` / drizzle ops stay off the client.

import { and, asc, eq, ilike, or, sql } from 'drizzle-orm'

import { db, type SchemaDatabase } from '@/db'
import { items, lists } from '@/db/schema'
import type { ListType } from '@/db/schema/enums'
import { escapeLikePattern, MAX_ITEM_SEARCH_RESULTS, MIN_ITEM_SEARCH_QUERY_LENGTH, tokenizeItemSearchQuery } from '@/lib/item-search'
import { visibleItemsWhere } from '@/lib/item-visibility'

// One lightweight row per matching item, carrying just enough for the search
// dialog to render a result and drive its actions (open the list, move the
// item).
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

export type SearchMyItemsResult =
	// The query didn't clear `MIN_ITEM_SEARCH_QUERY_LENGTH`, so the DB was never
	// touched. The dialog gates on the same constant and normally doesn't call;
	// this is the server-side half of that gate, not a state the UI drives into.
	| { kind: 'query-too-short'; minLength: number }
	| {
			kind: 'ok'
			// Capped at `MAX_ITEM_SEARCH_RESULTS`, best matches first.
			items: Array<MyItemSearchRow>
			// Total matches before the cap, so the UI can say what it left out.
			totalMatches: number
			// Whether the user has ANY searchable item, which lets the dialog tell
			// "you have no items yet" apart from "nothing matched". Only computed
			// when there are zero matches; `true` otherwise (matches imply items).
			hasAnyItems: boolean
	  }

// Scope: items on lists the signed-in user personally owns. Mirrors the
// "owned" bucket of `getMyListsImpl` - active, non-dependent-subject lists the
// user is the `ownerId` of. Todo lists carry no `items` rows (todos live in
// `todo_items`), so they never appear here. Items are filtered to the
// viewer-facing `'visible'` mode, so archived (revealed) and pending-deletion
// items are excluded, matching what the owner sees on their lists.
export async function searchMyItemsImpl(
	{ userId, query }: { userId: string; query: string },
	dbx: SchemaDatabase = db
): Promise<SearchMyItemsResult> {
	const tokens = tokenizeItemSearchQuery(query)
	if (tokens.length === 0) return { kind: 'query-too-short', minLength: MIN_ITEM_SEARCH_QUERY_LENGTH }

	const scope = and(
		eq(lists.ownerId, userId),
		eq(lists.isActive, true),
		sql`${lists.subjectDependentId} IS NULL`,
		visibleItemsWhere('visible')
	)

	// Every token has to land somewhere on the row - title, list name, or notes -
	// but they may land in different fields ("bass strap" matches a "Strap" on a
	// "Bass gear" list). `ILIKE` against a NULL `notes` yields NULL, which is
	// not TRUE, so null notes simply don't match.
	const tokenMatches = tokens.map(token => {
		const pattern = `%${escapeLikePattern(token)}%`
		return or(ilike(items.title, pattern), ilike(lists.name, pattern), ilike(items.notes, pattern))
	})

	// Rank on the whole query so a multi-token query that reads straight off the
	// title ("bass guitar") outranks one scattered across notes. Ordering falls
	// back to the list-name / title ordering the dialog used to get for free.
	const wholeQuery = escapeLikePattern(query.trim())
	const prefixPattern = `${wholeQuery}%`
	const containsPattern = `%${wholeQuery}%`
	const matchRank = sql<number>`case
		when ${items.title} ilike ${prefixPattern} then 0
		when ${items.title} ilike ${containsPattern} then 1
		when ${lists.name} ilike ${containsPattern} then 2
		else 3
	end`

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
			// Window functions are evaluated before LIMIT, so this is the true
			// match count and saves a second round trip for it.
			totalMatches: sql<number>`cast(count(*) over () as int)`,
		})
		.from(items)
		.innerJoin(lists, eq(lists.id, items.listId))
		.where(and(scope, ...tokenMatches))
		.orderBy(matchRank, asc(lists.name), asc(items.title))
		.limit(MAX_ITEM_SEARCH_RESULTS)

	if (rows.length === 0) {
		// Zero matches: one cheap existence probe so the dialog can show "you
		// don't have any items yet" instead of a misleading "nothing matched".
		const existing = await dbx.select({ itemId: items.id }).from(items).innerJoin(lists, eq(lists.id, items.listId)).where(scope).limit(1)
		return { kind: 'ok', items: [], totalMatches: 0, hasAnyItems: existing.length > 0 }
	}

	const { totalMatches } = rows[0]
	return {
		kind: 'ok',
		items: rows.map(({ totalMatches: _total, ...row }) => row),
		totalMatches,
		hasAnyItems: true,
	}
}
