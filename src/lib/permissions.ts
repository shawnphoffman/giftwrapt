/**
 * List-level permission predicates shared by routes and server fns.
 *
 * Intentionally NOT owner-aware: what an owner can do with their own list is
 * a different question (the viewer route redirects them to the edit view; the
 * claim flow rejects them). Callers should check `list.ownerId === viewerId`
 * themselves before or after this, depending on their needs.
 */

import { and, eq } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { db as defaultDb } from '@/db'
import { guardianships, listEditors, userRelationships, users } from '@/db/schema'
import type { AccessLevel } from '@/db/schema/enums'

export type CanViewListResult = { ok: true } | { ok: false; reason: 'inactive' | 'private' | 'denied' }

type ListForVisibilityCheck = {
	id: number
	ownerId: string
	isPrivate: boolean
	isActive: boolean
}

export async function canViewList(
	viewerId: string,
	list: ListForVisibilityCheck,
	dbx: SchemaDatabase = defaultDb
): Promise<CanViewListResult> {
	if (!list.isActive) return { ok: false, reason: 'inactive' }
	if (list.isPrivate) return { ok: false, reason: 'private' }

	// Explicit deny from the list owner wins over any default "yes".
	// The absence of a row means the default policy (visible) applies.
	// Restricted is still ok at the LIST level; per-item filtering happens
	// in the read paths.
	const rel = await dbx.query.userRelationships.findFirst({
		where: and(eq(userRelationships.ownerUserId, list.ownerId), eq(userRelationships.viewerUserId, viewerId)),
		columns: { accessLevel: true },
	})
	if (rel?.accessLevel === 'none') return { ok: false, reason: 'denied' }

	return { ok: true }
}

// Owner-aware shortcut around canViewList. Callers that show data to
// EITHER the list owner OR a permitted viewer should use this rather
// than open-coding `if (ownerId === viewerId) skip; else canViewList(...)`,
// which is easy to drift out of sync if the visibility rules ever
// change. See sec-review M9.
export async function canViewListAsAnyone(
	viewerId: string,
	list: ListForVisibilityCheck,
	dbx: SchemaDatabase = defaultDb
): Promise<CanViewListResult> {
	if (list.ownerId === viewerId) return { ok: true }
	return canViewList(viewerId, list, dbx)
}

// ===============================
// canEditList
// ===============================
// Edit access is granted in THREE layered ways (spec §2.6):
//   1. Guardianship: a row in guardianships where the viewer is the parent
//      and the list owner is the child. Guardians have full edit access on
//      all of their child's lists.
//   2. User-level: userRelationships.canEdit = true (blanket edit on all
//      of that owner's lists).
//   3. List-level: a row in listEditors for (listId, userId).
// Any one is sufficient. The owner always has implicit edit access,
// but callers should check ownership separately (this helper is for
// non-owners).
//
// Restricted wins on conflict: if userRelationships.accessLevel = 'restricted'
// for the (owner, viewer) pair, edit grants from layers (2) and (3) are
// ignored. Guardianship (layer 1) is unaffected because partners and
// guardians cannot be set to restricted.

export type CanEditListResult = { ok: true } | { ok: false; reason: 'not-editor' | 'restricted' }

export async function canEditList(
	userId: string,
	list: ListForVisibilityCheck,
	dbx: SchemaDatabase = defaultDb
): Promise<CanEditListResult> {
	// Guardianship grant: viewer is a guardian of the list owner.
	const guardianGrant = await dbx.query.guardianships.findFirst({
		where: and(eq(guardianships.parentUserId, userId), eq(guardianships.childUserId, list.ownerId)),
		columns: { parentUserId: true },
	})
	if (guardianGrant) return { ok: true }

	const rel = await dbx.query.userRelationships.findFirst({
		where: and(eq(userRelationships.ownerUserId, list.ownerId), eq(userRelationships.viewerUserId, userId)),
		columns: { accessLevel: true, canEdit: true },
	})

	// Restricted suppresses every non-guardian edit grant.
	if (rel?.accessLevel === 'restricted') return { ok: false, reason: 'restricted' }

	// User-level blanket edit grant.
	if (rel?.canEdit) return { ok: true }

	// List-level editor grant.
	const listGrant = await dbx.query.listEditors.findFirst({
		where: and(eq(listEditors.listId, list.id), eq(listEditors.userId, userId)),
		columns: { id: true },
	})
	if (listGrant) return { ok: true }

	return { ok: false, reason: 'not-editor' }
}

// ===============================
// getViewerAccessLevel
// ===============================
// Canonical resolver for "what tier does this viewer get on this owner's
// universe of lists?". Used by item-filter code paths and by UI surfaces
// that need to know the level without making a separate access check.
//
// Resolution order (strongest first):
//   - owner   : viewer === owner
//   - guardian: viewer is a parent of owner in `guardianships`
//   - partner : viewer is the owner's partnerId (always 'view'; partner
//               can never be 'restricted')
//   - explicit `userRelationships` row's `accessLevel`
//   - 'view'  : default for any authenticated pair with no row
//
// Note that 'restricted' is NEVER returned for guardian/partner pairs even
// if a stale row says so, mirroring the role rules. The relationship-update
// path rejects setting 'restricted' on those pairs in the first place; this
// resolver is the safety net.

export type ResolvedAccessLevel = AccessLevel | 'owner'

export async function getViewerAccessLevel(
	viewerId: string,
	ownerId: string,
	dbx: SchemaDatabase = defaultDb
): Promise<ResolvedAccessLevel> {
	if (viewerId === ownerId) return 'owner'

	const guardianGrant = await dbx.query.guardianships.findFirst({
		where: and(eq(guardianships.parentUserId, viewerId), eq(guardianships.childUserId, ownerId)),
		columns: { parentUserId: true },
	})
	if (guardianGrant) return 'view'

	const owner = await dbx.query.users.findFirst({
		where: eq(users.id, ownerId),
		columns: { partnerId: true },
	})
	if (owner?.partnerId === viewerId) return 'view'

	const rel = await dbx.query.userRelationships.findFirst({
		where: and(eq(userRelationships.ownerUserId, ownerId), eq(userRelationships.viewerUserId, viewerId)),
		columns: { accessLevel: true },
	})
	return rel?.accessLevel ?? 'view'
}
