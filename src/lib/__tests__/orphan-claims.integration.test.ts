// Coverage for the shared orphan-claim audience/standing helpers, with a
// focus on the spoiler guard: the list's recipient is never in the
// audience, never has standing, and never gets archived-list access via
// their partner's claim on their own list.

import { makeDependent, makeDependentGuardianship, makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import {
	isListRecipient,
	resolveOrphanClaimAudience,
	resolveOrphanItemAudience,
	userHasPendingDeletionClaimOnList,
	userHasStandingOnClaim,
} from '@/lib/orphan-claims'

const PENDING = new Date('2026-05-13T00:00:00Z')

describe('isListRecipient', () => {
	it('is the owner for user-subject lists and nobody for dependent-subject lists', () => {
		expect(isListRecipient({ ownerId: 'u1', subjectDependentId: null }, 'u1')).toBe(true)
		expect(isListRecipient({ ownerId: 'u1', subjectDependentId: null }, 'u2')).toBe(false)
		expect(isListRecipient({ ownerId: 'u1', subjectDependentId: 'dep' }, 'u1')).toBe(false)
	})
})

describe('resolveOrphanClaimAudience', () => {
	it('includes the partner on a third-party list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const partner = await makeUser(tx)
			const gifter = await makeUser(tx, { partnerId: partner.id })
			const list = await makeList(tx, { ownerId: owner.id })

			const audience = await resolveOrphanClaimAudience(tx, gifter.id, list)
			expect(audience.map(u => u.id)).toEqual([gifter.id, partner.id])
		})
	})

	it("drops the partner when the partner is the list's recipient", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx, { partnerId: owner.id })
			const list = await makeList(tx, { ownerId: owner.id })

			const audience = await resolveOrphanClaimAudience(tx, gifter.id, list)
			expect(audience.map(u => u.id)).toEqual([gifter.id])
		})
	})

	it('keeps the partner when the partner owns a dependent-subject list', async () => {
		await withRollback(async tx => {
			const guardian = await makeUser(tx)
			const gifter = await makeUser(tx, { partnerId: guardian.id })
			const dep = await makeDependent(tx, { createdByUserId: guardian.id })
			await makeDependentGuardianship(tx, { guardianUserId: guardian.id, dependentId: dep.id })
			const list = await makeList(tx, { ownerId: guardian.id, subjectDependentId: dep.id })

			const audience = await resolveOrphanClaimAudience(tx, gifter.id, list)
			expect(audience.map(u => u.id)).toEqual([gifter.id, guardian.id])
		})
	})
})

describe('resolveOrphanItemAudience', () => {
	it('never includes the recipient across multiple claims', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const partner = await makeUser(tx, { partnerId: owner.id })
			const friend = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: partner.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: friend.id })

			const audience = await resolveOrphanItemAudience(tx, item.id, list)
			expect(audience.map(u => u.id).sort()).toEqual([friend.id, partner.id].sort())
		})
	})
})

describe('userHasStandingOnClaim', () => {
	it('grants the gifter and their partner on a third-party list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const partner = await makeUser(tx, { partnerId: gifter.id })
			const list = await makeList(tx, { ownerId: owner.id })
			const claim = { gifterId: gifter.id, additionalGifterIds: null }

			expect(await userHasStandingOnClaim(tx, gifter.id, claim, list)).toBe(true)
			expect(await userHasStandingOnClaim(tx, partner.id, claim, list)).toBe(true)
			expect(await userHasStandingOnClaim(tx, owner.id, claim, list)).toBe(false)
		})
	})

	it("denies the recipient even when the gifter is the recipient's partner", async () => {
		await withRollback(async tx => {
			const gifter = await makeUser(tx)
			const owner = await makeUser(tx, { partnerId: gifter.id })
			const list = await makeList(tx, { ownerId: owner.id })
			const claim = { gifterId: gifter.id, additionalGifterIds: null }

			expect(await userHasStandingOnClaim(tx, owner.id, claim, list)).toBe(false)
			expect(await userHasStandingOnClaim(tx, gifter.id, claim, list)).toBe(true)
		})
	})
})

describe('userHasPendingDeletionClaimOnList', () => {
	it("is false for the recipient even when their partner's claim is pending on their own list", async () => {
		await withRollback(async tx => {
			const gifter = await makeUser(tx)
			const owner = await makeUser(tx, { partnerId: gifter.id })
			const list = await makeList(tx, { ownerId: owner.id, isActive: false })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			expect(await userHasPendingDeletionClaimOnList(tx, owner.id, list.id)).toBe(false)
			expect(await userHasPendingDeletionClaimOnList(tx, gifter.id, list.id)).toBe(true)
		})
	})

	it('is true for the partner of the gifter on a third-party list (either partnership direction)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const partner = await makeUser(tx, { partnerId: gifter.id })
			const list = await makeList(tx, { ownerId: owner.id, isActive: false })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			expect(await userHasPendingDeletionClaimOnList(tx, partner.id, list.id)).toBe(true)
		})
	})
})
