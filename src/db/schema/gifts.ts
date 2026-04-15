import { relations, sql } from 'drizzle-orm'
import { check, index, integer, numeric, pgTable, serial, smallint, text } from 'drizzle-orm/pg-core'

import { items } from './items'
import { timestamps } from './shared'
import { users } from './users'

// ===============================
// GIFTED ITEMS (CLAIMS)
// ===============================
// One row per claim. An item with quantity > 1 can have multiple rows.
// The quantity invariant (SUM(quantity) for items.id <= items.quantity) is
// enforced at the application layer via a transaction with SELECT FOR UPDATE
// in the claim server action (decided 2026-04-14).
//
// Retractions are hard-DELETE, not soft-archive — there's no audit trail
// need for claims, and the UX is "I misclicked, make it go away."
export const giftedItems = pgTable(
	'gifted_items',
	{
		id: serial('id').primaryKey(),
		itemId: integer('item_id')
			.notNull()
			.references(() => items.id, { onDelete: 'cascade' }),
		gifterId: text('gifter_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// The original gifter can invite additional gifters onto the claim (co-gifters).
		additionalGifterIds: text('additional_gifter_ids').array(),
		quantity: smallint('quantity').default(1).notNull(),
		totalCost: numeric('total_cost'),
		notes: text('notes'),
		...timestamps,
	},
	table => [
		index('gifted_items_itemId_idx').on(table.itemId),
		index('gifted_items_gifterId_idx').on(table.gifterId),
		check('gifted_items_quantity_positive', sql`${table.quantity} > 0`),
	]
)

export const giftedItemsRelations = relations(giftedItems, ({ one }) => ({
	item: one(items, {
		fields: [giftedItems.itemId],
		references: [items.id],
	}),
	gifter: one(users, {
		fields: [giftedItems.gifterId],
		references: [users.id],
	}),
}))

export type GiftedItem = typeof giftedItems.$inferSelect
export type NewGiftedItem = typeof giftedItems.$inferInsert
