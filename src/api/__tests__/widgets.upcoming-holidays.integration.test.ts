// Integration coverage for `getUpcomingHolidaysImpl`. The feed is
// per-user and holiday-centric, capped at the closest N. Sources:
//   - Admin-curated `custom_holidays` (catalog + custom).
//   - Hard-coded gift-giving holidays, each gated on whether the
//     signed-in user has someone to celebrate with - Mother's/Father's
//     Day on `userRelationLabels`, Valentine's on `partnerId`, Christmas
//     universal.
//   - Per-user `users.partnerAnniversary` when both that AND
//     `partnerId` are set.
//
// Dedup is by UTC (month, day): custom rows beat hardcoded so an admin
// override always wins.

import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { getUpcomingHolidaysImpl } from '@/api/_widgets-impl'
import { appSettings, customHolidays, holidayCatalog, userRelationLabels, users } from '@/db/schema'

import { makeUser } from '../../../test/integration/factories'
import { withRollback } from '../../../test/integration/setup'

// Pin "now" to a moment well before Mother's Day / Father's Day in the
// US (May 10 and June 21 2026 respectively) so the per-arm catalog
// math has a stable next-occurrence to find. Christmas (Dec 25),
// Valentine's (Feb 14 next year), anniversary if set.
const NOW = new Date('2026-03-01T12:00:00Z')

// `relationshipRemindersCountry` defaults to 'US' so Mother's/Father's
// Day catalog rows need seeding. The catalog seeder is idempotent.
async function seedRelationshipCatalog(tx: any) {
	await tx
		.insert(holidayCatalog)
		.values([
			{ country: 'US', slug: 'mothers-day', name: "Mother's Day", rule: '2nd sunday in May', isEnabled: true },
			{ country: 'US', slug: 'fathers-day', name: "Father's Day", rule: '3rd sunday in June', isEnabled: true },
			// UK's Mother's Day equivalent is Mothering Sunday on a
			// different date. Seed it under the same slug the production
			// seed uses so the slug map in `lib/holidays.ts` is the only
			// thing the cron/widget rely on to do the routing.
			{ country: 'GB', slug: 'mothering-sunday', name: 'Mothering Sunday', rule: 'easter -21', isEnabled: true },
			{ country: 'GB', slug: 'fathers-day', name: "Father's Day", rule: '3rd sunday in June', isEnabled: true },
		])
		.onConflictDoNothing()
}

// `app_settings` is a key/value table; one row per setting. Loader merges
// with DEFAULT_APP_SETTINGS at read time. The defaults enable Christmas
// + generic holidays but DISABLE every other reminder family, so most
// tests need to flip the relevant toggles on.
async function setSetting(tx: any, key: string, value: unknown) {
	await tx.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } })
}

// Helper for tests that want every tenant toggle the widget reads to be
// ON. Keeps each per-user-gating test focused on user state without
// having to repeat the tenant-toggle setup.
async function enableAllTenantGates(tx: any) {
	for (const key of [
		'enableChristmasLists',
		'enableGenericHolidayLists',
		'enableMothersDayReminders',
		'enableFathersDayReminders',
		'enableValentinesDayReminders',
		'enableAnniversaryReminders',
	]) {
		await setSetting(tx, key, true)
	}
}

