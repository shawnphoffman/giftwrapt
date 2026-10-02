import {
	makeDependent,
	makeDependentGuardianship,
	makeGiftedItem,
	makeItem,
	makeList,
	makeListAddon,
	makeUser,
} from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { attachReceiptImpl, detachReceiptImpl, loadReceiptForViewerImpl } from '@/api/_receipts-impl'
import type { SchemaDatabase } from '@/db'
import { giftedItems, listAddons, purchaseAttachments, users } from '@/db/schema'
import { parseReceiptUrl } from '@/lib/receipts'
import { LIMITS } from '@/lib/validation/limits'

async function claimFixture(tx: SchemaDatabase) {
	const owner = await makeUser(tx)
	const gifter = await makeUser(tx)
	const list = await makeList(tx, { ownerId: owner.id })
	const item = await makeItem(tx, { listId: list.id })
	const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })
	return { owner, gifter, list, item, gift }
}

async function attachClaimReceipt(tx: SchemaDatabase, gifterId: string, giftId: number) {
	const result = await attachReceiptImpl({
		userId: gifterId,
		purchaseKind: 'claim',
		purchaseId: giftId,
		storageKey: `purchases/receipts/claim/${giftId}/${Math.random().toString(36).slice(2, 14)}.pdf`,
		contentType: 'application/pdf',
		ext: 'pdf',
		dbx: tx,
	})
	if (result.kind !== 'ok') throw new Error(`attach failed: ${result.kind}`)
	const parsed = parseReceiptUrl(result.url)
	if (!parsed) throw new Error(`unexpected receipt url ${result.url}`)
	return { url: result.url, id: parsed.id }
}

describe('attachReceiptImpl', () => {
	it('records the key server-side and appends an opaque receipt url', async () => {
		await withRollback(async tx => {
			const { gifter, gift } = await claimFixture(tx)
			const { url, id } = await attachClaimReceipt(tx, gifter.id, gift.id)

			expect(url).toMatch(/^\/api\/receipts\/[0-9A-Za-z]{21}\.pdf$/)
			expect(url).not.toContain('purchases/')
			const row = await tx.query.purchaseAttachments.findFirst({ where: eq(purchaseAttachments.id, id) })
			expect(row).toMatchObject({ giftId: gift.id, addonId: null, contentType: 'application/pdf' })
			const claim = await tx.query.giftedItems.findFirst({ where: eq(giftedItems.id, gift.id) })
			expect(claim?.attachmentUrls).toEqual([url])
		})
	})

	it("refuses someone else's purchase", async () => {
		await withRollback(async tx => {
			const { gift } = await claimFixture(tx)
			const stranger = await makeUser(tx)
			const result = await attachReceiptImpl({
				userId: stranger.id,
				purchaseKind: 'claim',
				purchaseId: gift.id,
				storageKey: 'purchases/receipts/claim/x/abcdefabcdef.pdf',
				contentType: 'application/pdf',
				ext: 'pdf',
				dbx: tx,
			})
			expect(result.kind).toBe('gone')
		})
	})

	it('stops at the per-purchase cap', async () => {
		await withRollback(async tx => {
			const { gifter, gift } = await claimFixture(tx)
			for (let i = 0; i < LIMITS.PURCHASE_ATTACHMENTS_MAX; i++) await attachClaimReceipt(tx, gifter.id, gift.id)
			const result = await attachReceiptImpl({
				userId: gifter.id,
				purchaseKind: 'claim',
				purchaseId: gift.id,
				storageKey: 'purchases/receipts/claim/x/overovercapx.pdf',
				contentType: 'application/pdf',
				ext: 'pdf',
				dbx: tx,
			})
			expect(result.kind).toBe('over')
		})
	})
})

