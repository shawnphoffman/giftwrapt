/**
 * List-level permission predicates shared by routes and server fns.
 *
 * Intentionally NOT owner-aware: what an owner can do with their own list is
 * a different question (the viewer route redirects them to the edit view; the
 * claim flow rejects them). Callers should check `list.ownerId === viewerId`
 * themselves before or after this, depending on their needs.
 */

import { and, eq, inArray } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { db as defaultDb } from '@/db'
import { dependentGuardianships, guardianships, listEditors, userRelationships, users } from '@/db/schema'
import type { AccessLevel } from '@/db/schema/enums'

export type CanViewListResult = { ok: true } | { ok: false; reason: 'inactive' | 'private' | 'denied' }

type ListForVisibilityCheck = {
	id: number
	ownerId: string
	subjectDependentId?: string | null
	isPrivate: boolean
	isActive: boolean
}

// Resolve the user IDs whose `userRelationships` rows govern visibility for
// `list`. For a normal user-owned list this is just the owner. For a
// dependent-subject list this is every guardian of the dependent: a viewer
// is denied if ANY guardian has explicitly denied them, and granted view
// access via the same default-allow policy otherwise.
async function getRelationshipOwnerIds(list: ListForVisibilityCheck, dbx: SchemaDatabase): Promise<Array<string>> {
	if (!list.subjectDependentId) return [list.ownerId]
	const guardians = await dbx
		.select({ guardianUserId: dependentGuardianships.guardianUserId })
		.from(dependentGuardianships)
		.where(eq(dependentGuardianships.dependentId, list.subjectDependentId))
	const ids = guardians.map(g => g.guardianUserId)
	return ids.length > 0 ? ids : [list.ownerId]
}

