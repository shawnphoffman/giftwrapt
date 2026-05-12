// Integration coverage for `getUpcomingHolidaysImpl`. The unit tests in
// src/lib/__tests__/holidays cover the catalog math; this file covers the
// permission/visibility surface, recipient-identity rendering for
// dependent-subject lists, and the partner-credit path on lastGiftedAt.

import { describe, expect, it } from 'vitest'

import { getUpcomingHolidaysImpl } from '@/api/_widgets-impl'
import { customHolidays, holidayCatalog } from '@/db/schema'

import {
	makeDependent,
	makeDependentGuardianship,
	makeGiftedItem,
	makeItem,
	makeList,
	makeListEditor,
	makeUser,
	makeUserRelationship,
} from '../../../test/integration/factories'
import { withRollback } from '../../../test/integration/setup'

// Pin "now" to a moment well before Easter so the catalog math has a
// stable next-occurrence to find. Easter 2026 = Apr 5, ends Apr 6.
const NOW = new Date('2026-03-01T12:00:00Z')

describe('getUpcomingHolidaysImpl', () => {
	it('surfaces my own holiday list with daysUntil within the horizon', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx, { name: 'Me' })
			const list = await makeList(tx, {
				ownerId: me.id,
				type: 'holiday',
				holidayCountry: 'US',
				holidayKey: 'easter',
				isPrivate: false,
			})

			const rows = await getUpcomingHolidaysImpl({ userId: me.id, horizonDays: 60, now: NOW, dbx: tx })
			expect(rows).toHaveLength(1)
			expect(rows[0]?.listId).toBe(list.id)
			expect(rows[0]?.holidayName).toBe('Easter Sunday')
			expect(rows[0]?.ownedByMe).toBe(true)
			expect(rows[0]?.recipient).toEqual({ kind: 'user', id: me.id, name: 'Me', image: null })
			// Mar 1 -> Apr 5 = 35 days
			expect(rows[0]?.daysUntil).toBe(35)
		})
	})

	it('skips occurrences already stamped via lastHolidayArchiveAt', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			await makeList(tx, {
				ownerId: me.id,
				type: 'holiday',
				holidayCountry: 'US',
				holidayKey: 'easter',
				isPrivate: false,
				// Apr 5 has been archived; no point reminding for this year's
				// occurrence again.
				lastHolidayArchiveAt: new Date('2026-04-10T12:00:00Z'),
			})

			const rows = await getUpcomingHolidaysImpl({ userId: me.id, horizonDays: 60, now: NOW, dbx: tx })
			expect(rows).toEqual([])
		})
	})

	it('hides lists outside the horizon', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			await makeList(tx, {
				ownerId: me.id,
				type: 'holiday',
				holidayCountry: 'US',
				holidayKey: 'easter',
				isPrivate: false,
			})

			const rows = await getUpcomingHolidaysImpl({ userId: me.id, horizonDays: 7, now: NOW, dbx: tx })
			expect(rows).toEqual([])
		})
	})

	it('renders the dependent identity for dependent-subject lists', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			const dep = await makeDependent(tx, { name: 'Mochi', createdByUserId: me.id })
			await makeDependentGuardianship(tx, { guardianUserId: me.id, dependentId: dep.id })
			const list = await makeList(tx, {
				ownerId: me.id,
				subjectDependentId: dep.id,
				type: 'holiday',
				holidayCountry: 'US',
				holidayKey: 'easter',
				isPrivate: false,
			})

			const rows = await getUpcomingHolidaysImpl({ userId: me.id, horizonDays: 60, now: NOW, dbx: tx })
			expect(rows).toHaveLength(1)
			expect(rows[0]?.listId).toBe(list.id)
			expect(rows[0]?.recipient).toEqual({ kind: 'dependent', id: dep.id, name: 'Mochi', image: null })
		})
	})

	it('respects the none relationship by hiding the public holiday list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const stranger = await makeUser(tx)
			await makeList(tx, {
				ownerId: owner.id,
				type: 'holiday',
				holidayCountry: 'US',
				holidayKey: 'easter',
				isPrivate: false,
			})
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: stranger.id, accessLevel: 'none' })

			const rows = await getUpcomingHolidaysImpl({ userId: stranger.id, horizonDays: 60, now: NOW, dbx: tx })
			expect(rows).toEqual([])
		})
	})

	it('still surfaces the list for a restricted viewer (item-level filtering does not apply at the list feed)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const list = await makeList(tx, {
				ownerId: owner.id,
				type: 'holiday',
				holidayCountry: 'US',
				holidayKey: 'easter',
				isPrivate: false,
			})
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: viewer.id, accessLevel: 'restricted' })

			const rows = await getUpcomingHolidaysImpl({ userId: viewer.id, horizonDays: 60, now: NOW, dbx: tx })
			expect(rows).toHaveLength(1)
			expect(rows[0]?.listId).toBe(list.id)
		})
	})

	it('counts partner claims for lastGiftedAt', async () => {
		await withRollback(async tx => {
			const partner = await makeUser(tx)
			const me = await makeUser(tx, { partnerId: partner.id })
			const recipient = await makeUser(tx)
			const recipientList = await makeList(tx, {
				ownerId: recipient.id,
				type: 'wishlist',
				isPrivate: false,
			})
			const item = await makeItem(tx, { listId: recipientList.id })
			// The partner gifted the recipient yesterday; me's widget feed
			// should reflect that as `lastGiftedAt`.
			const yesterday = new Date(NOW.getTime() - 24 * 60 * 60 * 1000)
			await makeGiftedItem(tx, { itemId: item.id, gifterId: partner.id, createdAt: yesterday })

			await makeList(tx, {
				ownerId: recipient.id,
				type: 'holiday',
				holidayCountry: 'US',
				holidayKey: 'easter',
				isPrivate: false,
			})

			const rows = await getUpcomingHolidaysImpl({ userId: me.id, horizonDays: 60, now: NOW, dbx: tx })
			expect(rows).toHaveLength(1)
			expect(rows[0]?.lastGiftedAt).toBe(yesterday.toISOString())
		})
	})

	it('includes private holiday lists I am a list editor on', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const editor = await makeUser(tx)
			const list = await makeList(tx, {
				ownerId: owner.id,
				type: 'holiday',
				holidayCountry: 'US',
				holidayKey: 'easter',
				isPrivate: true,
			})
			await makeListEditor(tx, { listId: list.id, userId: editor.id, ownerId: owner.id })

			const rows = await getUpcomingHolidaysImpl({ userId: editor.id, horizonDays: 60, now: NOW, dbx: tx })
			expect(rows.map(r => r.listId)).toEqual([list.id])
			expect(rows[0]?.ownedByMe).toBe(false)
		})
	})

	it('skips inactive and non-holiday lists', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			await makeList(tx, {
				ownerId: me.id,
				type: 'holiday',
				holidayCountry: 'US',
				holidayKey: 'easter',
				isPrivate: false,
				isActive: false,
			})
			await makeList(tx, {
				ownerId: me.id,
				type: 'wishlist',
				isPrivate: false,
			})

			const rows = await getUpcomingHolidaysImpl({ userId: me.id, horizonDays: 60, now: NOW, dbx: tx })
			expect(rows).toEqual([])
		})
	})

	describe('customHolidayId resolution', () => {
		it("surfaces a list pinned to a catalog-source custom_holidays row and uses the row's title", async () => {
			await withRollback(async tx => {
				const me = await makeUser(tx, { name: 'Me' })
				// Seed the catalog entry the custom_holidays row points at.
				// The widget impl resolves the next occurrence through this
				// row's `rule`, not through the curated allowlist directly.
				await tx
					.insert(holidayCatalog)
					.values({ country: 'US', slug: 'easter', name: 'Easter Sunday', rule: 'easter', isEnabled: true })
					.onConflictDoNothing()
				const [ch] = await tx
					.insert(customHolidays)
					.values({
						title: 'Easter (curated)',
						source: 'catalog',
						catalogCountry: 'US',
						catalogKey: 'easter',
					})
					.returning()

				const list = await makeList(tx, {
					ownerId: me.id,
					type: 'holiday',
					customHolidayId: ch.id,
					isPrivate: false,
				})

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, horizonDays: 60, now: NOW, dbx: tx })
				expect(rows).toHaveLength(1)
				expect(rows[0]?.listId).toBe(list.id)
				// Display name comes from the admin row's `title`, not the
				// catalog row's `name`, so admins can rename per-deployment.
				expect(rows[0]?.holidayName).toBe('Easter (curated)')
				// Catalog reference is preserved for legacy / debug callers.
				expect(rows[0]?.holidayCountry).toBe('US')
				expect(rows[0]?.holidayKey).toBe('easter')
			})
		})

		it('surfaces a list pinned to a custom-source row with annual recurrence', async () => {
			await withRollback(async tx => {
				const me = await makeUser(tx)
				// `customYear: null` means "repeats annually." `NOW` is Mar 1
				// 2026, so a (month=4, day=10) row should resolve to Apr 10
				// 2026 - 40 days out, comfortably inside the 60-day horizon.
				const [ch] = await tx
					.insert(customHolidays)
					.values({
						title: 'Founders Day',
						source: 'custom',
						customMonth: 4,
						customDay: 10,
						customYear: null,
					})
					.returning()

				const list = await makeList(tx, {
					ownerId: me.id,
					type: 'holiday',
					customHolidayId: ch.id,
					isPrivate: false,
				})

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, horizonDays: 60, now: NOW, dbx: tx })
				expect(rows).toHaveLength(1)
				expect(rows[0]?.listId).toBe(list.id)
				expect(rows[0]?.holidayName).toBe('Founders Day')
				// No catalog reference for source='custom' rows.
				expect(rows[0]?.holidayCountry).toBeNull()
				expect(rows[0]?.holidayKey).toBeNull()
				expect(rows[0]?.daysUntil).toBe(40)
			})
		})

		it('rolls a past annual custom date forward to next year', async () => {
			await withRollback(async tx => {
				const me = await makeUser(tx)
				// (month=2, day=14) sits before NOW (Mar 1). Annual recurrence
				// should roll it to Feb 14 2027 - 350 days out, well outside
				// the 60-day horizon.
				const [ch] = await tx
					.insert(customHolidays)
					.values({
						title: "Valentine's",
						source: 'custom',
						customMonth: 2,
						customDay: 14,
						customYear: null,
					})
					.returning()

				await makeList(tx, {
					ownerId: me.id,
					type: 'holiday',
					customHolidayId: ch.id,
					isPrivate: false,
				})

				const inHorizon = await getUpcomingHolidaysImpl({ userId: me.id, horizonDays: 60, now: NOW, dbx: tx })
				expect(inHorizon).toEqual([])

				const wideHorizon = await getUpcomingHolidaysImpl({ userId: me.id, horizonDays: 366, now: NOW, dbx: tx })
				expect(wideHorizon).toHaveLength(1)
				expect(wideHorizon[0]?.daysUntil).toBe(350)
			})
		})

		it('drops a custom-source one-time date whose year has already passed', async () => {
			await withRollback(async tx => {
				const me = await makeUser(tx)
				const [ch] = await tx
					.insert(customHolidays)
					.values({
						title: 'Wedding 2025',
						source: 'custom',
						customMonth: 9,
						customDay: 15,
						customYear: 2025,
					})
					.returning()

				await makeList(tx, {
					ownerId: me.id,
					type: 'holiday',
					customHolidayId: ch.id,
					isPrivate: false,
				})

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, horizonDays: 366, now: NOW, dbx: tx })
				expect(rows).toEqual([])
			})
		})

		it('surfaces a custom-source one-time date in a future year that lands inside the horizon', async () => {
			await withRollback(async tx => {
				const me = await makeUser(tx)
				// A one-time date on Mar 15 2026 is 14 days out from NOW.
				const [ch] = await tx
					.insert(customHolidays)
					.values({
						title: 'Wedding 2026',
						source: 'custom',
						customMonth: 3,
						customDay: 15,
						customYear: 2026,
					})
					.returning()

				const list = await makeList(tx, {
					ownerId: me.id,
					type: 'holiday',
					customHolidayId: ch.id,
					isPrivate: false,
				})

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, horizonDays: 30, now: NOW, dbx: tx })
				expect(rows).toHaveLength(1)
				expect(rows[0]?.listId).toBe(list.id)
				expect(rows[0]?.holidayName).toBe('Wedding 2026')
				expect(rows[0]?.daysUntil).toBe(14)
			})
		})

		it('still honors lastHolidayArchiveAt on a custom-source row', async () => {
			await withRollback(async tx => {
				const me = await makeUser(tx)
				const [ch] = await tx
					.insert(customHolidays)
					.values({
						title: 'Founders Day',
						source: 'custom',
						customMonth: 4,
						customDay: 10,
						customYear: null,
					})
					.returning()

				await makeList(tx, {
					ownerId: me.id,
					type: 'holiday',
					customHolidayId: ch.id,
					isPrivate: false,
					// Already archived this year; the widget should suppress the
					// row through the year wrap.
					lastHolidayArchiveAt: new Date('2026-04-12T12:00:00Z'),
				})

				const rows = await getUpcomingHolidaysImpl({ userId: me.id, horizonDays: 60, now: NOW, dbx: tx })
				expect(rows).toEqual([])
			})
		})
	})
})