describe('getUpcomingHolidaysImpl', () => {
	describe('baseline (no relations, no partner, no custom)', () => {
		it('returns only Christmas for an unpartnered user with no relation labels', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				const me = await makeUser(tx)

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.map(r => r.id)).toEqual(['christmas'])
				expect(rows[0]?.daysUntil).toBe(299)
			})
		})
	})

	describe("Mother's / Father's Day per-user gating (tenant gates ON)", () => {
		it("surfaces Mother's Day only when the user has a `mother` relation label", async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				await enableAllTenantGates(tx)
				const me = await makeUser(tx)
				const mom = await makeUser(tx)
				await tx.insert(userRelationLabels).values({ userId: me.id, label: 'mother', targetUserId: mom.id })

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.find(r => r.id === 'mothers-day:US')).toBeDefined()
				expect(rows.find(r => r.id === 'fathers-day:US')).toBeUndefined()
			})
		})

		it("surfaces Father's Day only when the user has a `father` relation label", async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				await enableAllTenantGates(tx)
				const me = await makeUser(tx)
				const dad = await makeUser(tx)
				await tx.insert(userRelationLabels).values({ userId: me.id, label: 'father', targetUserId: dad.id })

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.find(r => r.id === 'fathers-day:US')).toBeDefined()
				expect(rows.find(r => r.id === 'mothers-day:US')).toBeUndefined()
			})
		})

		it("resolves Mother's Day in GB via the `mothering-sunday` slug map", async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				await enableAllTenantGates(tx)
				await setSetting(tx, 'relationshipRemindersCountry', 'GB')
				const me = await makeUser(tx)
				const mom = await makeUser(tx)
				await tx.insert(userRelationLabels).values({ userId: me.id, label: 'mother', targetUserId: mom.id })

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				// GB Mother's Day in 2026 = Mothering Sunday = 21 days before
				// Easter (Apr 5 2026) = Mar 15 2026 = 14 days from NOW.
				const md = rows.find(r => r.id === 'mothers-day:GB')
				expect(md).toBeDefined()
				expect(md?.daysUntil).toBe(14)
			})
		})

		it("does not surface Mother's Day for someone else's relation labels", async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				await enableAllTenantGates(tx)
				const me = await makeUser(tx)
				const stranger = await makeUser(tx)
				const mom = await makeUser(tx)
				await tx.insert(userRelationLabels).values({ userId: stranger.id, label: 'mother', targetUserId: mom.id })

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.find(r => r.id === 'mothers-day:US')).toBeUndefined()
			})
		})
	})

	describe("Valentine's Day + anniversary per-user gating (tenant gates ON)", () => {
		it("surfaces Valentine's Day only when the user has a partner", async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				await enableAllTenantGates(tx)
				const partner = await makeUser(tx)
				const me = await makeUser(tx, { partnerId: partner.id })

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.find(r => r.id === 'valentines')).toBeDefined()
			})
		})

		it("omits Valentine's Day when the user is unpartnered", async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				await enableAllTenantGates(tx)
				const me = await makeUser(tx)

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.find(r => r.id === 'valentines')).toBeUndefined()
			})
		})

		it('surfaces the anniversary when partnerId AND partnerAnniversary are set', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				await enableAllTenantGates(tx)
				const partner = await makeUser(tx)
				const me = await makeUser(tx, { partnerId: partner.id })
				await tx.update(users).set({ partnerAnniversary: '2018-04-20' }).where(eq(users.id, me.id))

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				const anniv = rows.find(r => r.id === `anniversary:${me.id}`)
				expect(anniv).toBeDefined()
				expect(anniv?.daysUntil).toBe(50)
			})
		})

		it('omits the anniversary when partnerAnniversary is set but the user is no longer partnered', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				await enableAllTenantGates(tx)
				const me = await makeUser(tx)
				// Stale anniversary value with no current partner (e.g. partner
				// cleared but anniversary column not yet wiped). The widget
				// should not leak this forward as a celebration.
				await tx.update(users).set({ partnerAnniversary: '2018-04-20' }).where(eq(users.id, me.id))

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.find(r => r.id.startsWith('anniversary:'))).toBeUndefined()
			})
		})

		it("does not surface anyone else's anniversary", async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				await enableAllTenantGates(tx)
				const me = await makeUser(tx)
				const strangerPartner = await makeUser(tx)
				const stranger = await makeUser(tx, { partnerId: strangerPartner.id })
				await tx.update(users).set({ partnerAnniversary: '2018-04-20' }).where(eq(users.id, stranger.id))

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.find(r => r.id.startsWith('anniversary:'))).toBeUndefined()
			})
		})
	})

	describe('tenant master toggles', () => {
		it('suppresses Christmas when `enableChristmasLists` is off', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				await enableAllTenantGates(tx)
				await setSetting(tx, 'enableChristmasLists', false)
				const me = await makeUser(tx)

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.find(r => r.id === 'christmas')).toBeUndefined()
			})
		})

		it("suppresses Valentine's Day when `enableValentinesDayReminders` is off, even for partnered users", async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				await enableAllTenantGates(tx)
				await setSetting(tx, 'enableValentinesDayReminders', false)
				const partner = await makeUser(tx)
				const me = await makeUser(tx, { partnerId: partner.id })

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.find(r => r.id === 'valentines')).toBeUndefined()
			})
		})

		it("suppresses Mother's Day when `enableMothersDayReminders` is off, even for users with a mother label", async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				await enableAllTenantGates(tx)
				await setSetting(tx, 'enableMothersDayReminders', false)
				const me = await makeUser(tx)
				const mom = await makeUser(tx)
				await tx.insert(userRelationLabels).values({ userId: me.id, label: 'mother', targetUserId: mom.id })

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.find(r => r.id === 'mothers-day:US')).toBeUndefined()
			})
		})

		it("suppresses Father's Day when `enableFathersDayReminders` is off, even for users with a father label", async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				await enableAllTenantGates(tx)
				await setSetting(tx, 'enableFathersDayReminders', false)
				const me = await makeUser(tx)
				const dad = await makeUser(tx)
				await tx.insert(userRelationLabels).values({ userId: me.id, label: 'father', targetUserId: dad.id })

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.find(r => r.id === 'fathers-day:US')).toBeUndefined()
			})
		})

		it('suppresses the anniversary when `enableAnniversaryReminders` is off, even when the user has one', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				await enableAllTenantGates(tx)
				await setSetting(tx, 'enableAnniversaryReminders', false)
				const partner = await makeUser(tx)
				const me = await makeUser(tx, { partnerId: partner.id })
				await tx.update(users).set({ partnerAnniversary: '2018-04-20' }).where(eq(users.id, me.id))

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.find(r => r.id.startsWith('anniversary:'))).toBeUndefined()
			})
		})

		it('suppresses every admin-curated `custom_holidays` row when `enableGenericHolidayLists` is off', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				await enableAllTenantGates(tx)
				await setSetting(tx, 'enableGenericHolidayLists', false)
				const me = await makeUser(tx)
				await tx.insert(customHolidays).values({ title: 'Founders Day', source: 'custom', customMonth: 3, customDay: 10, customYear: null })

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.find(r => r.source === 'custom')).toBeUndefined()
			})
		})

		it('returns nothing when every tenant toggle is off', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				for (const key of [
					'enableChristmasLists',
					'enableGenericHolidayLists',
					'enableMothersDayReminders',
					'enableFathersDayReminders',
					'enableValentinesDayReminders',
					'enableAnniversaryReminders',
				]) {
					await setSetting(tx, key, false)
				}
				const partner = await makeUser(tx)
				const me = await makeUser(tx, { partnerId: partner.id })
				const mom = await makeUser(tx)
				await tx.insert(userRelationLabels).values({ userId: me.id, label: 'mother', targetUserId: mom.id })
				await tx.update(users).set({ partnerAnniversary: '2018-04-20' }).where(eq(users.id, me.id))
				await tx.insert(customHolidays).values({ title: 'Founders Day', source: 'custom', customMonth: 3, customDay: 10, customYear: null })

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				expect(rows).toEqual([])
			})
		})
	})

	describe('Christmas (universal)', () => {
		it('surfaces Christmas for every user', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				const me = await makeUser(tx)

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.find(r => r.id === 'christmas')).toBeDefined()
				expect(rows.find(r => r.id === 'christmas')?.daysUntil).toBe(299)
			})
		})
	})

	describe('admin-curated custom_holidays', () => {
		it('surfaces every row regardless of user relations', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				const me = await makeUser(tx)
				const [ch] = await tx
					.insert(customHolidays)
					.values({ title: 'Founders Day', source: 'custom', customMonth: 3, customDay: 10, customYear: null })
					.returning()

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, now: NOW, dbx: tx })
				expect(rows[0]?.id).toBe(`custom:${ch.id}`)
				expect(rows[0]?.daysUntil).toBe(9)
			})
		})

		it('lets a custom_holiday override a hard-coded holiday on the same UTC (month, day)', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				const me = await makeUser(tx)
				const [ch] = await tx
					.insert(customHolidays)
					.values({ title: 'Family Christmas', source: 'custom', customMonth: 12, customDay: 25, customYear: null })
					.returning()

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.find(r => r.id === 'christmas')).toBeUndefined()
				expect(rows.find(r => r.id === `custom:${ch.id}`)).toBeDefined()
			})
		})

		it('drops a custom-source one-time date whose year has already passed', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				const me = await makeUser(tx)
				await tx.insert(customHolidays).values({ title: 'Wedding 2025', source: 'custom', customMonth: 9, customDay: 15, customYear: 2025 })

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.find(r => r.title === 'Wedding 2025')).toBeUndefined()
			})
		})
	})

	describe('sort + cap + horizon', () => {
		it('combines all sources and returns the closest `limit` rows by daysUntil', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				await enableAllTenantGates(tx)
				const partner = await makeUser(tx)
				const me = await makeUser(tx, { partnerId: partner.id })
				const mom = await makeUser(tx)
				await tx.insert(userRelationLabels).values({ userId: me.id, label: 'mother', targetUserId: mom.id })
				await tx.update(users).set({ partnerAnniversary: '2018-04-20' }).where(eq(users.id, me.id)) // 50 days
				// Founders Day, Mar 10 = 9 days.
				await tx.insert(customHolidays).values({ title: 'Founders Day', source: 'custom', customMonth: 3, customDay: 10, customYear: null })

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, now: NOW, dbx: tx })
				// Closest 3 in order: Founders Day (9d), Anniversary (50d), Mother's Day (70d).
				expect(rows.map(r => r.daysUntil)).toEqual([9, 50, 70])
			})
		})

		it('respects horizonDays when supplied', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				const me = await makeUser(tx)
				// 30-day horizon: Christmas (299 days) is the only hard-coded
				// row, and it's outside.
				const rows = await getUpcomingHolidaysImpl({ userId: me.id, horizonDays: 30, now: NOW, dbx: tx })
				expect(rows).toEqual([])
			})
		})

		it('returns an empty list when limit is zero or negative', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				const me = await makeUser(tx)
				expect(await getUpcomingHolidaysImpl({ userId: me.id, limit: 0, now: NOW, dbx: tx })).toEqual([])
				expect(await getUpcomingHolidaysImpl({ userId: me.id, limit: -1, now: NOW, dbx: tx })).toEqual([])
			})
		})
	})
})
