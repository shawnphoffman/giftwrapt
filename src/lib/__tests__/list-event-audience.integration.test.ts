import {
	makeDependent,
	makeDependentGuardianship,
	makeGuardianship,
	makeList,
	makeListEditor,
	makeUser,
	makeUserRelationship,
} from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { lists } from '@/db/schema'
import { createListAudienceResolver, type ListEvent, resolveListAudience, shouldDeliverListEvent } from '@/lib/list-event-audience'

const claim: ListEvent = { kind: 'claim', listId: 0 }
const item: ListEvent = { kind: 'item', listId: 0, itemId: 1 }

describe('resolveListAudience', () => {
	it('lets the recipient subscribe but marks them as the recipient', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const decision = await resolveListAudience(owner.id, list, tx)
			expect(decision).toEqual({ canSubscribe: true, isRecipient: true })
			expect(shouldDeliverListEvent(claim, decision)).toBe(false)
			expect(shouldDeliverListEvent(item, decision)).toBe(true)
		})
	})

	it('delivers claims to a gifter on a public list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const decision = await resolveListAudience(gifter.id, list, tx)
			expect(decision).toEqual({ canSubscribe: true, isRecipient: false })
			expect(shouldDeliverListEvent(claim, decision)).toBe(true)
		})
	})

	it('shuts out a viewer the owner set to none', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: viewer.id, accessLevel: 'none' })
			const list = await makeList(tx, { ownerId: owner.id })
			expect((await resolveListAudience(viewer.id, list, tx)).canSubscribe).toBe(false)
		})
	})

	it('shuts out a non-editor from a private list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, isPrivate: true })
			expect((await resolveListAudience(viewer.id, list, tx)).canSubscribe).toBe(false)
		})
	})

	it('lets a list editor subscribe to a private list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const editor = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, isPrivate: true })
			await makeListEditor(tx, { listId: list.id, userId: editor.id, ownerId: owner.id })
			expect(await resolveListAudience(editor.id, list, tx)).toEqual({ canSubscribe: true, isRecipient: false })
		})
	})

	it("lets a guardian subscribe to their child's private list", async () => {
		await withRollback(async tx => {
			const parent = await makeUser(tx)
			const child = await makeUser(tx, { role: 'child' })
			await makeGuardianship(tx, { parentUserId: parent.id, childUserId: child.id })
			const list = await makeList(tx, { ownerId: child.id, isPrivate: true })
			expect(await resolveListAudience(parent.id, list, tx)).toEqual({ canSubscribe: true, isRecipient: false })
		})
	})

	it('treats the guardian who owns a dependent list as a gifter, not the recipient', async () => {
		await withRollback(async tx => {
			const guardian = await makeUser(tx)
			const dep = await makeDependent(tx, { createdByUserId: guardian.id })
			await makeDependentGuardianship(tx, { guardianUserId: guardian.id, dependentId: dep.id })
			const list = await makeList(tx, { ownerId: guardian.id, subjectDependentId: dep.id })
			const decision = await resolveListAudience(guardian.id, list, tx)
			expect(decision).toEqual({ canSubscribe: true, isRecipient: false })
			expect(shouldDeliverListEvent(claim, decision)).toBe(true)
		})
	})

	it('shuts the target of a gift-ideas list out of that list', async () => {
		await withRollback(async tx => {
			const author = await makeUser(tx)
			const target = await makeUser(tx)
			const list = await makeList(tx, { ownerId: author.id, type: 'giftideas', isPrivate: true, giftIdeasTargetUserId: target.id })
			expect((await resolveListAudience(target.id, list, tx)).canSubscribe).toBe(false)
		})
	})
})

describe('createListAudienceResolver', () => {
	it('resolves several viewers against one list in one call', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const outsider = await makeUser(tx)
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: outsider.id, accessLevel: 'none' })
			const list = await makeList(tx, { ownerId: owner.id })

			const resolver = createListAudienceResolver({ dbx: tx })
			const decisions = await resolver.resolveMany([owner.id, gifter.id, outsider.id, gifter.id], list.id)

			expect(decisions.get(owner.id)).toEqual({ canSubscribe: true, isRecipient: true })
			expect(decisions.get(gifter.id)).toEqual({ canSubscribe: true, isRecipient: false })
			expect(decisions.get(outsider.id)).toEqual({ canSubscribe: false, isRecipient: false })
		})
	})

	it('delivers to nobody when the list no longer exists', async () => {
		await withRollback(async tx => {
			const viewer = await makeUser(tx)
			const resolver = createListAudienceResolver({ dbx: tx })
			const decisions = await resolver.resolveMany([viewer.id], 2_147_483_000)
			expect(decisions.get(viewer.id)).toEqual({ canSubscribe: false, isRecipient: false })
		})
	})

	it('reuses a decision until it expires, then re-checks', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			let clock = 1_000
			const resolver = createListAudienceResolver({ dbx: tx, ttlMs: 30_000, now: () => clock })

			expect((await resolver.resolveMany([viewer.id], list.id)).get(viewer.id)?.canSubscribe).toBe(true)

			await tx.update(lists).set({ isPrivate: true }).where(eq(lists.id, list.id))
			clock += 29_000
			expect((await resolver.resolveMany([viewer.id], list.id)).get(viewer.id)?.canSubscribe).toBe(true)

			clock += 2_000
			expect((await resolver.resolveMany([viewer.id], list.id)).get(viewer.id)?.canSubscribe).toBe(false)
		})
	})
})
