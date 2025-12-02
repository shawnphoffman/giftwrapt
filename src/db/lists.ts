import { boolean, pgTable, serial, text } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { timestamps } from './shared'
import { users } from './users'
import { listTypeEnum } from './enums'

// ===============================
// LISTS
// - Add primaryList to user
// ===============================
export const lists = pgTable('lists', {
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
})

export const listsRelations = relations(lists, ({ one }) => ({
	owner: one(users, {
		fields: [lists.ownerId],
		references: [users.id],
	}),
	// Items
	// Editors
	// Viewers+
	// Viewers-Only
	// Addons
}))

export type List = typeof lists.$inferSelect
export type NewList = typeof lists.$inferInsert
