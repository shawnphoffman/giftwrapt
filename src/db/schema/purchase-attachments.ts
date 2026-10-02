import { relations, sql } from 'drizzle-orm'
import { check, index, integer, pgTable, text } from 'drizzle-orm/pg-core'

import { giftedItems } from './gifts'
import { listAddons } from './lists'
import { timestamps } from './shared'

// ===============================
// PURCHASE ATTACHMENTS (receipts)
// ===============================
// Receipts and PDFs a gifter attaches to a claim or an off-list gift. They are
// private to the gifter's unit, so they are never served from a public bucket
// URL. Each row maps an opaque id to the object's storage key; the app hands
// out `/api/receipts/<id>.<ext>` (stored in the purchase's `attachmentUrls`)
// and the receipts route authorizes the viewer before streaming the bytes.
// The storage key never leaves the server, so a public bucket cannot expose a
// receipt even when someone shares the app URL.
//
// Exactly one of giftId / addonId is set. Rows go when their purchase goes;
// the storage object is then an orphan the admin storage page can sweep.
export const purchaseAttachments = pgTable(
	'purchase_attachments',
	{
		id: text('id').primaryKey(),
		giftId: integer('gift_id').references(() => giftedItems.id, { onDelete: 'cascade' }),
		addonId: integer('addon_id').references(() => listAddons.id, { onDelete: 'cascade' }),
		storageKey: text('storage_key').notNull().unique(),
		contentType: text('content_type').notNull(),
		...timestamps,
	},
	table => [
		index('purchase_attachments_giftId_idx').on(table.giftId),
		index('purchase_attachments_addonId_idx').on(table.addonId),
		check('purchase_attachments_one_owner', sql`(${table.giftId} IS NULL) <> (${table.addonId} IS NULL)`),
	]
)

export const purchaseAttachmentsRelations = relations(purchaseAttachments, ({ one }) => ({
	gift: one(giftedItems, { fields: [purchaseAttachments.giftId], references: [giftedItems.id] }),
	addon: one(listAddons, { fields: [purchaseAttachments.addonId], references: [listAddons.id] }),
}))

export type PurchaseAttachment = typeof purchaseAttachments.$inferSelect
export type NewPurchaseAttachment = typeof purchaseAttachments.$inferInsert
