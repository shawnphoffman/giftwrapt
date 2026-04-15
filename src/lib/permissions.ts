/**
 * List-visibility predicate shared by the list-detail view and the claim flow.
 *
 * Intentionally NOT owner-aware: what an owner can do with their own list is
 * a different question (the viewer route redirects them to the edit view; the
 * claim flow rejects them). Callers should check `list.ownerId === viewerId`
 * themselves before or after this, depending on their needs.
 */

import { and, eq } from 'drizzle-orm'

import { db } from '@/db'
import { userRelationships } from '@/db/schema'

export type CanViewListResult = { ok: true } | { ok: false; reason: 'inactive' | 'private' | 'denied' }

type ListForVisibilityCheck = {
	id: number
	ownerId: string
	isPrivate: boolean
	isActive: boolean
}

export async function canViewList(viewerId: string, list: ListForVisibilityCheck): Promise<CanViewListResult> {
	if (!list.isActive) return { ok: false, reason: 'inactive' }
	if (list.isPrivate) return { ok: false, reason: 'private' }

	// Explicit deny from the list owner wins over any default "yes".
	// The absence of a row means the default policy (visible) applies.
	const denied = await db.query.userRelationships.findFirst({
		where: and(
			eq(userRelationships.ownerUserId, list.ownerId),
			eq(userRelationships.viewerUserId, viewerId),
			eq(userRelationships.canView, false)
		),
		columns: { ownerUserId: true },
	})
	if (denied) return { ok: false, reason: 'denied' }

	return { ok: true }
}
