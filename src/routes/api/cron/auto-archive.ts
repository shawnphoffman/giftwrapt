import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db'
import { giftedItems, items, lists, users } from '@/db/schema'
import type { BirthMonth } from '@/db/schema/enums'
import { env } from '@/env'
import { createLogger } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings'

const cronLog = createLogger('cron:auto-archive')

// ===============================
// Auto-archive cron job
// ===============================
// Called daily. Archives claimed items whose "reveal date" has passed:
//
// 1. Birthday lists: archive N days after the list owner's birthday.
//    Only affects items with at least one claim (unclaimed items stay).
//
// 2. Christmas lists: archive N days after Dec 25.
//    Same claim-only logic.
//
// "Archive" means setting items.isArchived = true, which reveals
// gifter info to the recipient on their Received Gifts page.
//
// Protected by CRON_SECRET header check.

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

export const Route = createFileRoute('/api/cron/auto-archive')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const started = Date.now()
				cronLog.info('cron run starting')

				const cronSecret = env.CRON_SECRET
				if (cronSecret) {
					const authHeader = request.headers.get('authorization')
					if (authHeader !== `Bearer ${cronSecret}`) {
						cronLog.warn('unauthorized cron invocation')
						return json({ error: 'Unauthorized' }, { status: 401 })
					}
				}

				const settings = await getAppSettings(db)
				const now = new Date()

				let birthdayArchived = 0
				let christmasArchived = 0

				// === Birthday auto-archive ===
				// Find users whose birthday was exactly N days ago.
				// Archive all claimed, non-archived items on their birthday-type lists.
				const birthdayDate = new Date(now)
				birthdayDate.setDate(birthdayDate.getDate() - settings.archiveDaysAfterBirthday)
				const bMonth = MONTHS[birthdayDate.getMonth()]
				const bDay = birthdayDate.getDate()

				const birthdayUsers = await db.query.users.findMany({
					where: and(eq(users.birthMonth, bMonth), eq(users.birthDay, bDay)),
					columns: { id: true },
				})

				for (const user of birthdayUsers) {
					// Find birthday-type lists owned by this user.
					const userLists = await db.query.lists.findMany({
						where: and(eq(lists.ownerId, user.id), eq(lists.isActive, true), inArray(lists.type, ['birthday', 'wishlist'])),
						columns: { id: true },
					})

					if (userLists.length === 0) continue

					const listIds = userLists.map(l => l.id)

					// Find non-archived items on these lists that have at least one claim.
					const claimedItemIds = await db
						.selectDistinct({ itemId: giftedItems.itemId })
						.from(giftedItems)
						.innerJoin(items, and(eq(items.id, giftedItems.itemId), eq(items.isArchived, false), inArray(items.listId, listIds)))

					if (claimedItemIds.length === 0) continue

					const ids = claimedItemIds.map(r => r.itemId)
					await db.update(items).set({ isArchived: true }).where(inArray(items.id, ids))
					birthdayArchived += ids.length
				}

				// === Christmas auto-archive ===
				// Archive claimed items on christmas-type lists N days after Dec 25.
				const christmasDate = new Date(now.getFullYear(), 11, 25) // Dec 25 this year
				// If we're before Dec 25, check last year's Christmas.
				if (now < christmasDate) {
					christmasDate.setFullYear(christmasDate.getFullYear() - 1)
				}

				const daysSinceChristmas = Math.floor((now.getTime() - christmasDate.getTime()) / (1000 * 60 * 60 * 24))

				if (daysSinceChristmas === settings.archiveDaysAfterChristmas) {
					const christmasLists = await db.query.lists.findMany({
						where: and(eq(lists.type, 'christmas'), eq(lists.isActive, true)),
						columns: { id: true },
					})

					if (christmasLists.length > 0) {
						const listIds = christmasLists.map(l => l.id)

						const claimedItemIds = await db
							.selectDistinct({ itemId: giftedItems.itemId })
							.from(giftedItems)
							.innerJoin(items, and(eq(items.id, giftedItems.itemId), eq(items.isArchived, false), inArray(items.listId, listIds)))

						if (claimedItemIds.length > 0) {
							const ids = claimedItemIds.map(r => r.itemId)
							await db.update(items).set({ isArchived: true }).where(inArray(items.id, ids))
							christmasArchived += ids.length
						}
					}
				}

				cronLog.info(
					{
						birthdayArchived,
						christmasArchived,
						durationMs: Date.now() - started,
					},
					'cron run complete'
				)

				return json({
					ok: true,
					birthdayArchived,
					christmasArchived,
					settings: {
						archiveDaysAfterBirthday: settings.archiveDaysAfterBirthday,
						archiveDaysAfterChristmas: settings.archiveDaysAfterChristmas,
					},
					date: now.toISOString(),
				})
			},
		},
	},
})