export async function canViewList(
	viewerId: string,
	list: ListForVisibilityCheck,
	dbx: SchemaDatabase = defaultDb
): Promise<CanViewListResult> {
	if (!list.isActive) return { ok: false, reason: 'inactive' }

	// Guardians of the dependent always see the list, regardless of
	// privacy or relationship overrides.
	if (list.subjectDependentId) {
		const guard = await dbx.query.dependentGuardianships.findFirst({
			where: and(eq(dependentGuardianships.guardianUserId, viewerId), eq(dependentGuardianships.dependentId, list.subjectDependentId)),
			columns: { guardianUserId: true },
		})
		if (guard) return { ok: true }
	}

	if (list.isPrivate) return { ok: false, reason: 'private' }

	// Explicit deny from any owning user wins over any default "yes".
	// For dependent-subject lists, the dependent's privacy inherits from
	// each guardian: a viewer the guardian has set to `none` cannot see
	// the dependent's lists either.
	const ownerIds = await getRelationshipOwnerIds(list, dbx)
	const rels = await dbx
		.select({ accessLevel: userRelationships.accessLevel })
		.from(userRelationships)
		.where(and(inArray(userRelationships.ownerUserId, ownerIds), eq(userRelationships.viewerUserId, viewerId)))
	if (rels.some(r => r.accessLevel === 'none')) return { ok: false, reason: 'denied' }

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

// True when the viewer is a guardian of the list's subject dependent.
// Pulled out so callers (e.g. canEditList, the "self-claim" gate) can
// share the same predicate.
export async function isDependentGuardianOfList(
	viewerId: string,
	list: { subjectDependentId?: string | null },
	dbx: SchemaDatabase = defaultDb
): Promise<boolean> {
	if (!list.subjectDependentId) return false
	const guard = await dbx.query.dependentGuardianships.findFirst({
		where: and(eq(dependentGuardianships.guardianUserId, viewerId), eq(dependentGuardianships.dependentId, list.subjectDependentId)),
		columns: { guardianUserId: true },
	})
	return !!guard
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
	// Dependent-subject grant: viewer is a guardian of the dependent the
	// list is FOR. Always full edit, mirrors the child guardianship rule.
	if (await isDependentGuardianOfList(userId, list, dbx)) return { ok: true }

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

// True when `viewerId` is a guardian of the dependent, OR is not
// explicitly denied by ANY guardian via a `userRelationships` row of
// `accessLevel='none'`. Mirrors the dependent-subject branch of
// `canViewList` so custom-holiday recipient gating uses the same
// default-allow-unless-denied semantics as list visibility.
async function dependentRecipientVisible(viewerId: string, dependentId: string, dbx: SchemaDatabase): Promise<boolean> {
	const guard = await dbx.query.dependentGuardianships.findFirst({
		where: and(eq(dependentGuardianships.guardianUserId, viewerId), eq(dependentGuardianships.dependentId, dependentId)),
		columns: { guardianUserId: true },
	})
	if (guard) return true

	const guardianRows = await dbx
		.select({ guardianUserId: dependentGuardianships.guardianUserId })
		.from(dependentGuardianships)
		.where(eq(dependentGuardianships.dependentId, dependentId))
	const guardianIds = guardianRows.map(g => g.guardianUserId)
	// A dependent with no guardians is unreachable; default to false so
	// orphan rows don't broadcast.
	if (guardianIds.length === 0) return false

	const denials = await dbx
		.select({ accessLevel: userRelationships.accessLevel })
		.from(userRelationships)
		.where(and(inArray(userRelationships.ownerUserId, guardianIds), eq(userRelationships.viewerUserId, viewerId)))
	if (denials.some(r => r.accessLevel === 'none')) return false
	return true
}

// Recipient-aware gate for `custom_holidays` rows. Used by the widget,
// reminder cron, list-hygiene event filter, and the picker. Mirrors the
// four-axis "who can shop for X" universe so a recipient-bound holiday
// only fans out to people who could see the recipient's lists.
//   - Both nulls => broadcast (true for everyone).
//   - `recipientUserId` set => `canViewListAsAnyone` semantics against
//     a synthetic public-list-shaped object owned by the recipient.
//   - `recipientDependentId` set => `dependentRecipientVisible`.
// XOR is enforced at write time; if both are somehow set we evaluate
// the user branch first (defensive; should never happen in prod).
export async function canViewerSeeCustomHolidayRecipient(
	viewerId: string,
	holiday: { recipientUserId: string | null; recipientDependentId: string | null },
	dbx: SchemaDatabase = defaultDb
): Promise<boolean> {
	if (holiday.recipientUserId) {
		const result = await canViewListAsAnyone(
			viewerId,
			{ id: 0, ownerId: holiday.recipientUserId, isPrivate: false, isActive: true, subjectDependentId: null },
			dbx
		)
		return result.ok
	}
	if (holiday.recipientDependentId) {
		return dependentRecipientVisible(viewerId, holiday.recipientDependentId, dbx)
	}
	return true
}

// Like `getViewerAccessLevel`, but list-aware: dependent-subject lists
// resolve via the dependent's guardians rather than the list's owner.
// - Guardian of the dependent: 'owner' (full access).
// - Otherwise: the most permissive `userRelationships` row across all
//   guardians wins, with explicit deny ('none') from any single guardian
//   blocking access (mirrors canViewList).
export async function getViewerAccessLevelForList(
	viewerId: string,
	list: { ownerId: string; subjectDependentId?: string | null },
	dbx: SchemaDatabase = defaultDb
): Promise<ResolvedAccessLevel> {
	if (list.subjectDependentId) {
		// Guardian of the dependent acts as "owner" of the list for
		// access-level purposes; full read+write.
		const guard = await dbx.query.dependentGuardianships.findFirst({
			where: and(eq(dependentGuardianships.guardianUserId, viewerId), eq(dependentGuardianships.dependentId, list.subjectDependentId)),
			columns: { guardianUserId: true },
		})
		if (guard) return 'owner'

		const guardianRows = await dbx
			.select({ guardianUserId: dependentGuardianships.guardianUserId })
			.from(dependentGuardianships)
			.where(eq(dependentGuardianships.dependentId, list.subjectDependentId))
		const guardianIds = guardianRows.map(g => g.guardianUserId)
		if (guardianIds.length === 0) return getViewerAccessLevel(viewerId, list.ownerId, dbx)

		const rels = await dbx
			.select({ accessLevel: userRelationships.accessLevel })
			.from(userRelationships)
			.where(and(inArray(userRelationships.ownerUserId, guardianIds), eq(userRelationships.viewerUserId, viewerId)))
		if (rels.some(r => r.accessLevel === 'none')) return 'none'
		if (rels.some(r => r.accessLevel === 'view')) return 'view'
		if (rels.some(r => r.accessLevel === 'restricted')) return 'restricted'
		return 'view'
	}
	return getViewerAccessLevel(viewerId, list.ownerId, dbx)
}
