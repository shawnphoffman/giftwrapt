import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { setContributionSplitImpl, updateCoGiftersImpl, updateItemGiftImpl } from '@/api/_gifts-impl'
import { giftContributions } from '@/db/schema'

async function setup(tx: Parameters<typeof makeUser>[0]) {
	const owner = await makeUser(tx, { name: 'Owner' })
	const partner = await makeUser(tx, { name: 'Partner' })
	const primary = await makeUser(tx, { name: 'Primary', partnerId: partner.id })
	const coGifter = await makeUser(tx, { name: 'Co' })
	const list = await makeList(tx, { ownerId: owner.id })
	const item = await makeItem(tx, { listId: list.id, quantity: 1 })
	const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: primary.id, additionalGifterIds: [coGifter.id], totalCost: '110.00' })
	return { owner, partner, primary, coGifter, list, item, gift }
}

const rowsFor = (tx: Parameters<typeof makeUser>[0], giftId: number) =>
	tx.select().from(giftContributions).where(eq(giftContributions.giftId, giftId))

describe('setContributionSplitImpl', () => {
	it('stores a custom co-gifter amount (primary share is the residual)', async () => {
		await withRollback(async tx => {
			const { primary, coGifter, gift } = await setup(tx)
			const r = await setContributionSplitImpl({
				actorId: primary.id,
				input: { giftId: gift.id, coGifters: [{ userId: coGifter.id, amount: '40.00' }] },
				dbx: tx,
			})
			expect(r).toEqual({ kind: 'ok' })
			const rows = await rowsFor(tx, gift.id)
			expect(rows).toHaveLength(1)
			expect(rows[0].userId).toBe(coGifter.id)
			expect(Number(rows[0].amount)).toBe(40)
		})
	})

	it('clears the split when given no co-gifter amounts', async () => {
		await withRollback(async tx => {
			const { primary, coGifter, gift } = await setup(tx)
			await setContributionSplitImpl({
				actorId: primary.id,
				input: { giftId: gift.id, coGifters: [{ userId: coGifter.id, amount: '40.00' }] },
				dbx: tx,
			})
			const r = await setContributionSplitImpl({ actorId: primary.id, input: { giftId: gift.id, coGifters: [] }, dbx: tx })
			expect(r).toEqual({ kind: 'ok' })
			expect(await rowsFor(tx, gift.id)).toHaveLength(0)
		})
	})

	it("lets the primary's partner set the split", async () => {
		await withRollback(async tx => {
			const { partner, coGifter, gift } = await setup(tx)
			const r = await setContributionSplitImpl({
				actorId: partner.id,
				input: { giftId: gift.id, coGifters: [{ userId: coGifter.id, amount: '10.00' }] },
				dbx: tx,
			})
			expect(r).toEqual({ kind: 'ok' })
		})
	})

	it('rejects a target who is not a co-gifter on the claim', async () => {
		await withRollback(async tx => {
			const { primary, gift } = await setup(tx)
			const stranger = await makeUser(tx, { name: 'Stranger' })
			const r = await setContributionSplitImpl({
				actorId: primary.id,
				input: { giftId: gift.id, coGifters: [{ userId: stranger.id, amount: '10.00' }] },
				dbx: tx,
			})
			expect(r).toEqual({ kind: 'error', reason: 'invalid-gifter' })
		})
	})

	it('rejects co-gifter amounts that exceed the total', async () => {
		await withRollback(async tx => {
			const { primary, coGifter, gift } = await setup(tx)
			const r = await setContributionSplitImpl({
				actorId: primary.id,
				input: { giftId: gift.id, coGifters: [{ userId: coGifter.id, amount: '200.00' }] },
				dbx: tx,
			})
			expect(r).toEqual({ kind: 'error', reason: 'exceeds-total' })
		})
	})

	it('rejects a non-primary, non-partner actor', async () => {
		await withRollback(async tx => {
			const { coGifter, gift } = await setup(tx)
			const r = await setContributionSplitImpl({
				actorId: coGifter.id,
				input: { giftId: gift.id, coGifters: [{ userId: coGifter.id, amount: '10.00' }] },
				dbx: tx,
			})
			expect(r).toEqual({ kind: 'error', reason: 'not-yours' })
		})
	})

	it('rejects a claim with no recorded cost', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const primary = await makeUser(tx, { name: 'Primary' })
			const co = await makeUser(tx, { name: 'Co' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: primary.id, additionalGifterIds: [co.id], totalCost: null })
			const r = await setContributionSplitImpl({
				actorId: primary.id,
				input: { giftId: gift.id, coGifters: [{ userId: co.id, amount: '10.00' }] },
				dbx: tx,
			})
			expect(r).toEqual({ kind: 'error', reason: 'no-cost' })
		})
	})
})

describe('reset-to-even', () => {
	it('drops a custom split when the total cost changes', async () => {
		await withRollback(async tx => {
			const { primary, coGifter, gift } = await setup(tx)
			await setContributionSplitImpl({
				actorId: primary.id,
				input: { giftId: gift.id, coGifters: [{ userId: coGifter.id, amount: '40.00' }] },
				dbx: tx,
			})
			await updateItemGiftImpl({ gifterId: primary.id, input: { giftId: gift.id, quantity: 1, totalCost: '120.00' }, dbx: tx })
			expect(await rowsFor(tx, gift.id)).toHaveLength(0)
		})
	})

	it('keeps a custom split when only notes change (total unchanged)', async () => {
		await withRollback(async tx => {
			const { primary, coGifter, gift } = await setup(tx)
			await setContributionSplitImpl({
				actorId: primary.id,
				input: { giftId: gift.id, coGifters: [{ userId: coGifter.id, amount: '40.00' }] },
				dbx: tx,
			})
			await updateItemGiftImpl({
				gifterId: primary.id,
				input: { giftId: gift.id, quantity: 1, totalCost: '110.00', notes: 'ordered' },
				dbx: tx,
			})
			expect(await rowsFor(tx, gift.id)).toHaveLength(1)
		})
	})

	it('drops a custom split when the co-gifter set changes', async () => {
		await withRollback(async tx => {
			const { primary, coGifter, gift } = await setup(tx)
			const friend = await makeUser(tx, { name: 'Friend' })
			await setContributionSplitImpl({
				actorId: primary.id,
				input: { giftId: gift.id, coGifters: [{ userId: coGifter.id, amount: '40.00' }] },
				dbx: tx,
			})
			await updateCoGiftersImpl({
				gifterId: primary.id,
				input: { giftId: gift.id, additionalGifterIds: [coGifter.id, friend.id] },
				dbx: tx,
			})
			expect(await rowsFor(tx, gift.id)).toHaveLength(0)
		})
	})
})
