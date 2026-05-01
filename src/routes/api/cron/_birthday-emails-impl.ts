// Server-only impl for the /api/cron/birthday-emails route. Lives in a
// separate file so integration tests can drive the email-selection
// logic with a transactional `db` (per-test savepoint via withRollback)
// while the email-send side-effects get vi.mock'd at the resend module
// boundary.

import { and, eq, inArray } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { giftedItems, items, lists, users } from '@/db/schema'
import type { BirthMonth } from '@/db/schema/enums'
import { formatGifterNames, namesForGifter, type PartneredUser } from '@/lib/gifters'
import { sendBirthdayEmail, sendPostBirthdayEmail } from '@/lib/resend'

const MONTHS: ReadonlyArray<BirthMonth> = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december',
]

const FOLLOW_UP_DAYS = 14

export type BirthdayEmailsResult = {
	birthdayEmails: number
	followUpEmails: number
}

type Args = {
	db: SchemaDatabase
	now: Date
}

export async function birthdayEmailsImpl({ db, now }: Args): Promise<BirthdayEmailsResult> {
	const todayMonth = MONTHS[now.getMonth()]
	const todayDay = now.getDate()

	// === Day-of birthday emails ===
	const birthdayUsers = await db.query.users.findMany({
		where: and(eq(users.birthMonth, todayMonth), eq(users.birthDay, todayDay), eq(users.banned, false)),
		columns: { id: true, name: true, email: true },
	})

	let birthdaySent = 0
	for (const user of birthdayUsers) {
		try {
			await sendBirthdayEmail(user.name || 'there', user.email)
			birthdaySent += 1
		} catch {
			// Caller (handler) is responsible for logging; swallow here so a
			// single bad recipient doesn't kill the whole batch.
		}
	}

	// === Follow-up emails (14 days after birthday) ===
	const followUpDate = new Date(now)
	followUpDate.setDate(followUpDate.getDate() - FOLLOW_UP_DAYS)
	const followUpMonth = MONTHS[followUpDate.getMonth()]
	const followUpDay = followUpDate.getDate()

	const followUpUsers = await db.query.users.findMany({
		where: and(eq(users.birthMonth, followUpMonth), eq(users.birthDay, followUpDay), eq(users.banned, false)),
		columns: { id: true, name: true, email: true },
	})

	let followUpSent = 0
	for (const user of followUpUsers) {
		try {
			const archivedGifts = await db
				.select({
					itemTitle: items.title,
					itemImageUrl: items.imageUrl,
					gifterId: giftedItems.gifterId,
					additionalGifterIds: giftedItems.additionalGifterIds,
				})
				.from(giftedItems)
				.innerJoin(items, and(eq(items.id, giftedItems.itemId), eq(items.isArchived, true)))
				.innerJoin(lists, and(eq(lists.id, items.listId), eq(lists.ownerId, user.id)))

			if (archivedGifts.length === 0) continue

			const gifterIds = new Set<string>()
			for (const gift of archivedGifts) {
				gifterIds.add(gift.gifterId)
				for (const id of gift.additionalGifterIds ?? []) gifterIds.add(id)
			}
			const lookup = new Map<string, PartneredUser>()
			if (gifterIds.size > 0) {
				const rows = await db
					.select({ id: users.id, name: users.name, email: users.email, partnerId: users.partnerId })
					.from(users)
					.where(inArray(users.id, Array.from(gifterIds)))
				for (const r of rows) lookup.set(r.id, r)
			}
			const partnerIds = new Set<string>()
			for (const u of lookup.values()) {
				if (u.partnerId && !lookup.has(u.partnerId)) partnerIds.add(u.partnerId)
			}
			if (partnerIds.size > 0) {
				const rows = await db
					.select({ id: users.id, name: users.name, email: users.email, partnerId: users.partnerId })
					.from(users)
					.where(inArray(users.id, Array.from(partnerIds)))
				for (const r of rows) lookup.set(r.id, r)
			}

			const itemMap = new Map<string, { title: string; image_url: string; names: Array<string> }>()
			for (const gift of archivedGifts) {
				const key = gift.itemTitle
				if (!itemMap.has(key)) {
					itemMap.set(key, {
						title: gift.itemTitle,
						image_url: gift.itemImageUrl || 'https://placehold.co/80x80?text=Gift',
						names: [],
					})
				}
				const bucket = itemMap.get(key)!
				for (const name of namesForGifter(gift.gifterId, lookup)) bucket.names.push(name)
				for (const id of gift.additionalGifterIds ?? []) {
					for (const name of namesForGifter(id, lookup)) bucket.names.push(name)
				}
			}

			const emailItems = Array.from(itemMap.values()).map(i => ({
				title: i.title,
				image_url: i.image_url,
				gifters: formatGifterNames(i.names),
			}))

			await sendPostBirthdayEmail(user.email, emailItems)
			followUpSent += 1
		} catch {
			// Same per-recipient swallow as above.
		}
	}

	return { birthdayEmails: birthdaySent, followUpEmails: followUpSent }
}
