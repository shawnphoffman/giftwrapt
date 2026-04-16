/**
 * List-level permission predicates shared by routes and server fns.
 *
 * Intentionally NOT owner-aware: what an owner can do with their own list is
 * a different question (the viewer route redirects them to the edit view; the
 * claim flow rejects them). Callers should check `list.ownerId === viewerId`
 * themselves before or after this, depending on their needs.
 */

import { and, eq } from 'drizzle-orm'

import { db } from '@/db'
import { listEditors, userRelationships } from '@/db/schema'

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

// ===============================
// canEditList
// ===============================
// Edit access is granted in TWO layered ways (spec §2.6):
//   1. User-level: userRelationships.canEdit = true (blanket edit on all
//      of that owner's lists).
//   2. List-level: a row in listEditors for (listId, userId).
// Either one is sufficient. The owner always has implicit edit access,
// but callers should check ownership separately (this helper is for
// non-owners).

export type CanEditListResult = { ok: true } | { ok: false; reason: 'not-editor' }

export async function canEditList(userId: string, list: ListForVisibilityCheck): Promise<CanEditListResult> {
	// User-level blanket edit grant.
	const userGrant = await db.query.userRelationships.findFirst({
		where: and(
			eq(userRelationships.ownerUserId, list.ownerId),
			eq(userRelationships.viewerUserId, userId),
			eq(userRelationships.canEdit, true)
		),
		columns: { ownerUserId: true },
	})
	if (userGrant) return { ok: true }

	// List-level editor grant.
	const listGrant = await db.query.listEditors.findFirst({
		where: and(eq(listEditors.listId, list.id), eq(listEditors.userId, userId)),
		columns: { id: true },
	})
	if (listGrant) return { ok: true }

	return { ok: false, reason: 'not-editor' }
}
