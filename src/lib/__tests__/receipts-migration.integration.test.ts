import { Readable } from 'node:stream'

import { makeGiftedItem, makeItem, makeList, makeListAddon, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { giftedItems, listAddons, purchaseAttachments } from '@/db/schema'
import { parseReceiptUrl } from '@/lib/receipts'
import { migrateLegacyReceipts } from '@/lib/receipts-migration'
import type { StorageAdapter } from '@/lib/storage/adapter'

function memoryStorage(initial: Record<string, string>) {
	const objects = new Map<string, Buffer>(Object.entries(initial).map(([k, v]) => [k, Buffer.from(v)]))
	const adapter = {
		upload: (key: string, buffer: Buffer) => {
			objects.set(key, buffer)
			return Promise.resolve()
		},
		delete: (key: string) => {
			objects.delete(key)
			return Promise.resolve()
		},
		stream: (key: string) => {
			const body = objects.get(key)
			if (!body) return Promise.reject(new Error('not found'))
			return Promise.resolve({
				body: Readable.from([body]),
				contentType: 'application/octet-stream',
				etag: '"x"',
				contentLength: body.length,
			})
		},
		getPublicUrl: (key: string) => `/api/files/${key}`,
	} as unknown as StorageAdapter
	return { adapter, objects }
}

describe('migrateLegacyReceipts', () => {
	it('plans only legacy receipts, moves them privately, and is safe to re-run', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })
			const legacyClaimKey = `purchases/claim/${gift.id}/abcdefabcdef.pdf`
			await tx
				.update(giftedItems)
				.set({ attachmentUrls: [`/api/files/${legacyClaimKey}`, 'https://elsewhere.test/receipt.pdf'] })
				.where(eq(giftedItems.id, gift.id))

			// An addon with a legacy receipt AND a mirrored product image under
			// the same prefix; only the receipt may move.
			const addon = await makeListAddon(tx, { listId: list.id, userId: gifter.id })
			const legacyAddonKey = `purchases/addon/${addon.id}/fedcbafedcba.webp`
			const addonImageKey = `purchases/addon/${addon.id}/imageimageim.webp`
			await tx
				.update(listAddons)
				.set({ attachmentUrls: [`https://cdn.test/${legacyAddonKey}`], imageUrl: `https://cdn.test/${addonImageKey}` })
				.where(eq(listAddons.id, addon.id))

			const { adapter, objects } = memoryStorage({
				[legacyClaimKey]: 'claim-pdf',
				[legacyAddonKey]: 'addon-webp',
				[addonImageKey]: 'image',
			})

			const dry = await migrateLegacyReceipts({ dbx: tx, storage: adapter, publicBase: 'https://cdn.test', apply: false, deleteOld: false })
			expect(dry.planned.map(p => p.oldKey).sort()).toEqual([legacyAddonKey, legacyClaimKey].sort())
			expect(dry.moved).toBe(0)

			const run = await migrateLegacyReceipts({ dbx: tx, storage: adapter, publicBase: 'https://cdn.test', apply: true, deleteOld: true })
			expect(run.moved).toBe(2)
			expect(run.oldDeleted).toBe(2)
			expect(run.skipped).toEqual([])

			const claim = await tx.query.giftedItems.findFirst({ where: eq(giftedItems.id, gift.id) })
			const [movedUrl, untouchedUrl] = claim?.attachmentUrls ?? []
			expect(untouchedUrl).toBe('https://elsewhere.test/receipt.pdf')
			const receipt = await tx.query.purchaseAttachments.findFirst({ where: eq(purchaseAttachments.id, parseReceiptUrl(movedUrl)!.id) })
			expect(receipt?.storageKey).toMatch(new RegExp(`^purchases/receipts/claim/${gift.id}/`))
			expect(objects.get(receipt!.storageKey)?.toString()).toBe('claim-pdf')
			expect(objects.has(legacyClaimKey)).toBe(false)
			expect(objects.has(legacyAddonKey)).toBe(false)
			expect(objects.has(addonImageKey)).toBe(true)

			const again = await migrateLegacyReceipts({ dbx: tx, storage: adapter, publicBase: 'https://cdn.test', apply: true, deleteOld: true })
			expect(again.planned).toEqual([])
		})
	})

	it('skips a receipt whose old object is missing and leaves its url alone', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })
			const url = `/api/files/purchases/claim/${gift.id}/missingmissi.pdf`
			await tx
				.update(giftedItems)
				.set({ attachmentUrls: [url] })
				.where(eq(giftedItems.id, gift.id))

			const { adapter } = memoryStorage({})
			const run = await migrateLegacyReceipts({ dbx: tx, storage: adapter, publicBase: undefined, apply: true, deleteOld: false })
			expect(run.moved).toBe(0)
			expect(run.skipped).toHaveLength(1)
			const claim = await tx.query.giftedItems.findFirst({ where: eq(giftedItems.id, gift.id) })
			expect(claim?.attachmentUrls).toEqual([url])
		})
	})
})
