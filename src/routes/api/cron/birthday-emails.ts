import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db'
import { giftedItems, items, lists, users } from '@/db/schema'
import type { BirthMonth } from '@/db/schema/enums'
import { env } from '@/env'
import { formatGifterNames, namesForGifter, type PartneredUser } from '@/lib/gifters'
import { createLogger } from '@/lib/logger'
import { isEmailConfigured, sendBirthdayEmail, sendPostBirthdayEmail } from '@/lib/resend'
import { getAppSettings } from '@/lib/settings-loader'

const cronLog = createLogger('cron:birthday-emails')

// ===============================
// Birthday email cron job
// ===============================
// Called daily (e.g. via Vercel Cron or external scheduler).
// Two actions:
//   1. Day-of: send "Happy Birthday" to users whose birthday is today.
//   2. Follow-up: 14 days after birthday, send "what you got" summary
//      with archived gifted items.
//
// Protected by CRON_SECRET header check to prevent public access.

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

export const Route = createFileRoute('/api/cron/birthday-emails')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const started = Date.now()
				cronLog.info('cron run starting')

				// Verify cron secret.
				const cronSecret = env.CRON_SECRET
				if (cronSecret) {
					const authHeader = request.headers.get('authorization')
					if (authHeader !== `Bearer ${cronSecret}`) {
						cronLog.warn('unauthorized cron invocation')
						return json({ error: 'Unauthorized' }, { status: 401 })
					}
				}

				if (!(await isEmailConfigured())) {
					cronLog.info('skipped: email not configured')
					return json({ ok: true, skipped: 'email not configured', date: new Date().toISOString() })
				}

				const settings = await getAppSettings(db)
				if (!settings.enableBirthdayEmails) {
					cronLog.info('skipped: birthday emails disabled in settings')
					return json({ ok: true, skipped: 'birthday emails disabled', date: new Date().toISOString() })
				}

				const now = new Date()
				const todayMonth = MONTHS[now.getMonth()]
				const todayDay = now.getDate()

				// === Day-of birthday emails ===
				const birthdayUsers = await db.query.users.findMany({
					where: and(eq(users.birthMonth, todayMonth), eq(users.birthDay, todayDay), eq(users.banned, false)),
					columns: { id: true, name: true, email: true },
				})

				cronLog.debug({ count: birthdayUsers.length }, 'birthday recipients found')

				const sent: Array<string> = []
				for (const user of birthdayUsers) {
					try {
						await sendBirthdayEmail(user.name || 'there', user.email)
						sent.push(user.email)
					} catch (err) {
						cronLog.error({ err, recipient: user.email }, 'failed to send birthday email')
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

				const followUpSent: Array<string> = []
				for (const user of followUpUsers) {
					try {
						// Fetch archived gifted items on this user's lists along with
						// co-gifter IDs so we can credit everyone who chipped in.
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

						// Resolve names for every gifter + co-gifter, then expand to
						// include each gifter's partner so "Alice" becomes "Alice & Bob".
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

						// Group by item; accumulate every crediting name across claims.
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
						followUpSent.push(user.email)
					} catch (err) {
						cronLog.error({ err, recipient: user.email }, 'failed to send post-birthday email')
					}
				}

				cronLog.info(
					{
						birthdayEmails: sent.length,
						followUpEmails: followUpSent.length,
						durationMs: Date.now() - started,
					},
					'cron run complete'
				)

				return json({
					ok: true,
					birthdayEmails: sent.length,
					followUpEmails: followUpSent.length,
					date: now.toISOString(),
				})
			},
		},
	},
})
