// Daily cron passes for the pending-deletion orphan-claim flow.
//
// Two passes per run:
//   - Pass 1: send the day-before reminder email to gifters (and partners)
//     with un-acked orphan claims whose parent list's event date is
//     exactly one day from today (or, for wishlists with no event date,
//     13 days after the deletion timestamp). Each claim's reminder is
//     idempotent via `giftedItems.orphanReminderSentAt`.
//   - Pass 2: hard-delete claims (and the parent item if the last claim)
//     for orphans whose parent list's event date is today (or, for
//     wishlists, 14+ days after deletion). This clears the gifter's
//     view by the time the recipient's event arrives.
//
// Wired into `runBirthdayEmails` (the existing daily outbound-mail tick).

import { eq, isNotNull } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { giftedItems, items, users } from '@/db/schema'
import { customHolidayNextOccurrence } from '@/lib/custom-holidays'
import { nextOccurrenceBySlug } from '@/lib/holidays'
import { createLogger } from '@/lib/logger'
import { resolveListRecipientName } from '@/lib/orphan-claims'
import { isEmailConfigured, sendOrphanClaimCleanupReminderEmail } from '@/lib/resend'
import { cleanupImageUrls } from '@/lib/storage/cleanup'

const orphanCronLog = createLogger('cron:orphan-claim-cleanup')

const WISHLIST_CLEANUP_OFFSET_DAYS = 14

type ListWithType = {
	id: number
	name: string
	type: string
	ownerId: string
	subjectDependentId: string | null
	holidayCountry: string | null
	holidayKey: string | null
	customHolidayId: string | null
}

type OrphanItem = {
	id: number
	title: string
	imageUrl: string | null
	listId: number
	pendingDeletionAt: Date
}

type OrphanClaim = {
	id: number
	itemId: number
	gifterId: string
	additionalGifterIds: Array<string> | null
	orphanReminderSentAt: Date | null
}

