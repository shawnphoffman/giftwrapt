import { and, eq, isNotNull, isNull, type SQL } from 'drizzle-orm'

import { items } from '@/db/schema'

/**
 * Visibility shapes for the `items` table.
 *
 * - 'visible'          archived=false AND pending-deletion IS NULL
 * - 'editable'         pending-deletion IS NULL (archived items allowed)
 * - 'revealed'         archived=true  AND pending-deletion IS NULL
 * - 'pending-deletion' pending-deletion IS NOT NULL
 *
 * See .notes/logic.md (Items section) for the invariants these enforce.
 */
export type ItemVisibility = 'visible' | 'editable' | 'revealed' | 'pending-deletion'

/**
 * Canonical SQL predicate for "what items count as <mode> right now."
 *
 * Returns a single `SQL` fragment so callers can splice it into a wider
 * `where(and(...))` without ceremony:
 *
 *   .where(and(visibleItemsWhere('visible'), eq(items.listId, listId)))
 */
export function visibleItemsWhere(mode: ItemVisibility): SQL {
	switch (mode) {
		case 'visible':
			return and(eq(items.isArchived, false), isNull(items.pendingDeletionAt))!
		case 'editable':
			return isNull(items.pendingDeletionAt)
		case 'revealed':
			return and(eq(items.isArchived, true), isNull(items.pendingDeletionAt))!
		case 'pending-deletion':
			return isNotNull(items.pendingDeletionAt)
	}
}
