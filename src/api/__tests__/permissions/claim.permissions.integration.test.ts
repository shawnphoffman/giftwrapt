// Claim (giftedItem) permissions matrix.
//
// Surfaces covered:
//   - claimItemGiftImpl       (canViewList-gated; owner blocked with 'cannot-claim-own-list')
//   - unclaimItemGiftImpl     (row-ownership: only the original gifter can delete)
//   - updateCoGiftersImpl     (row-ownership: only the primary gifter can edit co-gifters)
//
// The partner-aware credit predicate
// (`gifterId IN [me, partner] OR additionalGifterIds && [me, partner]`)
// is exercised under purchases.ts and getMyGiftsImpl; it's not gated by
// canViewList so it lives outside this matrix.

import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { claimItemGiftImpl, unclaimItemGiftImpl, updateCoGiftersImpl } from '@/api/_gifts-impl'
import { describeListState } from '@/lib/__tests__/permissions/_matrix-types'

import { claimExpectations } from './_expectations'
import { seedFor } from './_seeds'

const claimItemMatrix = claimExpectations.filter(e => e.action === 'claim-item')

describe('claimItemGift x matrix', () => {
	it.each(claimItemMatrix)(
		'role=$role state=$listState.privacy/$listState.active -> $expected',
		async ({ role, listState, expected, reasonOnDeny }) => {
			await withRollback(async tx => {
				const { viewer, list } = await seedFor(role, { tx, listState })
				const item = await makeItem(tx, { listId: list.id, quantity: 1 })
				const result = await claimItemGiftImpl({
					gifterId: viewer.id,
					input: { itemId: item.id, quantity: 1, totalCost: undefined },
					dbx: tx,
				})
				if (expected === 'allow') {
					expect(result.kind, `${role} on ${describeListState(listState)} should claim-allow`).toBe('ok')
				} else {
					expect(result.kind, `${role} on ${describeListState(listState)} should claim-deny`).toBe('error')
					if (result.kind === 'error' && reasonOnDeny) expect(result.reason).toBe(reasonOnDeny)
				}
			})
		}
	)
})

// ---------------------------------------------------------------------------
// Non-matrix invariants
// ---------------------------------------------------------------------------

describe('unclaimItemGift - row-ownership gate', () => {
	it('allows the original gifter to unclaim', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })
			const result = await unclaimItemGiftImpl({ gifterId: gifter.id, input: { giftId: gift.id }, dbx: tx })
			expect(result.kind).toBe('ok')
		})
	})

	it("rejects a stranger trying to unclaim someone else's claim with 'not-yours'", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })
			const result = await unclaimItemGiftImpl({ gifterId: stranger.id, input: { giftId: gift.id }, dbx: tx })
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('not-yours')
		})
	})

	it("rejects the list owner trying to unclaim a gifter's claim (recipients can't see claims)", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })
			const result = await unclaimItemGiftImpl({ gifterId: owner.id, input: { giftId: gift.id }, dbx: tx })
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('not-yours')
		})
	})
})

describe('updateCoGifters - row-ownership gate', () => {
	it('lets the primary gifter add co-gifters', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const friend = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })
			const result = await updateCoGiftersImpl({
				gifterId: gifter.id,
				input: { giftId: gift.id, additionalGifterIds: [friend.id] },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
		})
	})

	it("rejects a co-gifter trying to mutate the primary gifter's claim", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const coGifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, {
				itemId: item.id,
				gifterId: gifter.id,
				additionalGifterIds: [coGifter.id],
			})
			const result = await updateCoGiftersImpl({
				gifterId: coGifter.id,
				input: { giftId: gift.id, additionalGifterIds: [] },
				dbx: tx,
			})
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('not-yours')
		})
	})
})