function startOfUtcDay(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

// Returns the upcoming event date for the list, or null when there is no
// event-anchored timeline (e.g. wishlist; gift-ideas is excluded
// elsewhere). Birthday lists key off the recipient's birth month/day; the
// recipient is the dependent for dependent-subject lists.
async function resolveListEventDate(dbx: SchemaDatabase, list: ListWithType, now: Date): Promise<Date | null> {
	if (list.type === 'christmas') {
		const year = now.getUTCFullYear()
		const candidate = new Date(Date.UTC(year, 11, 25))
		if (candidate.getTime() < startOfUtcDay(now).getTime()) {
			return new Date(Date.UTC(year + 1, 11, 25))
		}
		return candidate
	}
	if (list.type === 'birthday') {
		// Recipient is dependent (if subject-dependent) or owner.
		let birthMonth: string | null = null
		let birthDay: number | null = null
		if (list.subjectDependentId) {
			const dep = await dbx.query.dependents.findFirst({
				where: (d, { eq: e }) => e(d.id, list.subjectDependentId!),
				columns: { birthMonth: true, birthDay: true },
			})
			birthMonth = dep?.birthMonth ?? null
			birthDay = dep?.birthDay ?? null
		} else {
			const owner = await dbx.query.users.findFirst({
				where: eq(users.id, list.ownerId),
				columns: { birthMonth: true, birthDay: true },
			})
			birthMonth = owner?.birthMonth ?? null
			birthDay = owner?.birthDay ?? null
		}
		if (!birthMonth || !birthDay) return null
		const monthIdx = MONTH_TO_IDX[birthMonth]
		const year = now.getUTCFullYear()
		let candidate = new Date(Date.UTC(year, monthIdx, birthDay))
		if (candidate.getTime() < startOfUtcDay(now).getTime()) {
			candidate = new Date(Date.UTC(year + 1, monthIdx, birthDay))
		}
		return candidate
	}
	if (list.type === 'holiday') {
		// Prefer the customHolidayId path; fall back to legacy
		// (country, key) pair to mirror the auto-archive resolver.
		if (list.customHolidayId) {
			const row = await dbx.query.customHolidays.findFirst({
				where: (h, { eq: e }) => e(h.id, list.customHolidayId!),
			})
			if (!row) return null
			return await customHolidayNextOccurrence(row, now, dbx)
		}
		if (list.holidayCountry && list.holidayKey) {
			return nextOccurrenceBySlug(list.holidayCountry, list.holidayKey, now)
		}
	}
	return null
}

const MONTH_TO_IDX: Record<string, number> = {
	january: 0,
	february: 1,
	march: 2,
	april: 3,
	may: 4,
	june: 5,
	july: 6,
	august: 7,
	september: 8,
	october: 9,
	november: 10,
	december: 11,
}

// Returns the unique audience for a single claim: primary gifter and
// their partner. Co-gifters are silent in the orphan flow.
async function audienceForClaim(
	dbx: SchemaDatabase,
	claim: { gifterId: string }
): Promise<Array<{ id: string; name: string | null; email: string }>> {
	const gifter = await dbx.query.users.findFirst({
		where: eq(users.id, claim.gifterId),
		columns: { id: true, name: true, email: true, partnerId: true },
	})
	if (!gifter) return []
	const out = [{ id: gifter.id, name: gifter.name, email: gifter.email }]
	if (gifter.partnerId && gifter.partnerId !== gifter.id) {
		const partner = await dbx.query.users.findFirst({
			where: eq(users.id, gifter.partnerId),
			columns: { id: true, name: true, email: true },
		})
		if (partner) out.push({ id: partner.id, name: partner.name, email: partner.email })
	}
	return out
}

export type OrphanClaimCleanupResult = {
	remindersSent: number
	itemsDeleted: number
	claimsDeleted: number
}

export async function orphanClaimCleanupImpl(args: { db: SchemaDatabase; now: Date }): Promise<OrphanClaimCleanupResult> {
	const { db: dbx, now } = args
	let remindersSent = 0
	let itemsDeleted = 0
	let claimsDeleted = 0

	// Load every pending-deletion item plus its parent list and active
	// claims. The set is bounded by how many orphans the deployment has
	// outstanding, which is small in practice (rare event).
	const orphanRows = await dbx
		.select({
			id: items.id,
			title: items.title,
			imageUrl: items.imageUrl,
			listId: items.listId,
			pendingDeletionAt: items.pendingDeletionAt,
		})
		.from(items)
		.where(isNotNull(items.pendingDeletionAt))

	if (orphanRows.length === 0) return { remindersSent, itemsDeleted, claimsDeleted }

	const orphans: Array<OrphanItem> = []
	for (const r of orphanRows) {
		if (r.pendingDeletionAt) {
			orphans.push({ id: r.id, title: r.title, imageUrl: r.imageUrl, listId: r.listId, pendingDeletionAt: r.pendingDeletionAt })
		}
	}

	const listIds = Array.from(new Set(orphans.map(o => o.listId)))
	const listRows = await dbx.query.lists.findMany({
		where: (l, { inArray: ia }) => ia(l.id, listIds),
		columns: {
			id: true,
			name: true,
			type: true,
			ownerId: true,
			subjectDependentId: true,
			holidayCountry: true,
			holidayKey: true,
			customHolidayId: true,
		},
	})
	const listById = new Map<number, ListWithType>()
	for (const l of listRows) listById.set(l.id, l)

	const today = startOfUtcDay(now)
	const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)

	const emailConfigured = await isEmailConfigured()

	for (const orphan of orphans) {
		const list = listById.get(orphan.listId)
		if (!list) continue

		// Compute the cleanup date for this orphan. For event-anchored
		// list types it's the event date; for wishlists (no event), it's
		// 14 days after the recipient deleted the item. Other types
		// (giftideas/todos) shouldn't reach here - they don't accept the
		// claim flow that creates orphans - but we treat them as
		// "no cleanup" defensively.
		let cleanupDate: Date | null = null
		let eventLabel = ''
		if (list.type === 'wishlist') {
			cleanupDate = new Date(orphan.pendingDeletionAt.getTime() + WISHLIST_CLEANUP_OFFSET_DAYS * 24 * 60 * 60 * 1000)
			eventLabel = '14 days after deletion'
		} else {
			const eventDate = await resolveListEventDate(dbx, list, now)
			if (eventDate) {
				cleanupDate = startOfUtcDay(eventDate)
				if (list.type === 'christmas') eventLabel = 'Christmas'
				else if (list.type === 'birthday') eventLabel = 'their birthday'
				else if (list.type === 'holiday') eventLabel = 'the holiday'
			}
		}

		if (!cleanupDate) continue

		const isCleanupDay = startOfUtcDay(cleanupDate).getTime() <= today.getTime()
		const isReminderDay = !isCleanupDay && startOfUtcDay(cleanupDate).getTime() === tomorrow.getTime()

		const claims = (await dbx
			.select({
				id: giftedItems.id,
				itemId: giftedItems.itemId,
				gifterId: giftedItems.gifterId,
				additionalGifterIds: giftedItems.additionalGifterIds,
				orphanReminderSentAt: giftedItems.orphanReminderSentAt,
			})
			.from(giftedItems)
			.where(eq(giftedItems.itemId, orphan.id))) as Array<OrphanClaim>

		// Pass 2 (cleanup) wins over pass 1: if today is the event date,
		// hard-delete and skip the reminder.
		if (isCleanupDay) {
			try {
				await dbx.transaction(async tx => {
					await tx.delete(giftedItems).where(eq(giftedItems.itemId, orphan.id))
					await tx.delete(items).where(eq(items.id, orphan.id))
				})
				claimsDeleted += claims.length
				itemsDeleted += 1
				await cleanupImageUrls([orphan.imageUrl])
			} catch (err) {
				orphanCronLog.warn(
					{ err: err instanceof Error ? err.message : String(err), itemId: orphan.id, listId: list.id },
					'orphan cleanup failed for item'
				)
			}
			continue
		}

		// Pass 1 (reminder).
		if (!isReminderDay) continue
		if (!emailConfigured) continue

		const recipientName = await resolveListRecipientName(dbx, list)
		for (const claim of claims) {
			if (claim.orphanReminderSentAt) continue
			const audience = await audienceForClaim(dbx, claim)
			let sentAny = false
			for (const member of audience) {
				try {
					await sendOrphanClaimCleanupReminderEmail(member.email, {
						username: member.name || 'there',
						itemTitle: orphan.title,
						recipientName,
						eventLabel,
						listId: list.id,
						listName: list.name,
					})
					sentAny = true
					remindersSent += 1
				} catch (err) {
					orphanCronLog.warn(
						{ err: err instanceof Error ? err.message : String(err), recipient: member.email, itemId: orphan.id },
						'orphan reminder email failed'
					)
				}
			}
			if (sentAny) {
				await dbx.update(giftedItems).set({ orphanReminderSentAt: new Date() }).where(eq(giftedItems.id, claim.id))
			}
		}
	}

	return { remindersSent, itemsDeleted, claimsDeleted }
}

// Re-export the bound list type so the helper can be unit-tested with a
// minimal fixture in the future.
export type { ListWithType as OrphanCleanupListInfo }
