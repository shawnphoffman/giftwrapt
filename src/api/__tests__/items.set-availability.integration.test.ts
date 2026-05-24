// Availability-toggle access coverage. The toggle is intentionally
// allowed for any viewer who can see the list (server-side check is
// canViewListAsAnyone, so it short-circuits for owners), with the
// per-claim safety gate handled in the UI.

import { makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { setItemAvailabilityImpl } from '@/api/_items-extra-impl'

describe('setItemAvailability owner-aware visibility', () => {
	it('owner can toggle availability on their own private list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, isPrivate: true })
			const item = await makeItem(tx, { listId: list.id })

			const result = await setItemAvailabilityImpl({
				userId: owner.id,
				input: { itemId: item.id, availability: 'unavailable' },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
		})
	})

	it('owner can toggle availability on their own public list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, isPrivate: false })
			const item = await makeItem(tx, { listId: list.id })

			const result = await setItemAvailabilityImpl({
				userId: owner.id,
				input: { itemId: item.id, availability: 'unavailable' },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
		})
	})

	it('non-owner cannot toggle availability on a private list they cannot see', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, isPrivate: true })
			const item = await makeItem(tx, { listId: list.id })

			const result = await setItemAvailabilityImpl({
				userId: stranger.id,
				input: { itemId: item.id, availability: 'unavailable' },
				dbx: tx,
			})
			expect(result).toEqual({ kind: 'error', reason: 'not-visible' })
		})
	})
})
