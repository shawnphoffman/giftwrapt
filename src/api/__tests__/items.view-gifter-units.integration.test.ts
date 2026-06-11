import { makeGiftedItem, makeItem, makeList, makeUser, makeUserRelationship } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { getItemsForListViewImpl } from '@/api/_items-extra-impl'

// End-to-end coverage for the gifter-unit resolution attached to each claim in
// the gifting view (the avatar stack). buildGifterUnits itself is unit-tested;
// these assert the wiring: the two-pass user/partner lookup, the recipient
// exclusion keyed off the list owner, and the restricted no-leak fallback.

async function giftsForViewer(tx: Parameters<typeof makeUser>[0], viewerId: string, listId: number) {
	const result = await getItemsForListViewImpl({ userId: viewerId, listId: String(listId), dbx: tx })
	if (result.kind !== 'ok') throw new Error(`expected ok, got ${result.kind}`)
	return result.items
}

describe('getItemsForListViewImpl gifter units', () => {
	it('renders the primary and each co-gifter as separate units', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const primary = await makeUser(tx, { name: 'Primary' })
			const coGifter = await makeUser(tx, { name: 'Co' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, title: 'Trike' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: primary.id, additionalGifterIds: [coGifter.id] })

			const items = await giftsForViewer(tx, primary.id, list.id)
			const units = items[0].gifts[0].units
			expect(units.map(u => u.key)).toEqual([`solo:${primary.id}`, `solo:${coGifter.id}`])
		})
	})

	it('pairs a gifter with their partner into one unit', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const partner = await makeUser(tx, { name: 'Partner' })
			const primary = await makeUser(tx, { name: 'Primary', partnerId: partner.id })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, title: 'Trike' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: primary.id })

			const items = await giftsForViewer(tx, primary.id, list.id)
			const units = items[0].gifts[0].units
			expect(units).toHaveLength(1)
			expect(units[0].members.map(m => m.id).sort()).toEqual([partner.id, primary.id].sort())
		})
	})

	it('excludes the recipient: gifting for your partner shows you solo', async () => {
		await withRollback(async tx => {
			const partner = await makeUser(tx, { name: 'Partner' })
			// The gifter is partnered to the list owner (the recipient).
			const gifter = await makeUser(tx, { name: 'Gifter', partnerId: partner.id })
			const list = await makeList(tx, { ownerId: partner.id, name: 'Partner List' })
			const item = await makeItem(tx, { listId: list.id, title: 'Surprise' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const items = await giftsForViewer(tx, gifter.id, list.id)
			const units = items[0].gifts[0].units
			expect(units).toEqual([{ key: `solo:${gifter.id}`, label: 'Gifter', members: [{ id: gifter.id, name: 'Gifter', image: null }] }])
		})
	})

	it('restricted viewer sees only their own solo unit, never an outsider co-gifter', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const restricted = await makeUser(tx, { name: 'Restricted' })
			const outsider = await makeUser(tx, { name: 'Outsider' })
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: restricted.id, accessLevel: 'restricted' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, title: 'Trike' })
			// Restricted viewer is the primary; an outsider rides as a co-gifter.
			await makeGiftedItem(tx, { itemId: item.id, gifterId: restricted.id, additionalGifterIds: [outsider.id] })

			const items = await giftsForViewer(tx, restricted.id, list.id)
			const units = items[0].gifts[0].units
			expect(units).toEqual([
				{ key: `solo:${restricted.id}`, label: 'Restricted', members: [{ id: restricted.id, name: 'Restricted', image: null }] },
			])
			// And the outsider was stripped from the co-gifter array too.
			expect(items[0].gifts[0].additionalGifterIds ?? []).not.toContain(outsider.id)
		})
	})
})
