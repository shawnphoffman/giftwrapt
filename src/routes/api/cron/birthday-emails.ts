import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'

import { db } from '@/db'
import { giftedItems, items, lists, users } from '@/db/schema'
import type { BirthMonth } from '@/db/schema/enums'
import { env } from '@/env'
import { sendBirthdayEmail, sendPostBirthdayEmail } from '@/lib/resend'
import { getAppSettings } from '@/lib/settings'

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
	'january', 'february', 'march', 'april', 'may', 'june',
	'july', 'august', 'september', 'october', 'november', 'december',
]

const FOLLOW_UP_DAYS = 14

export const Route = createFileRoute('/api/cron/birthday-emails')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				// Verify cron secret.
				const cronSecret = env.CRON_SECRET
				if (cronSecret) {
					const authHeader = request.headers.get('authorization')
					if (authHeader !== `Bearer ${cronSecret}`) {
						return json({ error: 'Unauthorized' }, { status: 401 })
					}
				}

				const settings = await getAppSettings(db)
				if (!settings.enableBirthdayEmails) {
					return json({ ok: true, skipped: 'birthday emails disabled', date: new Date().toISOString() })
				}

				const now = new Date()
				const todayMonth = MONTHS[now.getMonth()]
				const todayDay = now.getDate()

				// === Day-of birthday emails ===
				const birthdayUsers = await db.query.users.findMany({
					where: and(
						eq(users.birthMonth, todayMonth),
						eq(users.birthDay, todayDay),
						eq(users.banned, false)
					),
					columns: { id: true, name: true, email: true },
				})

				const sent: string[] = []
				for (const user of birthdayUsers) {
					try {
						await sendBirthdayEmail(user.name || 'there', user.email)
						sent.push(user.email)
					} catch (err) {
						console.error(`Failed to send birthday email to ${user.email}:`, err)
					}
				}

				// === Follow-up emails (14 days after birthday) ===
				const followUpDate = new Date(now)
				followUpDate.setDate(followUpDate.getDate() - FOLLOW_UP_DAYS)
				const followUpMonth = MONTHS[followUpDate.getMonth()]
				const followUpDay = followUpDate.getDate()

				const followUpUsers = await db.query.users.findMany({
					where: and(
						eq(users.birthMonth, followUpMonth),
						eq(users.birthDay, followUpDay),
						eq(users.banned, false)
					),
					columns: { id: true, name: true, email: true },
				})

				const followUpSent: string[] = []
				for (const user of followUpUsers) {
					try {
						// Fetch archived gifted items on this user's lists.
						const archivedGifts = await db
							.select({
								itemTitle: items.title,
								itemImageUrl: items.imageUrl,
								gifterName: users.name,
								gifterEmail: users.email,
							})
							.from(giftedItems)
							.innerJoin(items, and(eq(items.id, giftedItems.itemId), eq(items.isArchived, true)))
							.innerJoin(lists, and(eq(lists.id, items.listId), eq(lists.ownerId, user.id)))
							.innerJoin(users, eq(users.id, giftedItems.gifterId))

						if (archivedGifts.length === 0) continue

						// Group by item.
						const itemMap = new Map<string, { title: string; image_url: string; gifters: string[] }>()
						for (const gift of archivedGifts) {
							const key = gift.itemTitle
							if (!itemMap.has(key)) {
								itemMap.set(key, {
									title: gift.itemTitle,
									image_url: gift.itemImageUrl || 'https://placehold.co/80x80?text=Gift',
									gifters: [],
								})
							}
							itemMap.get(key)!.gifters.push(gift.gifterName || gift.gifterEmail)
						}

						await sendPostBirthdayEmail(user.email, Array.from(itemMap.values()))
						followUpSent.push(user.email)
					} catch (err) {
						console.error(`Failed to send post-birthday email to ${user.email}:`, err)
					}
				}

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
