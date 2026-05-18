import { makeList, makeListAddon, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { updateListAddonImpl } from '@/api/_list-addons-impl'
import { listAddons } from '@/db/schema'

describe('updateListAddonImpl - tracking number', () => {
	it('persists trackingNumber on update', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const addon = await makeListAddon(tx, { listId: list.id, userId: gifter.id })

			const result = await updateListAddonImpl({
				userId: gifter.id,
				input: { addonId: addon.id, totalCost: undefined, trackingNumber: '123456789012' },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')

			const row = await tx.query.listAddons.findFirst({ where: eq(listAddons.id, addon.id) })
			expect(row?.trackingNumber).toBe('123456789012')
		})
	})

	it('clears trackingNumber when explicitly set to null', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const addon = await makeListAddon(tx, { listId: list.id, userId: gifter.id })

			await updateListAddonImpl({
				userId: gifter.id,
				input: { addonId: addon.id, totalCost: undefined, trackingNumber: 'abc' },
				dbx: tx,
			})
			await updateListAddonImpl({
				userId: gifter.id,
				input: { addonId: addon.id, totalCost: undefined, trackingNumber: null },
				dbx: tx,
			})

			const row = await tx.query.listAddons.findFirst({ where: eq(listAddons.id, addon.id) })
			expect(row?.trackingNumber).toBeNull()
		})
	})
})
