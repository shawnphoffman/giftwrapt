// Integration tests for the custom_holidays admin path: add (catalog
// and custom flavors), update, list-with-usage-count, and delete with
// admin-cascade conversion of dependent lists.

import { makeDependent, makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import {
	addCatalogCustomHolidayImpl,
	addCustomCustomHolidayImpl,
	deleteCustomHolidayImpl,
	listCustomHolidaysImpl,
	updateCustomHolidayImpl,
} from '@/api/_custom-holidays-impl'
import { customHolidays, giftedItems, holidayCatalog, lists } from '@/db/schema'

async function seedCatalog(tx: any) {
	// Drop in a tiny catalog row so the catalog-source add path has
	// something to point at. Mirrors what the real seed produces.
	await tx
		.insert(holidayCatalog)
		.values({ country: 'US', slug: 'easter', name: 'Easter', rule: '04-15', isEnabled: true })
		.onConflictDoNothing()
}

describe('custom_holidays admin path', () => {
	it('addCatalogCustomHoliday inserts a row with the catalog ref', async () => {
		await withRollback(async tx => {
			await seedCatalog(tx)
			const result = await addCatalogCustomHolidayImpl({
				input: { country: 'US', key: 'easter' },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			const inserted = await tx.select().from(customHolidays).where(eq(customHolidays.id, result.id))
			expect(inserted).toHaveLength(1)
			expect(inserted[0].source).toBe('catalog')
			expect(inserted[0].catalogCountry).toBe('US')
			expect(inserted[0].catalogKey).toBe('easter')
		})
	})

	it('addCatalogCustomHoliday rejects duplicates', async () => {
		await withRollback(async tx => {
			await seedCatalog(tx)
			const first = await addCatalogCustomHolidayImpl({ input: { country: 'US', key: 'easter' }, dbx: tx })
			expect(first.kind).toBe('ok')
			const second = await addCatalogCustomHolidayImpl({ input: { country: 'US', key: 'easter' }, dbx: tx })
			expect(second.kind).toBe('error')
			if (second.kind === 'error') expect(second.reason).toBe('already-exists')
		})
	})

	it('addCustomCustomHoliday accepts annual + one-time dates', async () => {
		await withRollback(async tx => {
			const annual = await addCustomCustomHolidayImpl({
				input: { title: 'Family Reunion', month: 7, day: 4, year: null, repeatsAnnually: true },
				dbx: tx,
			})
			expect(annual.kind).toBe('ok')
			if (annual.kind === 'ok') {
				const row = await tx.select().from(customHolidays).where(eq(customHolidays.id, annual.id))
				expect(row[0].customYear).toBeNull()
				expect(row[0].customMonth).toBe(7)
				expect(row[0].customDay).toBe(4)
			}

			const oneTime = await addCustomCustomHolidayImpl({
				input: { title: 'Wedding', month: 9, day: 15, year: 2027, repeatsAnnually: false },
				dbx: tx,
			})
			expect(oneTime.kind).toBe('ok')
			if (oneTime.kind === 'ok') {
				const row = await tx.select().from(customHolidays).where(eq(customHolidays.id, oneTime.id))
				expect(row[0].customYear).toBe(2027)
			}
		})
	})

	it('addCustomCustomHoliday rejects invalid month/day combos', async () => {
		await withRollback(async tx => {
			const result = await addCustomCustomHolidayImpl({
				input: { title: 'Bad date', month: 2, day: 30, year: null, repeatsAnnually: true },
				dbx: tx,
			})
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('invalid-date')
		})
	})

	it('updateCustomHoliday allows title edits on catalog rows; rejects date edits', async () => {
		await withRollback(async tx => {
			await seedCatalog(tx)
			const created = await addCatalogCustomHolidayImpl({ input: { country: 'US', key: 'easter' }, dbx: tx })
			if (created.kind !== 'ok') throw new Error('setup failed')

			const titleOk = await updateCustomHolidayImpl({ input: { id: created.id, title: 'Easter Sunday' }, dbx: tx })
			expect(titleOk.kind).toBe('ok')

			const dateBad = await updateCustomHolidayImpl({ input: { id: created.id, month: 4, day: 1 }, dbx: tx })
			expect(dateBad.kind).toBe('error')
			if (dateBad.kind === 'error') expect(dateBad.reason).toBe('cannot-edit-catalog-date')
		})
	})

	it('updateCustomHoliday allows date edits on custom rows', async () => {
		await withRollback(async tx => {
			const created = await addCustomCustomHolidayImpl({
				input: { title: 'Family Reunion', month: 7, day: 4, year: null, repeatsAnnually: true },
				dbx: tx,
			})
			if (created.kind !== 'ok') throw new Error('setup failed')

			const updated = await updateCustomHolidayImpl({ input: { id: created.id, month: 8, day: 1 }, dbx: tx })
			expect(updated.kind).toBe('ok')

			const row = await tx.select().from(customHolidays).where(eq(customHolidays.id, created.id))
			expect(row[0].customMonth).toBe(8)
			expect(row[0].customDay).toBe(1)
		})
	})

	it('listCustomHolidays reports a usage count', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const created = await addCustomCustomHolidayImpl({
				input: { title: 'Big Day', month: 6, day: 1, year: null, repeatsAnnually: true },
				dbx: tx,
			})
			if (created.kind !== 'ok') throw new Error('setup failed')
			await makeList(tx, { ownerId: owner.id, type: 'holiday', customHolidayId: created.id })
			await makeList(tx, { ownerId: owner.id, type: 'holiday', customHolidayId: created.id })

			const rows = await listCustomHolidaysImpl({ dbx: tx })
			const match = rows.find(r => r.id === created.id)
			expect(match?.usageCount).toBe(2)
		})
	})

	it('addCustomCustomHoliday accepts a user recipient and listCustomHolidays returns the joined name', async () => {
		await withRollback(async tx => {
			const recipient = await makeUser(tx, { name: 'Graham' })
			const created = await addCustomCustomHolidayImpl({
				input: {
					title: "Graham's Graduation",
					month: 6,
					day: 1,
					year: 2026,
					repeatsAnnually: false,
					recipient: { kind: 'user', userId: recipient.id },
				},
				dbx: tx,
			})
			expect(created.kind).toBe('ok')
			if (created.kind !== 'ok') return

			const rows = await listCustomHolidaysImpl({ dbx: tx })
			const match = rows.find(r => r.id === created.id)
			expect(match?.recipientUserId).toBe(recipient.id)
			expect(match?.recipientUserName).toBe('Graham')
			expect(match?.recipientDependentId).toBeNull()
		})
	})

	it('addCustomCustomHoliday accepts a dependent recipient', async () => {
		await withRollback(async tx => {
			const guardian = await makeUser(tx)
			const dep = await makeDependent(tx, { createdByUserId: guardian.id, name: 'Mochi' })
			const created = await addCustomCustomHolidayImpl({
				input: {
					title: "Mochi's Adoption Day",
					month: 5,
					day: 15,
					year: null,
					repeatsAnnually: true,
					recipient: { kind: 'dependent', dependentId: dep.id },
				},
				dbx: tx,
			})
			expect(created.kind).toBe('ok')
			if (created.kind !== 'ok') return

			const rows = await listCustomHolidaysImpl({ dbx: tx })
			const match = rows.find(r => r.id === created.id)
			expect(match?.recipientDependentId).toBe(dep.id)
			expect(match?.recipientDependentName).toBe('Mochi')
			expect(match?.recipientUserId).toBeNull()
		})
	})

	it('addCustomCustomHoliday rejects a non-existent recipient user', async () => {
		await withRollback(async tx => {
			const created = await addCustomCustomHolidayImpl({
				input: {
					title: 'Bogus',
					month: 6,
					day: 1,
					year: null,
					repeatsAnnually: true,
					recipient: { kind: 'user', userId: 'nope-not-real' },
				},
				dbx: tx,
			})
			expect(created.kind).toBe('error')
			if (created.kind === 'error') expect(created.reason).toBe('recipient-not-found')
		})
	})

	it('updateCustomHoliday clears the recipient when recipient.kind = none', async () => {
		await withRollback(async tx => {
			const recipient = await makeUser(tx)
			const created = await addCustomCustomHolidayImpl({
				input: {
					title: 'X',
					month: 6,
					day: 1,
					year: null,
					repeatsAnnually: true,
					recipient: { kind: 'user', userId: recipient.id },
				},
				dbx: tx,
			})
			if (created.kind !== 'ok') throw new Error('setup failed')

			const updated = await updateCustomHolidayImpl({
				input: { id: created.id, recipient: { kind: 'none' } },
				dbx: tx,
			})
			expect(updated.kind).toBe('ok')

			const row = await tx.select().from(customHolidays).where(eq(customHolidays.id, created.id))
			expect(row[0].recipientUserId).toBeNull()
			expect(row[0].recipientDependentId).toBeNull()
		})
	})

	it('updateCustomHoliday swaps a recipient from user to dependent', async () => {
		await withRollback(async tx => {
			const userRecipient = await makeUser(tx)
			const guardian = await makeUser(tx)
			const dep = await makeDependent(tx, { createdByUserId: guardian.id })
			const created = await addCustomCustomHolidayImpl({
				input: {
					title: 'Y',
					month: 7,
					day: 1,
					year: null,
					repeatsAnnually: true,
					recipient: { kind: 'user', userId: userRecipient.id },
				},
				dbx: tx,
			})
			if (created.kind !== 'ok') throw new Error('setup failed')

			const updated = await updateCustomHolidayImpl({
				input: { id: created.id, recipient: { kind: 'dependent', dependentId: dep.id } },
				dbx: tx,
			})
			expect(updated.kind).toBe('ok')

			const row = await tx.select().from(customHolidays).where(eq(customHolidays.id, created.id))
			expect(row[0].recipientUserId).toBeNull()
			expect(row[0].recipientDependentId).toBe(dep.id)
		})
	})

	it('deleteCustomHoliday cascades affected lists to defaultListType WITHOUT clearing claims', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const created = await addCustomCustomHolidayImpl({
				input: { title: 'Big Day', month: 6, day: 1, year: null, repeatsAnnually: true },
				dbx: tx,
			})
			if (created.kind !== 'ok') throw new Error('setup failed')
			const list = await makeList(tx, { ownerId: owner.id, type: 'holiday', customHolidayId: created.id })
			const item = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await deleteCustomHolidayImpl({ input: { id: created.id }, dbx: tx })
			expect(result.kind).toBe('ok')
			if (result.kind === 'ok') expect(result.convertedListCount).toBe(1)

			const afterList = await tx.select().from(lists).where(eq(lists.id, list.id))
			expect(afterList[0].customHolidayId).toBeNull()
			// Should now be the default list type, NOT wiped of claims.
			expect(afterList[0].type).toBe('wishlist')

			// Claim survived the admin cascade.
			const claims = await tx.select().from(giftedItems).where(eq(giftedItems.itemId, item.id))
			expect(claims).toHaveLength(1)
		})
	})
})
