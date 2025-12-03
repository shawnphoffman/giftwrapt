import { boolean, integer, json, pgTable, serial, smallint, text } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { timestamps } from './shared'
// import { users } from './users'
import { lists } from './lists'
import { priorityEnum, statusEnum } from './enums'
import { users } from './users'

// ===============================
// ITEMS
// ===============================
export const items = pgTable('items', {
	id: serial('id').primaryKey(),
	listId: integer('list_id')
		.notNull()
		.references(() => lists.id, { onDelete: 'cascade' }),
	groupId: integer('group_id').references(() => itemGroups.id, { onDelete: 'set null' }),
	title: text('title').notNull(),
	status: statusEnum('status').default('incomplete').notNull(),
	url: text('url'),
	imageUrl: text('image_url'),
	price: text('price'),
	currency: text('currency'),
	notes: text('notes'),
	priority: priorityEnum('priority').default('normal').notNull(),
	isArchived: boolean('is_archived').default(false).notNull(),
	quantity: smallint('quantity').default(1).notNull(),
	...timestamps,
})

export type Item = typeof items.$inferSelect
export type NewItem = typeof items.$inferInsert

// ===============================
// ITEM GROUPS
// ===============================
export const itemGroups = pgTable('item_groups', {
	id: serial('id').primaryKey(),
	listId: integer('list_id')
		.notNull()
		.references(() => lists.id, { onDelete: 'cascade' }),
	priority: priorityEnum('priority').default('normal').notNull(),
	// status?
	// type (and/or)
	...timestamps,
})

export type ItemGroup = typeof itemGroups.$inferSelect
export type NewItemGroup = typeof itemGroups.$inferInsert

// ===============================
// ITEM COMMENTS
// ===============================
export const itemComments = pgTable('item_comments', {
	id: serial('id').primaryKey(),
	itemId: integer('item_id')
		.notNull()
		.references(() => items.id, { onDelete: 'cascade' }),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	comment: text('comment').notNull(),
	is_archived: boolean('is_archived').default(false).notNull(),
	...timestamps,
})

export type ItemComment = typeof itemComments.$inferSelect
export type NewItemComment = typeof itemComments.$inferInsert

// ===============================
// ITEM SCRAPES
// ===============================
export const itemScrapes = pgTable('item_scrapes', {
	id: serial('id').primaryKey(),
	itemId: integer('item_id')
		.notNull()
		.references(() => items.id, { onDelete: 'cascade' }),
	url: text('url').notNull(),
	scraperId: text('scraper_id').notNull(),
	response: json('response'),
	title: text('title'),
	cleanTitle: text('clean_title'),
	description: text('description'),
	price: text('price'),
	currency: text('currency'),
	imageUrls: text('image_urls').array(),
	...timestamps,
})

export type ItemScrape = typeof itemScrapes.$inferSelect
export type NewItemScrape = typeof itemScrapes.$inferInsert

// ===============================
// RELATIONS
// ===============================
export const itemRelations = relations(items, ({ one, many }) => ({
	list: one(lists, {
		fields: [items.listId],
		references: [lists.id],
	}),
	group: one(itemGroups, {
		fields: [items.groupId],
		references: [itemGroups.id],
	}),
	comments: many(itemComments),
	scrapes: many(itemScrapes),
}))

export const itemGroupRelations = relations(itemGroups, ({ one, many }) => ({
	list: one(lists, {
		fields: [itemGroups.listId],
		references: [lists.id],
	}),
	items: many(items),
}))

export const itemCommentRelations = relations(itemComments, ({ one }) => ({
	item: one(items, {
		fields: [itemComments.itemId],
		references: [items.id],
	}),
	user: one(users, {
		fields: [itemComments.userId],
		references: [users.id],
	}),
}))

export const itemScrapeRelations = relations(itemScrapes, ({ one }) => ({
	item: one(items, {
		fields: [itemScrapes.itemId],
		references: [items.id],
	}),
}))
