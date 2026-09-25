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

import { makeDependent, makeDependentGuardianship, makeUser, makeUserRelationship } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { getUpcomingHolidaysImpl, resolveViewerDayMs } from '@/api/_widgets-impl'
import { appSettings, customHolidays, holidayCatalog, userRelationLabels, users } from '@/db/schema'

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

	describe("viewer's local day (`today`)", () => {
		// Dec 25, 6 PM in Los Angeles; already Dec 26 in UTC.
		const LA_XMAS_EVENING = new Date('2026-12-26T02:00:00Z')

		it('keeps a holiday that is still today for a viewer west of UTC', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				const me = await makeUser(tx)

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, today: '2026-12-25', now: LA_XMAS_EVENING, dbx: tx })
				expect(rows.find(r => r.id === 'christmas')).toMatchObject({ occurrenceStart: '2026-12-25T00:00:00.000Z', daysUntil: 0 })
			})
		})

		it('falls back to the UTC date when `today` is absent', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				const me = await makeUser(tx)

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, now: LA_XMAS_EVENING, dbx: tx })
				expect(rows.find(r => r.id === 'christmas')).toMatchObject({ occurrenceStart: '2027-12-25T00:00:00.000Z', daysUntil: 364 })
			})
		})

		it('drops a holiday that has passed for a viewer east of UTC, even while it is still that day in UTC', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				const me = await makeUser(tx)

				// Dec 26, 5 AM in Tokyo; still Dec 25 in UTC.
				const rows = await getUpcomingHolidaysImpl({ userId: me.id, today: '2026-12-26', now: new Date('2026-12-25T20:00:00Z'), dbx: tx })
				expect(rows.find(r => r.id === 'christmas')).toMatchObject({ occurrenceStart: '2027-12-25T00:00:00.000Z', daysUntil: 364 })
			})
		})

		it('counts daysUntil from the viewer day', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				const me = await makeUser(tx)

				// Christmas morning in Tokyo; Dec 24 in UTC.
				const rows = await getUpcomingHolidaysImpl({ userId: me.id, today: '2026-12-25', now: new Date('2026-12-24T20:00:00Z'), dbx: tx })
				expect(rows.find(r => r.id === 'christmas')?.daysUntil).toBe(0)
			})
		})

		it('applies the viewer day to catalog, custom, and anniversary occurrences', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				await enableAllTenantGates(tx)
				const partner = await makeUser(tx)
				const me = await makeUser(tx, { partnerId: partner.id })
				const mom = await makeUser(tx)
				await tx.insert(userRelationLabels).values({ userId: me.id, label: 'mother', targetUserId: mom.id })
				await tx.update(users).set({ partnerAnniversary: '2018-04-20' }).where(eq(users.id, me.id))
				const [ch] = await tx
					.insert(customHolidays)
					.values({ title: 'Founders Day', source: 'custom', customMonth: 3, customDay: 10, customYear: 2026 })
					.returning()

				// Each check is the evening of the holiday in Los Angeles (2 AM UTC the next day).
				// US Mother's Day 2026 is May 10.
				const mothers = await getUpcomingHolidaysImpl({
					userId: me.id,
					limit: 10,
					today: '2026-05-10',
					now: new Date('2026-05-11T02:00:00Z'),
					dbx: tx,
				})
				expect(mothers.find(r => r.id === 'mothers-day:US')).toMatchObject({ occurrenceStart: '2026-05-10T00:00:00.000Z', daysUntil: 0 })

				const anniv = await getUpcomingHolidaysImpl({
					userId: me.id,
					limit: 10,
					today: '2026-04-20',
					now: new Date('2026-04-21T02:00:00Z'),
					dbx: tx,
				})
				expect(anniv.find(r => r.id === `anniversary:${me.id}`)).toMatchObject({
					occurrenceStart: '2026-04-20T00:00:00.000Z',
					daysUntil: 0,
				})

				const custom = await getUpcomingHolidaysImpl({
					userId: me.id,
					limit: 10,
					today: '2026-03-10',
					now: new Date('2026-03-11T02:00:00Z'),
					dbx: tx,
				})
				expect(custom.find(r => r.id === `custom:${ch.id}`)).toMatchObject({ occurrenceStart: '2026-03-10T00:00:00.000Z', daysUntil: 0 })
			})
		})

		it('measures the horizon from the viewer day', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				const me = await makeUser(tx)
				// NOW is Mar 1 in UTC; the viewer is already on Mar 2, so Christmas is 298 days out.
				const within = await getUpcomingHolidaysImpl({ userId: me.id, horizonDays: 298, today: '2026-03-02', now: NOW, dbx: tx })
				expect(within.map(r => r.id)).toEqual(['christmas'])
				expect(await getUpcomingHolidaysImpl({ userId: me.id, horizonDays: 297, today: '2026-03-02', now: NOW, dbx: tx })).toEqual([])
			})
		})

		it('falls back to the UTC date for a malformed, impossible, or out-of-range `today`', () => {
			const utcDay = Date.UTC(2026, 11, 26)
			expect(resolveViewerDayMs('2026-12-25', LA_XMAS_EVENING)).toBe(Date.UTC(2026, 11, 25))
			expect(resolveViewerDayMs('2026-12-27', LA_XMAS_EVENING)).toBe(Date.UTC(2026, 11, 27))
			expect(resolveViewerDayMs(undefined, LA_XMAS_EVENING)).toBe(utcDay)
			expect(resolveViewerDayMs('garbage', LA_XMAS_EVENING)).toBe(utcDay)
			expect(resolveViewerDayMs('2026-2-3', LA_XMAS_EVENING)).toBe(utcDay)
			expect(resolveViewerDayMs('2027-02-30', new Date('2027-03-01T12:00:00Z'))).toBe(Date.UTC(2027, 2, 1))
			expect(resolveViewerDayMs('2026-12-24', LA_XMAS_EVENING)).toBe(utcDay)
			expect(resolveViewerDayMs('2026-12-28', LA_XMAS_EVENING)).toBe(utcDay)
		})
	})

	describe('recipient gating for custom_holidays rows', () => {
		it('shows a recipient-bound row to the recipient themselves', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				const recipient = await makeUser(tx)
				const [ch] = await tx
					.insert(customHolidays)
					.values({
						title: "Recipient's Day",
						source: 'custom',
						customMonth: 3,
						customDay: 10,
						customYear: null,
						recipientUserId: recipient.id,
					})
					.returning()

				const rows = await getUpcomingHolidaysImpl({ userId: recipient.id, now: NOW, dbx: tx })
				expect(rows.find(r => r.id === `custom:${ch.id}`)).toBeDefined()
			})
		})

		it('shows a recipient-bound row to a default-allow viewer', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				const recipient = await makeUser(tx)
				const viewer = await makeUser(tx)
				const [ch] = await tx
					.insert(customHolidays)
					.values({
						title: "Recipient's Day",
						source: 'custom',
						customMonth: 3,
						customDay: 10,
						customYear: null,
						recipientUserId: recipient.id,
					})
					.returning()

				const rows = await getUpcomingHolidaysImpl({ userId: viewer.id, now: NOW, dbx: tx })
				expect(rows.find(r => r.id === `custom:${ch.id}`)).toBeDefined()
			})
		})

		it('hides a recipient-bound row from a viewer the recipient denied', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				const recipient = await makeUser(tx)
				const blocked = await makeUser(tx)
				await makeUserRelationship(tx, { ownerUserId: recipient.id, viewerUserId: blocked.id, accessLevel: 'none' })
				const [ch] = await tx
					.insert(customHolidays)
					.values({
						title: "Recipient's Day",
						source: 'custom',
						customMonth: 3,
						customDay: 10,
						customYear: null,
						recipientUserId: recipient.id,
					})
					.returning()

				const rows = await getUpcomingHolidaysImpl({ userId: blocked.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.find(r => r.id === `custom:${ch.id}`)).toBeUndefined()
			})
		})

		it('shows a dependent-recipient row to a guardian of the dependent', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				const guardian = await makeUser(tx)
				const dep = await makeDependent(tx, { createdByUserId: guardian.id })
				await makeDependentGuardianship(tx, { guardianUserId: guardian.id, dependentId: dep.id })
				const [ch] = await tx
					.insert(customHolidays)
					.values({
						title: "Mochi's Birthday",
						source: 'custom',
						customMonth: 3,
						customDay: 10,
						customYear: null,
						recipientDependentId: dep.id,
					})
					.returning()

				const rows = await getUpcomingHolidaysImpl({ userId: guardian.id, now: NOW, dbx: tx })
				expect(rows.find(r => r.id === `custom:${ch.id}`)).toBeDefined()
			})
		})

		it('hides a dependent-recipient row from a viewer the guardian denied', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				const guardian = await makeUser(tx)
				const blocked = await makeUser(tx)
				const dep = await makeDependent(tx, { createdByUserId: guardian.id })
				await makeDependentGuardianship(tx, { guardianUserId: guardian.id, dependentId: dep.id })
				await makeUserRelationship(tx, { ownerUserId: guardian.id, viewerUserId: blocked.id, accessLevel: 'none' })
				const [ch] = await tx
					.insert(customHolidays)
					.values({
						title: "Mochi's Birthday",
						source: 'custom',
						customMonth: 3,
						customDay: 10,
						customYear: null,
						recipientDependentId: dep.id,
					})
					.returning()

				const rows = await getUpcomingHolidaysImpl({ userId: blocked.id, limit: 10, now: NOW, dbx: tx })
				expect(rows.find(r => r.id === `custom:${ch.id}`)).toBeUndefined()
			})
		})

		it('broadcasts a row with no recipient to every user (existing behavior)', async () => {
			await withRollback(async tx => {
				await seedRelationshipCatalog(tx)
				const someone = await makeUser(tx)
				const [ch] = await tx
					.insert(customHolidays)
					.values({ title: 'Easter', source: 'custom', customMonth: 3, customDay: 10, customYear: null })
					.returning()

				const rows = await getUpcomingHolidaysImpl({ userId: someone.id, now: NOW, dbx: tx })
				expect(rows.find(r => r.id === `custom:${ch.id}`)).toBeDefined()
			})
		})
	})
})