describe('detachReceiptImpl', () => {
	it('returns the key only for a receipt of that purchase', async () => {
		await withRollback(async tx => {
			const a = await claimFixture(tx)
			const b = await claimFixture(tx)
			const { id } = await attachClaimReceipt(tx, a.gifter.id, a.gift.id)

			expect(await detachReceiptImpl({ receiptId: id, purchaseKind: 'claim', purchaseId: b.gift.id, dbx: tx })).toBeNull()
			const removed = await detachReceiptImpl({ receiptId: id, purchaseKind: 'claim', purchaseId: a.gift.id, dbx: tx })
			expect(removed?.storageKey).toMatch(/^purchases\/receipts\/claim\//)
			expect(await tx.query.purchaseAttachments.findFirst({ where: eq(purchaseAttachments.id, id) })).toBeUndefined()
		})
	})
})

describe('loadReceiptForViewerImpl', () => {
	it('lets the gifter, their partner, a co-gifter, and the co-gifter’s partner open a claim receipt', async () => {
		await withRollback(async tx => {
			const { gifter, gift } = await claimFixture(tx)
			const gifterPartner = await makeUser(tx, { partnerId: gifter.id })
			const coGifter = await makeUser(tx)
			const coGifterPartner = await makeUser(tx, { partnerId: coGifter.id })
			await tx
				.update(giftedItems)
				.set({ additionalGifterIds: [coGifter.id] })
				.where(eq(giftedItems.id, gift.id))
			const { id } = await attachClaimReceipt(tx, gifter.id, gift.id)

			for (const viewer of [gifter, gifterPartner, coGifter, coGifterPartner]) {
				expect(await loadReceiptForViewerImpl(viewer.id, id, tx), viewer.id).toMatchObject({ contentType: 'application/pdf' })
			}
		})
	})

	it('hides it from an unrelated user and from a missing id', async () => {
		await withRollback(async tx => {
			const { gifter, gift } = await claimFixture(tx)
			const stranger = await makeUser(tx)
			const { id } = await attachClaimReceipt(tx, gifter.id, gift.id)
			expect(await loadReceiptForViewerImpl(stranger.id, id, tx)).toBeNull()
			expect(await loadReceiptForViewerImpl(gifter.id, 'A'.repeat(21), tx)).toBeNull()
		})
	})

	it('never shows the recipient a receipt, even when their partner bought the gift', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const partnerGifter = await makeUser(tx, { partnerId: owner.id })
			await tx.update(users).set({ partnerId: partnerGifter.id }).where(eq(users.id, owner.id))
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: partnerGifter.id })
			const { id } = await attachClaimReceipt(tx, partnerGifter.id, gift.id)

			expect(await loadReceiptForViewerImpl(owner.id, id, tx)).toBeNull()
			expect(await loadReceiptForViewerImpl(partnerGifter.id, id, tx)).not.toBeNull()
		})
	})

	it('lets the guardian who owns a dependent list see their own receipt on it', async () => {
		await withRollback(async tx => {
			const guardian = await makeUser(tx)
			const dep = await makeDependent(tx, { createdByUserId: guardian.id })
			await makeDependentGuardianship(tx, { guardianUserId: guardian.id, dependentId: dep.id })
			const list = await makeList(tx, { ownerId: guardian.id, subjectDependentId: dep.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: guardian.id })
			const { id } = await attachClaimReceipt(tx, guardian.id, gift.id)
			expect(await loadReceiptForViewerImpl(guardian.id, id, tx)).not.toBeNull()
		})
	})

	it('refuses a banned gifter', async () => {
		await withRollback(async tx => {
			const { gifter, gift } = await claimFixture(tx)
			const { id } = await attachClaimReceipt(tx, gifter.id, gift.id)
			await tx.update(users).set({ banned: true }).where(eq(users.id, gifter.id))
			expect(await loadReceiptForViewerImpl(gifter.id, id, tx)).toBeNull()
		})
	})

	it("serves an addon receipt to its gifter but not to the list's owner", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const addon = await makeListAddon(tx, { listId: list.id, userId: gifter.id })
			const result = await attachReceiptImpl({
				userId: gifter.id,
				purchaseKind: 'addon',
				purchaseId: addon.id,
				storageKey: `purchases/receipts/addon/${addon.id}/cccccccccccc.webp`,
				contentType: 'image/webp',
				ext: 'webp',
				dbx: tx,
			})
			if (result.kind !== 'ok') throw new Error(result.kind)
			const id = parseReceiptUrl(result.url)!.id
			const row = await tx.query.listAddons.findFirst({ where: eq(listAddons.id, addon.id) })
			expect(row?.attachmentUrls).toEqual([result.url])

			expect(await loadReceiptForViewerImpl(gifter.id, id, tx)).toMatchObject({ contentType: 'image/webp' })
			expect(await loadReceiptForViewerImpl(owner.id, id, tx)).toBeNull()
		})
	})
})
