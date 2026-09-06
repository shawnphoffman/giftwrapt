// Shared helpers for the pending-deletion orphan-claim flow.
//
// When a recipient deletes an item that has active claims (one or more
// `giftedItems` rows), the item moves to a "pending-deletion" state instead
// of hard-deleting (see [docs/logic.md](docs/logic.md) and
// [docs/logic.md](docs/logic.md)).
// The audience that needs to know about each surviving claim is the
// primary gifter and their partner (per the read-time `gifterIds` array
// the rest of the codebase uses for credit). Co-gifters are intentionally
// silent.
//
// Spoiler-critical invariant: the list's RECIPIENT is never part of the
// audience, even when they are the gifter's partner. A partner buying a
// gift FOR their partner (a claim on the partner's own list) is the
// common case, and telling the recipient "an item you claimed was
// removed" would reveal that their partner had bought it. Every audience
// / standing / visibility helper in this module threads the list through
// `isListRecipient` for that reason. The rule mirrors
// `blockedCoGifterIds` in `_gifts-impl.ts`: for a user-subject list the
// recipient is the owner; dependent-subject lists have a non-user
// recipient, so nobody is excluded.

import { eq } from 'drizzle-orm'

import { type SchemaDatabase } from '@/db'
import { dependents, giftedItems, lists, users } from '@/db/schema'
import { fanOutToGuardians } from '@/lib/guardian-emails'
import { createLogger } from '@/lib/logger'
import { isEmailConfigured, sendOrphanClaimEmail } from '@/lib/resend'

const orphanLog = createLogger('orphan-claims')

type AudienceUser = {
	id: string
	name: string | null
	email: string
}

// The subset of a list row needed to decide who its recipient is.
export type OrphanListRecipientInfo = {
	ownerId: string
	subjectDependentId: string | null
}

// True when `userId` is the person the list's gifts are FOR. For a
// user-subject list that's the owner. Dependent-subject lists are for a
// pet/baby/etc., so no user is the recipient (the owner is a guardian
// who shops for the dependent like everyone else).
export function isListRecipient(list: OrphanListRecipientInfo, userId: string): boolean {
	return !list.subjectDependentId && list.ownerId === userId
}

// Returns the unique people who should hear about this claim becoming
// orphaned: the primary gifter, plus their partner (if any). Co-gifters
// are deliberately excluded - they're informational passengers on the
// claim, not its owners. The list's recipient is always excluded (see
// module header). Order is stable (gifter first, then partner).
export async function resolveOrphanClaimAudience(
	dbx: SchemaDatabase,
	gifterId: string,
	list: OrphanListRecipientInfo
): Promise<Array<AudienceUser>> {
	const gifter = await dbx.query.users.findFirst({
		where: eq(users.id, gifterId),
		columns: { id: true, name: true, email: true, partnerId: true },
	})
	if (!gifter) return []
	const audience: Array<AudienceUser> = [{ id: gifter.id, name: gifter.name, email: gifter.email }]
	if (gifter.partnerId) {
		const partner = await dbx.query.users.findFirst({
			where: eq(users.id, gifter.partnerId),
			columns: { id: true, name: true, email: true },
		})
		if (partner && partner.id !== gifter.id) {
			audience.push({ id: partner.id, name: partner.name, email: partner.email })
		}
	}
	return audience.filter(u => !isListRecipient(list, u.id))
}

// Returns the union of audiences across every claim on the item, deduped
// by user id. Used by the deleteItem trigger so we send one email per
// unique audience member regardless of how many claims they're on.
export async function resolveOrphanItemAudience(
	dbx: SchemaDatabase,
	itemId: number,
	list: OrphanListRecipientInfo
): Promise<Array<AudienceUser>> {
	const claims = await dbx.query.giftedItems.findMany({
		where: eq(giftedItems.itemId, itemId),
		columns: { gifterId: true },
	})
	const seen = new Set<string>()
	const out: Array<AudienceUser> = []
	for (const claim of claims) {
		const audience = await resolveOrphanClaimAudience(dbx, claim.gifterId, list)
		for (const u of audience) {
			if (seen.has(u.id)) continue
			seen.add(u.id)
			out.push(u)
		}
	}
	return out
}

// Returns true if `userId` (or their partner) has standing on the
// claim's audience. Used to authorize ack and to gate visibility of the
// pending-deletion item in the per-list alert. The list's recipient
// never has standing, even via their partner's claim.
export async function userHasStandingOnClaim(
	dbx: SchemaDatabase,
	userId: string,
	claim: { gifterId: string; additionalGifterIds: Array<string> | null },
	list: OrphanListRecipientInfo
): Promise<boolean> {
	if (isListRecipient(list, userId)) return false
	if (claim.gifterId === userId) return true
	const me = await dbx.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { partnerId: true },
	})
	const partnerId = me?.partnerId ?? null
	if (partnerId && claim.gifterId === partnerId) return true
	return false
}

