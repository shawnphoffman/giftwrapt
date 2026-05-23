import { and, eq, isNotNull, isNull, type SQL } from 'drizzle-orm'

import { items } from '@/db/schema'

/**
 * Visibility shapes for the `items` table.
 *
 * Each mode is named for the SHAPE of its SQL predicate, not for the
 * UI surface that happens to use it today. Two surfaces that share a
 * predicate should share a mode; don't add a new mode just to label a
 * new caller. The four shapes that actually exist:
 *
 * - 'visible'           archived=false AND pending-deletion IS NULL.
 *   The default viewer-facing predicate: hides revealed gifts AND
 *   pending-deletion items. Used by list-detail / recent feed /
 *   analyzers / auto-archive candidates / public lists.
 *
 * - 'editable'          pending-deletion IS NULL ONLY.
 *   IMPORTANT: this DOES include archived (revealed) rows. The name
 *   reflects intent ("the recipient can still touch this row") not the
 *   archive state. Used by recipient-side mutations that must 404 on
 *   pending-deletion (updateItem, deleteItem, copyItemToList,
 *   archiveItem, setItemAvailability), the organize view's
 *   includeArchived branch, the merge-lists item re-point, and the
 *   `or`-group sibling claim-gate.
 *
 * - 'revealed'          archived=true AND pending-deletion IS NULL.
 *   Only items the recipient has revealed. Used by the received-gifts
 *   query and the post-birthday gifter summary.
 *
 * - 'pending-deletion'  pending-deletion IS NOT NULL.
 *   The orphan-claim surface set: items the recipient deleted that
 *   still have live claims. Used only by the orphan-alert and the
 *   orphan-cleanup cron.
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
