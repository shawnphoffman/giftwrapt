// Server-only impl for the /api/cron/birthday-emails route. Lives
// outside the routes folder so integration tests can drive the
// email-selection logic with a transactional `db` (per-test savepoint
// via withRollback) while the email-send side-effects get vi.mock'd at
// the resend module boundary.

import { and, eq } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { giftedItems, items, lists, users } from '@/db/schema'
import type { BirthMonth } from '@/db/schema/enums'
import { buildPostBirthdayEmailItems } from '@/lib/cron/reveal-emails'
import { fanOutToGuardians } from '@/lib/guardian-emails'
import { visibleItemsWhere } from '@/lib/item-visibility'
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
		await fanOutToGuardians(db, user.id, g => sendBirthdayEmail(user.name || 'there', g.email))
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
				.innerJoin(items, and(eq(items.id, giftedItems.itemId), visibleItemsWhere('revealed')))
				.innerJoin(lists, and(eq(lists.id, items.listId), eq(lists.ownerId, user.id)))

			if (archivedGifts.length === 0) continue

			const emailItems = await buildPostBirthdayEmailItems(db, archivedGifts)
			if (emailItems.length === 0) continue

			await sendPostBirthdayEmail(user.email, emailItems)
			followUpSent += 1
			await fanOutToGuardians(db, user.id, g => sendPostBirthdayEmail(g.email, emailItems))
		} catch {
			// Same per-recipient swallow as above.
		}
	}

	return { birthdayEmails: birthdaySent, followUpEmails: followUpSent }
}