// Returns the recipient name to display in emails / alert UI. For
// dependent-subject lists this is the dependent's name; otherwise the
// list owner's display name. Falls back to a neutral string if both
// lookups fail.
export async function resolveListRecipientName(
	dbx: SchemaDatabase,
	list: { ownerId: string; subjectDependentId: string | null }
): Promise<string> {
	if (list.subjectDependentId) {
		const dep = await dbx.query.dependents.findFirst({
			where: eq(dependents.id, list.subjectDependentId),
			columns: { name: true },
		})
		if (dep?.name) return dep.name
	}
	const owner = await dbx.query.users.findFirst({
		where: eq(users.id, list.ownerId),
		columns: { name: true, email: true },
	})
	return owner?.name || owner?.email || 'the recipient'
}

// Fires the initial orphan-claim email to the audience for this item.
// One email per audience member. Failures are logged, never thrown.
// Called inline from `deleteItemImpl` when an item flips into
// pending-deletion. Tolerates an unconfigured email setup (skips silently).
export async function dispatchOrphanClaimEmails(args: {
	dbx: SchemaDatabase
	itemId: number
	itemTitle: string
	itemImageUrl: string | null
	list: OrphanListRecipientInfo & { id: number; name: string }
	recipientName: string
}): Promise<void> {
	const { dbx, itemId, itemTitle, itemImageUrl, list, recipientName } = args
	const listId = list.id
	const listName = list.name
	if (!(await isEmailConfigured(dbx))) return
	const audience = await resolveOrphanItemAudience(dbx, itemId, list)
	for (const member of audience) {
		try {
			await sendOrphanClaimEmail(member.email, {
				username: member.name || 'there',
				itemTitle,
				itemImageUrl,
				recipientName,
				listId,
				listName,
			})
		} catch (err) {
			orphanLog.warn(
				{ err: err instanceof Error ? err.message : String(err), recipient: member.email, itemId, listId },
				'failed to send orphan-claim email'
			)
		}
		// A guardian of the gifter could be the recipient (a child buying
		// for their parent); never copy them on it.
		await fanOutToGuardians(
			dbx,
			member.id,
			g =>
				sendOrphanClaimEmail(g.email, {
					username: member.name || 'there',
					itemTitle,
					itemImageUrl,
					recipientName,
					listId,
					listName,
				}),
			{ skip: g => isListRecipient(list, g.id) }
		)
	}
}

// Returns true if the user (or their partner) has any active
// pending-deletion claim on the given list. Used to allow the gifter to
// navigate to a now-archived list whose orphan they need to resolve.
// The list's recipient never qualifies: their partner's claims on their
// own list are not theirs to see.
//
// Partnership is stored on a single nullable `partnerId` column but
// treated symmetrically by gift-credit code (see logic.md "Partnership
// is a single nullable column"), so we resolve the partner from BOTH
// sides: either the viewer declared a partner, or some other user
// declared the viewer as their partner.
export async function userHasPendingDeletionClaimOnList(dbx: SchemaDatabase, userId: string, listId: number): Promise<boolean> {
	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, listId),
		columns: { ownerId: true, subjectDependentId: true },
	})
	if (!list) return false
	if (isListRecipient(list, userId)) return false
	const [me, inverse] = await Promise.all([
		dbx.query.users.findFirst({
			where: eq(users.id, userId),
			columns: { partnerId: true },
		}),
		dbx.query.users.findFirst({
			where: eq(users.partnerId, userId),
			columns: { id: true },
		}),
	])
	const partnerId = me?.partnerId ?? inverse?.id ?? null
	const candidateGifterIds = partnerId ? [userId, partnerId] : [userId]
	const itemRows = await dbx.query.items.findMany({
		where: (i, { and: a, eq: e, isNotNull: nn }) => a(e(i.listId, listId), nn(i.pendingDeletionAt)),
		columns: { id: true },
	})
	if (itemRows.length === 0) return false
	const itemIds = itemRows.map(r => r.id)
	const claims = await dbx.query.giftedItems.findMany({
		where: (g, { and: a, inArray: ia }) => a(ia(g.itemId, itemIds), ia(g.gifterId, candidateGifterIds)),
		columns: { id: true },
	})
	return claims.length > 0
}
