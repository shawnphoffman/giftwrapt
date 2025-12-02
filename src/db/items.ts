import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { timestamps } from './shared'
// import { users } from './users'
import { lists } from './lists'

// ===============================
// ITEMS
// ===============================
export const items = pgTable('items', {
	id: serial('id').primaryKey(),
	title: text('title').notNull(),
	listId: integer('list_id')
		.notNull()
		.references(() => lists.id, { onDelete: 'cascade' }),
	...timestamps,
})

export const itemsRelations = relations(items, ({ one }) => ({
	list: one(lists, {
		fields: [items.listId],
		references: [lists.id],
	}),
}))

export type Item = typeof items.$inferSelect
export type NewItem = typeof items.$inferInsert

// ===============================
// LIST/ITEMS
// ===============================
// export const listItems = pgTable('list_items', {
// 	id: serial('id').primaryKey(),
// 	listId: text('list_id')
// 		.notNull()
// 		.references(() => lists.id, { onDelete: 'cascade' }),
// 	itemId: text('item_id')
// 		.notNull()
// 		.references(() => items.id, { onDelete: 'cascade' }),
// 	...timestamps,
// })

// export const listItemsRelations = relations(listItems, ({ one }) => ({
// 	list: one(lists, {
// 		fields: [listItems.listId],
// 		references: [lists.id],
// 	}),
// 	item: one(items, {
// 		fields: [listItems.itemId],
// 		references: [items.id],
// 	}),
// }))

// export type ListItem = typeof listItems.$inferSelect
// export type NewListItem = typeof listItems.$inferInsert
