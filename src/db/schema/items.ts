import { relations } from 'drizzle-orm'
import { boolean, index, integer, json, pgTable, serial, smallint, text, timestamp } from 'drizzle-orm/pg-core'

import { availabilityEnum, priorityEnum, statusEnum } from './enums'
import { lists } from './lists'
import { timestamps } from './shared'
import { users } from './users'

// ===============================
// ITEMS
// ===============================
export const items = pgTable(
	'items',
	{
		id: serial('id').primaryKey(),
		listId: integer('list_id')
			.notNull()
			.references(() => lists.id, { onDelete: 'cascade' }),
		groupId: integer('group_id').references(() => itemGroups.id, { onDelete: 'set null' }),
		title: text('title').notNull(),
		status: statusEnum('status').default('incomplete').notNull(),
		// Product-state, orthogonal to status. Marks items that are sold out/discontinued.
		availability: availabilityEnum('availability').default('available').notNull(),
		url: text('url'),
		imageUrl: text('image_url'),
		price: text('price'),
		currency: text('currency'),
		notes: text('notes'),
		priority: priorityEnum('priority').default('normal').notNull(),
		isArchived: boolean('is_archived').default(false).notNull(),
		quantity: smallint('quantity').default(1).notNull(),
		...timestamps,
		// modifiedAt is bumped in server actions when title/url/notes change.
		// Deliberately NOT a DB trigger (decided 2026-04-14) — keeps portability simple.
		modifiedAt: timestamp('modified_at', { withTimezone: true }),
	},
	table => [
		index('items_listId_idx').on(table.listId),
		index('items_listId_isArchived_idx').on(table.listId, table.isArchived),
		index('items_groupId_idx').on(table.groupId),
		// index('items_status_idx').on(table.status),
	]
)

export type Item = typeof items.$inferSelect
export type NewItem = typeof items.$inferInsert

// ===============================
// ITEM GROUPS
// ===============================
export const itemGroups = pgTable(
	'item_groups',
	{
		id: serial('id').primaryKey(),
		listId: integer('list_id')
			.notNull()
			.references(() => lists.id, { onDelete: 'cascade' }),
		priority: priorityEnum('priority').default('normal').notNull(),
		// status?
		// type (and/or)
		...timestamps,
	},
	table => [
		index('item_groups_listId_idx').on(table.listId), // Foreign key
	]
)

export type ItemGroup = typeof itemGroups.$inferSelect
export type NewItemGroup = typeof itemGroups.$inferInsert

// ===============================
// ITEM COMMENTS
// ===============================
export const itemComments = pgTable(
	'item_comments',
	{
		id: serial('id').primaryKey(),
		itemId: integer('item_id')
			.notNull()
			.references(() => items.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		comment: text('comment').notNull(),
		is_archived: boolean('is_archived').default(false).notNull(),
		...timestamps,
	},
	table => [
		index('item_comments_itemId_idx').on(table.itemId),
		// index('item_comments_userId_idx').on(table.userId),
		index('item_comments_is_archived_idx').on(table.is_archived),
	]
)

export type ItemComment = typeof itemComments.$inferSelect
export type NewItemComment = typeof itemComments.$inferInsert

// ===============================
// ITEM SCRAPES
// ===============================
export const itemScrapes = pgTable(
	'item_scrapes',
	{
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
	},
	table => [index('item_scrapes_itemId_idx').on(table.itemId)]
)

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
