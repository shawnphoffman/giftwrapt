// db/schema.ts
import { boolean, integer, jsonb, numeric, pgEnum, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core'

// ---------- Enums ----------

export const visibilityEnum = pgEnum('visibility', ['private', 'public'])

export const roleEnum = pgEnum('role', ['purchaser', 'editor', 'recipient'])

export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high', 'ultra'])

// ---------- Core tables ----------

export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 255 }).notNull(),
	email: varchar('email', { length: 255 }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const lists = pgTable('lists', {
	id: serial('id').primaryKey(),
	ownerId: integer('owner_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	visibility: visibilityEnum('visibility').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const items = pgTable('items', {
	id: serial('id').primaryKey(),
	creatorId: integer('creator_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	title: varchar('title', { length: 255 }).notNull(),
	description: text('description'),
	url: varchar('url', { length: 2048 }),
	imageUrl: varchar('image_url', { length: 2048 }),
	price: numeric('price', { precision: 10, scale: 2 }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const listItems = pgTable('list_items', {
	id: serial('id').primaryKey(),
	listId: integer('list_id')
		.notNull()
		.references(() => lists.id, { onDelete: 'cascade' }),
	itemId: integer('item_id')
		.notNull()
		.references(() => items.id, { onDelete: 'cascade' }),
	priority: priorityEnum('priority').notNull(),
	quantity: integer('quantity').notNull().default(1),
	isIntuition: boolean('is_intuition').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const listMemberships = pgTable('list_memberships', {
	id: serial('id').primaryKey(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	listId: integer('list_id')
		.notNull()
		.references(() => lists.id, { onDelete: 'cascade' }),
	role: roleEnum('role').notNull(),
	// ERD doesn’t show timestamps here, so leaving them out.
})

export const listItemComments = pgTable('list_item_comments', {
	id: serial('id').primaryKey(),
	listItemId: integer('list_item_id')
		.notNull()
		.references(() => listItems.id, { onDelete: 'cascade' }),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	comment: text('comment').notNull(),
	// ERD only shows `comment`, no timestamps.
})

// ---------- Bundles ----------

export const bundles = pgTable('bundles', {
	id: serial('id').primaryKey(),
	listId: integer('list_id')
		.notNull()
		.references(() => lists.id, { onDelete: 'cascade' }),
	parentListItemId: integer('parent_list_item_id')
		.notNull()
		.references(() => listItems.id, { onDelete: 'cascade' }),
	isRequired: boolean('is_required').notNull(),
	priority: priorityEnum('priority').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const bundleItems = pgTable('bundle_items', {
	id: serial('id').primaryKey(),
	bundleId: integer('bundle_id')
		.notNull()
		.references(() => bundles.id, { onDelete: 'cascade' }),
	childListItemId: integer('child_list_item_id')
		.notNull()
		.references(() => listItems.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ---------- Variant groups ----------

export const variantGroups = pgTable('variant_groups', {
	id: serial('id').primaryKey(),
	listId: integer('list_id')
		.notNull()
		.references(() => lists.id, { onDelete: 'cascade' }),
	name: varchar('name', { length: 255 }), // optional per ERD
	allowMultiple: boolean('allow_multiple').notNull(),
	priority: priorityEnum('priority').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const variantGroupItems = pgTable('variant_group_items', {
	id: serial('id').primaryKey(),
	variantGroupId: integer('variant_group_id')
		.notNull()
		.references(() => variantGroups.id, { onDelete: 'cascade' }),
	listItemId: integer('list_item_id')
		.notNull()
		.references(() => listItems.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ---------- Claims / claiming users ----------

export const claims = pgTable('claims', {
	id: serial('id').primaryKey(),
	listItemId: integer('list_item_id')
		.notNull()
		.references(() => listItems.id, { onDelete: 'cascade' }),
	quantity: integer('quantity').notNull().default(1),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const claimUsers = pgTable('claim_users', {
	id: serial('id').primaryKey(),
	claimId: integer('claim_id')
		.notNull()
		.references(() => claims.id, { onDelete: 'cascade' }),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ---------- Guardianships ----------

export const guardianships = pgTable('guardianships', {
	id: serial('id').primaryKey(),
	childUserId: integer('child_user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	parentUserId: integer('parent_user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
})

// ---------- Scrapes ----------

export const scrapes = pgTable('scrapes', {
	listItemId: integer('list_item_id')
		.primaryKey()
		.references(() => listItems.id, { onDelete: 'cascade' }),
	url: text('url').notNull(),
	scraperUrl: text('scraper_url').notNull(),
	response: jsonb('response').notNull(),
})

// ---------- Inferred types (optional but handy) ----------

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type List = typeof lists.$inferSelect
export type NewList = typeof lists.$inferInsert

export type Item = typeof items.$inferSelect
export type NewItem = typeof items.$inferInsert

// …you can add similar aliases for the rest as needed
