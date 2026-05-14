// Shared helpers for the pending-deletion orphan-claim flow.
//
// When a recipient deletes an item that has active claims (one or more
// `giftedItems` rows), the item moves to a "pending-deletion" state instead
// of hard-deleting (see [.notes/logic.md](../../.notes/logic.md) and
// [.notes/plans/2026-04-recipient-deletes-claimed-item.md](../../.notes/plans/2026-04-recipient-deletes-claimed-item.md)).
// The audience that needs to know about each surviving claim is the
// primary gifter and their partner (per the read-time `gifterIds` array
// the rest of the codebase uses for credit). Co-gifters are intentionally
// silent.

import { eq } from 'drizzle-orm'

import { type SchemaDatabase } from '@/db'
import { dependents, giftedItems, users } from '@/db/schema'
import { createLogger } from '@/lib/logger'
import { isEmailConfigured, sendOrphanClaimEmail } from '@/lib/resend'

const orphanLog = createLogger('orphan-claims')

type AudienceUser = {
	id: string
	name: string | null
	email: string
}

// Returns the unique people who should hear about this claim becoming
// orphaned: the primary gifter, plus their partner (if any). Co-gifters
// are deliberately excluded - they're informational passengers on the
// claim, not its owners. Order is stable (gifter first, then partner).
export async function resolveOrphanClaimAudience(dbx: SchemaDatabase, gifterId: string): Promise<Array<AudienceUser>> {
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
	return audience
}

// Returns the union of audiences across every claim on the item, deduped
// by user id. Used by the deleteItem trigger so we send one email per
// unique audience member regardless of how many claims they're on.
export async function resolveOrphanItemAudience(dbx: SchemaDatabase, itemId: number): Promise<Array<AudienceUser>> {
	const claims = await dbx.query.giftedItems.findMany({
		where: eq(giftedItems.itemId, itemId),
		columns: { gifterId: true },
	})
	const seen = new Set<string>()
	const out: Array<AudienceUser> = []
	for (const claim of claims) {
		const audience = await resolveOrphanClaimAudience(dbx, claim.gifterId)
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
// pending-deletion item in the per-list alert.
export async function userHasStandingOnClaim(
	dbx: SchemaDatabase,
	userId: string,
	claim: { gifterId: string; additionalGifterIds: Array<string> | null }
): Promise<boolean> {
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
	listId: number
	listName: string
	recipientName: string
}): Promise<void> {
	const { dbx, itemId, itemTitle, itemImageUrl, listId, listName, recipientName } = args
	if (!(await isEmailConfigured())) return
	const audience = await resolveOrphanItemAudience(dbx, itemId)
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
	}
}

// Returns true if the user (or their partner) has any active
// pending-deletion claim on the given list. Used to allow the gifter to
// navigate to a now-archived list whose orphan they need to resolve.
export async function userHasPendingDeletionClaimOnList(dbx: SchemaDatabase, userId: string, listId: number): Promise<boolean> {
	const me = await dbx.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { partnerId: true },
	})
	const partnerId = me?.partnerId ?? null
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
