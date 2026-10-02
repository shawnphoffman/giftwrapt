// One-shot move of receipts uploaded before `purchase_attachments` existed.
//
// Those receipts sit at public-shaped keys (`purchases/<claim|addon>/<id>/...`)
// and `attachmentUrls` holds their bucket or `/api/files` URL. For each one this
// copies the object to a private `receiptKey`, records it in
// `purchase_attachments`, and swaps the URL for `/api/receipts/<id>.<ext>`, in
// one transaction per receipt with the purchase row locked. Re-running skips
// anything already moved. Old objects are deleted only when asked, after the
// row that replaces them has committed.
//
// Addon product images also live under `purchases/addon/`, but they are
// referenced from `listAddons.imageUrl`, never `attachmentUrls`, so they are
// left alone.
//
// Driven by scripts/migrate-receipts-private.ts.

import { eq, isNotNull, sql } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { giftedItems, listAddons, purchaseAttachments } from '@/db/schema'
import { newReceiptId, receiptUrl } from '@/lib/receipts'
import type { StorageAdapter } from '@/lib/storage/adapter'
import { isReceiptKey, parseKeyFromUrl, parsePurchaseAttachmentKey, type PurchaseAttachmentKind, receiptKey } from '@/lib/storage/keys'

export type ReceiptMigrationPlanEntry = { purchaseKind: PurchaseAttachmentKind; purchaseId: number; url: string; oldKey: string }

export type ReceiptMigrationResult = {
	planned: Array<ReceiptMigrationPlanEntry>
	moved: number
	skipped: Array<{ entry: ReceiptMigrationPlanEntry; reason: string }>
	oldDeleted: number
}

const CONTENT_TYPES = { webp: 'image/webp', pdf: 'application/pdf' } as const

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
	const chunks: Array<Buffer> = []
	for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
	return Buffer.concat(chunks)
}

export async function planLegacyReceipts(dbx: SchemaDatabase, publicBase: string | undefined): Promise<Array<ReceiptMigrationPlanEntry>> {
	const plan: Array<ReceiptMigrationPlanEntry> = []
	const claimRows = await dbx
		.select({ id: giftedItems.id, urls: giftedItems.attachmentUrls })
		.from(giftedItems)
		.where(isNotNull(giftedItems.attachmentUrls))
	const addonRows = await dbx
		.select({ id: listAddons.id, urls: listAddons.attachmentUrls })
		.from(listAddons)
		.where(isNotNull(listAddons.attachmentUrls))
	for (const [purchaseKind, rows] of [
		['claim', claimRows],
		['addon', addonRows],
	] as const) {
		for (const row of rows) {
			for (const url of row.urls ?? []) {
				const oldKey = parseKeyFromUrl(url, publicBase)
				if (!oldKey || isReceiptKey(oldKey) || !parsePurchaseAttachmentKey(oldKey)) continue
				plan.push({ purchaseKind, purchaseId: row.id, url, oldKey })
			}
		}
	}
	return plan
}

export async function migrateLegacyReceipts(args: {
	dbx: SchemaDatabase
	storage: StorageAdapter
	publicBase: string | undefined
	apply: boolean
	deleteOld: boolean
}): Promise<ReceiptMigrationResult> {
	const { dbx, storage, publicBase, apply, deleteOld } = args
	const planned = await planLegacyReceipts(dbx, publicBase)
	const result: ReceiptMigrationResult = { planned, moved: 0, skipped: [], oldDeleted: 0 }
	if (!apply) return result

	for (const entry of planned) {
		const parsed = parsePurchaseAttachmentKey(entry.oldKey)
		if (!parsed) continue
		let bytes: Buffer
		try {
			bytes = await readAll((await storage.stream(entry.oldKey)).body)
		} catch (err) {
			result.skipped.push({ entry, reason: `could not read old object: ${err instanceof Error ? err.message : String(err)}` })
			continue
		}
		const newKey = receiptKey(entry.purchaseKind, entry.purchaseId, parsed.ext)
		const contentType = CONTENT_TYPES[parsed.ext]
		await storage.upload(newKey, bytes, contentType)

		const id = newReceiptId()
		const newUrl = receiptUrl(id, parsed.ext)
		const swapped = await dbx.transaction(async tx => {
			const locked = (
				entry.purchaseKind === 'claim'
					? await tx.execute(sql`SELECT attachment_urls FROM gifted_items WHERE id = ${entry.purchaseId} FOR UPDATE`)
					: await tx.execute(sql`SELECT attachment_urls FROM list_addons WHERE id = ${entry.purchaseId} FOR UPDATE`)
			) as { rows: Array<{ attachment_urls: Array<string> | null }> }
			const current = locked.rows.at(0)?.attachment_urls ?? []
			if (!current.includes(entry.url)) return false
			await tx.insert(purchaseAttachments).values({
				id,
				giftId: entry.purchaseKind === 'claim' ? entry.purchaseId : null,
				addonId: entry.purchaseKind === 'addon' ? entry.purchaseId : null,
				storageKey: newKey,
				contentType,
			})
			const next = current.map(u => (u === entry.url ? newUrl : u))
			if (entry.purchaseKind === 'claim')
				await tx.update(giftedItems).set({ attachmentUrls: next }).where(eq(giftedItems.id, entry.purchaseId))
			else await tx.update(listAddons).set({ attachmentUrls: next }).where(eq(listAddons.id, entry.purchaseId))
			return true
		})
		if (!swapped) {
			// The purchase changed underneath us (receipt removed, row gone).
			await storage.delete(newKey).catch(() => {})
			result.skipped.push({ entry, reason: 'url no longer on the purchase' })
			continue
		}
		result.moved++
		if (deleteOld) {
			try {
				await storage.delete(entry.oldKey)
				result.oldDeleted++
			} catch {
				// Leaves an orphan admin storage can sweep; the receipt itself moved.
			}
		}
	}
	return result
}
