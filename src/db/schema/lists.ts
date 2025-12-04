import { relations } from 'drizzle-orm'
import { boolean, index, pgTable, serial, text } from 'drizzle-orm/pg-core'

import { listTypeEnum } from './enums'
import { itemGroups, items } from './items'
import { timestamps } from './shared'
import { users } from './users'

// ===============================
// LISTS
// - Add primaryList to user
// ===============================
export const lists = pgTable(
	'lists',
	{
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		type: listTypeEnum('type').default('wishlist').notNull(),
		isActive: boolean('is_active').default(true).notNull(),
		isPrivate: boolean('is_private').default(false).notNull(),
		description: text('description'),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// recipientId: text('recipient_id').references(() => user.id, { onDelete: 'set null' }),
		...timestamps,
	},
	table => [
		index('lists_ownerId_idx').on(table.ownerId),
		index('lists_ownerId_isActive_idx').on(table.ownerId, table.isActive),
		index('lists_isPrivate_isActive_idx').on(table.isPrivate, table.isActive),
	]
)

export const listsRelations = relations(lists, ({ one, many }) => ({
	owner: one(users, {
		fields: [lists.ownerId],
		references: [users.id],
	}),
	itemGroups: many(itemGroups),
	items: many(items),
	// Editors
	// Viewers+
	// Viewers-Only
	// Addons
}))

export type List = typeof lists.$inferSelect
export type NewList = typeof lists.$inferInsert
