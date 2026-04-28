import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { deleteUserAsAdminImpl } from '@/api/admin'
import {
	account,
	giftedItems,
	guardianships,
	itemComments,
	items,
	itemScrapes,
	listAddons,
	listEditors,
	lists,
	session,
	userRelationships,
	users,
} from '@/db/schema'
import { cleanupImageUrls } from '@/lib/storage/cleanup'

import {
	makeAccount,
	makeGiftedItem,
	makeGuardianship,
	makeItem,
	makeItemComment,
	makeItemScrape,
	makeList,
	makeListAddon,
	makeListEditor,
	makeSession,
	makeUser,
	makeUserRelationship,
} from '../../../test/integration/factories'
import { withRollback } from '../../../test/integration/setup'

afterEach(() => {
	vi.mocked(cleanupImageUrls).mockClear()
})

describe('deleteUserAsAdminImpl', () => {
	it('hard-deletes the user and cascades all owned data', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const target = await makeUser(tx, { image: 'https://cdn.test/avatar.png' })
			const otherGifter = await makeUser(tx)
			const child = await makeUser(tx, { role: 'child' })
			const otherUser = await makeUser(tx)

			const list = await makeList(tx, { ownerId: target.id })
			const item = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: otherGifter.id })
			await makeItemComment(tx, { itemId: item.id, userId: target.id })
			await makeListAddon(tx, { listId: list.id, userId: target.id })
			await makeListEditor(tx, { listId: list.id, userId: otherGifter.id, ownerId: target.id })
			await makeUserRelationship(tx, { ownerUserId: target.id, viewerUserId: otherGifter.id })
			await makeGuardianship(tx, { parentUserId: target.id, childUserId: child.id })
			await makeSession(tx, { userId: target.id })
			await makeAccount(tx, { userId: target.id })

			// item_scrapes has two FKs back to user-owned data: itemId (cascade)
			// and userId (set null). Seed both on a single row to exercise the
			// PG cascade-ordering workaround in deleteUserAsAdminImpl (it pre-
			// nulls userId before falling into the cascade chain).
			const cascadeScrape = await makeItemScrape(tx, {
				url: 'https://example.test/cascade',
				scraperId: 'test',
				itemId: item.id,
				userId: target.id,
			})
			// Orphan scrape (no itemId) referencing the target via userId only.
			const setNullScrape = await makeItemScrape(tx, {
				url: 'https://example.test/setnull',
				scraperId: 'test',
				itemId: null,
				userId: target.id,
			})

			// A separate user's gift-ideas list pointing AT the target should
			// have its giftIdeasTargetUserId nulled, not the list deleted.
			const giftIdeasList = await makeList(tx, {
				ownerId: otherUser.id,
				type: 'giftideas',
				isPrivate: true,
				giftIdeasTargetUserId: target.id,
			})

			const result = await deleteUserAsAdminImpl({
				db: tx,
				actor: { id: admin.id },
				input: { userId: target.id },
			})
			expect(result).toEqual({ kind: 'ok' })

			// User and everything that cascades.
			expect(await tx.select().from(users).where(eq(users.id, target.id))).toHaveLength(0)
			expect(await tx.select().from(lists).where(eq(lists.id, list.id))).toHaveLength(0)
			expect(await tx.select().from(items).where(eq(items.id, item.id))).toHaveLength(0)
			expect(await tx.select().from(giftedItems).where(eq(giftedItems.itemId, item.id))).toHaveLength(0)
			expect(await tx.select().from(itemComments).where(eq(itemComments.itemId, item.id))).toHaveLength(0)
			expect(await tx.select().from(listAddons).where(eq(listAddons.listId, list.id))).toHaveLength(0)
			expect(await tx.select().from(listEditors).where(eq(listEditors.listId, list.id))).toHaveLength(0)
			expect(await tx.select().from(userRelationships).where(eq(userRelationships.ownerUserId, target.id))).toHaveLength(0)
			expect(await tx.select().from(guardianships).where(eq(guardianships.parentUserId, target.id))).toHaveLength(0)
			expect(await tx.select().from(session).where(eq(session.userId, target.id))).toHaveLength(0)
			expect(await tx.select().from(account).where(eq(account.userId, target.id))).toHaveLength(0)

			// itemScrapes.itemId cascades when the parent item is deleted.
			expect(await tx.select().from(itemScrapes).where(eq(itemScrapes.id, cascadeScrape.id))).toHaveLength(0)
			// itemScrapes.userId is FK with onDelete: 'set null' - row survives, userId nulled.
			const setNullAfter = await tx.select().from(itemScrapes).where(eq(itemScrapes.id, setNullScrape.id))
			expect(setNullAfter).toHaveLength(1)
			expect(setNullAfter[0].userId).toBeNull()

			// Gift-ideas list owned by otherUser survives, target pointer cleared.
			const giftIdeasAfter = await tx.select().from(lists).where(eq(lists.id, giftIdeasList.id))
			expect(giftIdeasAfter).toHaveLength(1)
			expect(giftIdeasAfter[0].giftIdeasTargetUserId).toBeNull()

			// Other users untouched.
			expect(await tx.select().from(users).where(eq(users.id, otherGifter.id))).toHaveLength(1)
			expect(await tx.select().from(users).where(eq(users.id, otherUser.id))).toHaveLength(1)
		})
	})

	it('clears partner pointers on other users (no FK constraint)', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const target = await makeUser(tx)
			const partnerA = await makeUser(tx, { partnerId: target.id })
			const partnerB = await makeUser(tx, { partnerId: target.id })
			const unrelated = await makeUser(tx, { partnerId: null })

			await deleteUserAsAdminImpl({
				db: tx,
				actor: { id: admin.id },
				input: { userId: target.id },
			})

			const after = await tx.select().from(users).where(eq(users.id, partnerA.id))
			expect(after[0].partnerId).toBeNull()
			const afterB = await tx.select().from(users).where(eq(users.id, partnerB.id))
			expect(afterB[0].partnerId).toBeNull()
			const afterUnrelated = await tx.select().from(users).where(eq(users.id, unrelated.id))
			expect(afterUnrelated[0].partnerId).toBeNull()
		})
	})

	it('rejects self-delete', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })

			const result = await deleteUserAsAdminImpl({
				db: tx,
				actor: { id: admin.id },
				input: { userId: admin.id },
			})
			expect(result).toEqual({ kind: 'error', reason: 'self-delete' })

			// User still exists.
			expect(await tx.select().from(users).where(eq(users.id, admin.id))).toHaveLength(1)
		})
	})

	it('returns not-found for an unknown user id', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })

			const result = await deleteUserAsAdminImpl({
				db: tx,
				actor: { id: admin.id },
				input: { userId: 'user_does_not_exist' },
			})
			expect(result).toEqual({ kind: 'error', reason: 'not-found' })
		})
	})

	it('fires storage cleanup for the avatar after the DB commit', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const target = await makeUser(tx, { image: 'https://cdn.test/me.jpg' })

			const result = await deleteUserAsAdminImpl({
				db: tx,
				actor: { id: admin.id },
				input: { userId: target.id },
			})
			expect(result).toEqual({ kind: 'ok' })
			expect(cleanupImageUrls).toHaveBeenCalledTimes(1)
			expect(cleanupImageUrls).toHaveBeenCalledWith(['https://cdn.test/me.jpg'])
		})
	})

	it('does not fire storage cleanup when the user has no avatar', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const target = await makeUser(tx, { image: null })

			await deleteUserAsAdminImpl({
				db: tx,
				actor: { id: admin.id },
				input: { userId: target.id },
			})
			expect(cleanupImageUrls).not.toHaveBeenCalled()
		})
	})
})
