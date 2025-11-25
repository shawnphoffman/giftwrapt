import { relations, sql } from 'drizzle-orm'
import { pgTable, bigint, uuid, text, boolean, smallint, timestamp, jsonb, bigserial, pgEnum, varchar, pgSchema } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'

/* ────────────────────────────────────────────────────────────────
   ENUMS inferred from USER-DEFINED Postgres types
   (priority, status, birth_month)
   You may rename or modify these according to your real definitions.
────────────────────────────────────────────────────────────────── */

// priority USER-DEFINED NOT NULL DEFAULT 'normal'::priority
export const priorityEnumValues = ['low', 'normal', 'high'] as const
export const priorityEnum = pgEnum('priority', priorityEnumValues)
export type Priority = (typeof priorityEnumValues)[number]

// status USER-DEFINED NOT NULL DEFAULT 'incomplete'::status
export const statusEnumValues = ['incomplete', 'complete'] as const
export const statusEnum = pgEnum('status', statusEnumValues)
export type Status = (typeof statusEnumValues)[number]

// birth_month USER-DEFINED
export const birthMonthEnumValues = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december',
] as const
export const birthMonthEnum = pgEnum('birth_month', birthMonthEnumValues)
export type BirthMonth = (typeof birthMonthEnumValues)[number]

/* ────────────────────────────────────────────────────────────────
   auth.users  (standard Supabase auth table)
────────────────────────────────────────────────────────────────── */
const auth = pgSchema('auth')

export const authUsers = auth.table('users', {
	instanceId: uuid('instance_id'),
	id: uuid('id').primaryKey(),
	aud: varchar('aud'),
	role: varchar('role'),
	email: varchar('email'),
	encryptedPassword: varchar('encrypted_password'),
	emailConfirmedAt: timestamp('email_confirmed_at', { withTimezone: true }),
	invitedAt: timestamp('invited_at', { withTimezone: true }),
	confirmationToken: varchar('confirmation_token'),
	confirmationSentAt: timestamp('confirmation_sent_at', { withTimezone: true }),
	recoveryToken: varchar('recovery_token'),
	recoverySentAt: timestamp('recovery_sent_at', { withTimezone: true }),
	emailChangeTokenNew: varchar('email_change_token_new'),
	emailChange: varchar('email_change'),
	emailChangeSentAt: timestamp('email_change_sent_at', { withTimezone: true }),
	lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
	rawAppMetaData: jsonb('raw_app_meta_data'),
	rawUserMetaData: jsonb('raw_user_meta_data'),
	isSuperAdmin: boolean('is_super_admin'),
	createdAt: timestamp('created_at', { withTimezone: true }),
	updatedAt: timestamp('updated_at', { withTimezone: true }),
	phone: text('phone'),
	phoneConfirmedAt: timestamp('phone_confirmed_at', { withTimezone: true }),
	phoneChange: text('phone_change'),
	phoneChangeToken: varchar('phone_change_token'),
	phoneChangeSentAt: timestamp('phone_change_sent_at', { withTimezone: true }),
	confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
	emailChangeTokenCurrent: varchar('email_change_token_current'),
	emailChangeConfirmStatus: smallint('email_change_confirm_status'),
	bannedUntil: timestamp('banned_until', { withTimezone: true }),
	reauthenticationToken: varchar('reauthentication_token'),
	reauthenticationSentAt: timestamp('reauthentication_sent_at', { withTimezone: true }),
	isSsoUser: boolean('is_sso_user'),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	isAnonymous: boolean('is_anonymous'),
})

export const authUsersRelations = relations(authUsers, ({ many }) => ({
	publicUsers: many(users),
}))

/* ────────────────────────────────────────────────────────────────
   public.users
────────────────────────────────────────────────────────────────── */

export const users = pgTable('users', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	userId: uuid('user_id')
		.notNull()
		.unique()
		.references(() => authUsers.id),
	displayName: text('display_name'),
	birthMonth: birthMonthEnum('birth_month'),
	birthDay: smallint('birth_day'),
	isAdmin: boolean('is_admin').default(false).notNull(),
	partnerUserId: uuid('partner_user_id').references(() => authUsers.id),
	image: text('image'),
})

export const usersRelations = relations(users, ({ one, many }) => ({
	authUser: one(authUsers, {
		fields: [users.userId],
		references: [authUsers.id],
	}),
	ownedLists: many(lists),
	listItems: many(listItems),
	itemComments: many(itemComments),
	listAddons: many(listAddons),
	listEditors: many(listEditors),
	userEditorsOwned: many(userEditors, { relationName: 'owner' }),
	userEditorsAsEditor: many(userEditors, { relationName: 'editor' }),
	userViewersOwned: many(userViewers, { relationName: 'viewerOwner' }),
	userViewersAsViewer: many(userViewers, { relationName: 'viewer' }),
}))

/* ────────────────────────────────────────────────────────────────
   public.lists
────────────────────────────────────────────────────────────────── */

export const lists = pgTable('lists', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	name: text('name').notNull(),
	type: text('type').default('wishlist'),
	active: boolean('active').default(true),
	userId: uuid('user_id')
		.notNull()
		.default(sql`auth.uid()`)
		.references(() => authUsers.id),
	recipientUserId: uuid('recipient_user_id').references(() => users.userId),
	private: boolean('private').default(false).notNull(),
	primary: boolean('primary').default(false).notNull(),
	description: text('description'),
})

export const listsRelations = relations(lists, ({ one, many }) => ({
	ownerAuthUser: one(authUsers, {
		fields: [lists.userId],
		references: [authUsers.id],
	}),
	recipientUser: one(users, {
		fields: [lists.recipientUserId],
		references: [users.userId],
	}),
	items: many(listItems),
	addons: many(listAddons),
	editors: many(listEditors),
}))

/* ────────────────────────────────────────────────────────────────
   public.list_items
────────────────────────────────────────────────────────────────── */

export const listItems = pgTable('list_items', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	listId: bigint('list_id', { mode: 'number' })
		.notNull()
		.references(() => lists.id),
	title: text('title').notNull(),
	url: text('url'),
	scrape: jsonb('scrape'),
	userId: uuid('user_id')
		.notNull()
		.default(sql`auth.uid()`)
		.references(() => authUsers.id),
	priority: priorityEnum('priority').default('normal').notNull(),
	notes: text('notes'),
	imageUrl: text('image_url'),
	status: statusEnum('status').default('incomplete').notNull(),
	archived: boolean('archived').default(false).notNull(),
	price: text('price'),
	quantity: smallint('quantity').default(1).notNull(),
	tags: jsonb('tags'), // Postgres showed ARRAY (type unspecified)
	updatedAt: timestamp('updated_at', { withTimezone: true }),
})

export const listItemsRelations = relations(listItems, ({ one, many }) => ({
	list: one(lists, {
		fields: [listItems.listId],
		references: [lists.id],
	}),
	ownerAuthUser: one(authUsers, {
		fields: [listItems.userId],
		references: [authUsers.id],
	}),
	comments: many(itemComments),
	gifts: many(giftedItems),
	scrapes: many(scrapes),
}))

/* ────────────────────────────────────────────────────────────────
   public.item_comments
────────────────────────────────────────────────────────────────── */

export const itemComments = pgTable('item_comments', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	comments: text('comments').notNull(),
	itemId: bigint('item_id', { mode: 'number' })
		.notNull()
		.references(() => listItems.id),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.userId),
	editedAt: timestamp('edited_at', { withTimezone: true }),
	archived: boolean('archived').default(false),
})

export const itemCommentsRelations = relations(itemComments, ({ one }) => ({
	item: one(listItems, {
		fields: [itemComments.itemId],
		references: [listItems.id],
	}),
	user: one(users, {
		fields: [itemComments.userId],
		references: [users.userId],
	}),
}))

/* ────────────────────────────────────────────────────────────────
   public.gifted_items
────────────────────────────────────────────────────────────────── */

export const giftedItems = pgTable('gifted_items', {
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	itemId: bigint('item_id', { mode: 'number' }).references(() => listItems.id),
	quantity: smallint('quantity').default(1).notNull(),
	gifterId: uuid('gifter_id')
		.notNull()
		.default(sql`auth.uid()`)
		.references(() => authUsers.id),
	giftId: bigserial('gift_id', { mode: 'number' }).primaryKey().unique(),
	additionalGifterIds: jsonb('additional_gifter_ids'),
})

export const giftedItemsRelations = relations(giftedItems, ({ one }) => ({
	item: one(listItems, {
		fields: [giftedItems.itemId],
		references: [listItems.id],
	}),
	gifterAuthUser: one(authUsers, {
		fields: [giftedItems.gifterId],
		references: [authUsers.id],
	}),
}))

/* ────────────────────────────────────────────────────────────────
   public.list_addons
────────────────────────────────────────────────────────────────── */

export const listAddons = pgTable('list_addons', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	listId: bigint('list_id', { mode: 'number' })
		.notNull()
		.references(() => lists.id),
	description: text('description').notNull(),
	userId: uuid('user_id')
		.notNull()
		.default(sql`auth.uid()`)
		.references(() => authUsers.id),
	archived: boolean('archived').default(false).notNull(),
})

export const listAddonsRelations = relations(listAddons, ({ one }) => ({
	list: one(lists, {
		fields: [listAddons.listId],
		references: [lists.id],
	}),
	user: one(users, {
		fields: [listAddons.userId],
		references: [users.userId],
	}),
}))

/* ────────────────────────────────────────────────────────────────
   public.list_editors
────────────────────────────────────────────────────────────────── */

export const listEditors = pgTable('list_editors', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	listId: bigint('list_id', { mode: 'number' })
		.notNull()
		.references(() => lists.id),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.userId),
	ownerId: uuid('owner_id')
		.default(sql`auth.uid()`)
		.references(() => users.userId),
})

export const listEditorsRelations = relations(listEditors, ({ one }) => ({
	list: one(lists, {
		fields: [listEditors.listId],
		references: [lists.id],
	}),
	user: one(users, {
		fields: [listEditors.userId],
		references: [users.userId],
	}),
	owner: one(users, {
		fields: [listEditors.ownerId],
		references: [users.userId],
	}),
}))

/* ────────────────────────────────────────────────────────────────
   public.scrapes
────────────────────────────────────────────────────────────────── */

export const scrapes = pgTable('scrapes', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
	url: text('url').notNull(),
	listItemId: bigint('list_item_id', { mode: 'number' }).references(() => listItems.id),
	scrapeResult: jsonb('scrape_result'),
	title: text('title'),
	titleClean: text('title_clean'),
	description: text('description'),
	price: text('price'),
	priceCurrency: text('price_currency'),
	scraperId: text('scraper_id'),
	imageUrls: jsonb('image_urls'),
})

export const scrapesRelations = relations(scrapes, ({ one }) => ({
	listItem: one(listItems, {
		fields: [scrapes.listItemId],
		references: [listItems.id],
	}),
}))

/* ────────────────────────────────────────────────────────────────
   public.user_editors
────────────────────────────────────────────────────────────────── */

export const userEditors = pgTable('user_editors', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	ownerUserId: uuid('owner_user_id')
		.notNull()
		.references(() => users.userId),
	editorUserId: uuid('editor_user_id')
		.notNull()
		.references(() => users.userId),
	canMakeList: boolean('can_make_list').default(true).notNull(),
})

export const userEditorsRelations = relations(userEditors, ({ one }) => ({
	owner: one(users, {
		fields: [userEditors.ownerUserId],
		references: [users.userId],
		relationName: 'owner',
	}),
	editor: one(users, {
		fields: [userEditors.editorUserId],
		references: [users.userId],
		relationName: 'editor',
	}),
}))

/* ────────────────────────────────────────────────────────────────
   public.user_viewers
────────────────────────────────────────────────────────────────── */

export const userViewers = pgTable('user_viewers', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	viewerUserId: uuid('viewer_user_id')
		.notNull()
		.references(() => users.userId),
	canView: boolean('can_view').default(true).notNull(),
	ownerUserId: uuid('owner_user_id')
		.notNull()
		.default(sql`gen_random_uuid()`)
		.references(() => users.userId),
})

export const userViewersRelations = relations(userViewers, ({ one }) => ({
	viewer: one(users, {
		fields: [userViewers.viewerUserId],
		references: [users.userId],
		relationName: 'viewer',
	}),
	viewerOwner: one(users, {
		fields: [userViewers.ownerUserId],
		references: [users.userId],
		relationName: 'viewerOwner',
	}),
}))

/*
  ────────────────────────────────────────────────────────────────
  Zod validators
  ────────────────────────────────────────────────────────────────
*/

export const insertAuthUserSchema = createInsertSchema(authUsers)
export const selectAuthUserSchema = createSelectSchema(authUsers)

export const insertUserSchema = createInsertSchema(users)
export const selectUserSchema = createSelectSchema(users)

export const insertListSchema = createInsertSchema(lists)
export const selectListSchema = createSelectSchema(lists)

export const insertListItemSchema = createInsertSchema(listItems)
export const selectListItemSchema = createSelectSchema(listItems)

export const insertItemCommentSchema = createInsertSchema(itemComments)
export const selectItemCommentSchema = createSelectSchema(itemComments)

export const insertGiftedItemSchema = createInsertSchema(giftedItems)
export const selectGiftedItemSchema = createSelectSchema(giftedItems)

export const insertListAddonSchema = createInsertSchema(listAddons)
export const selectListAddonSchema = createSelectSchema(listAddons)

export const insertListEditorSchema = createInsertSchema(listEditors)
export const selectListEditorSchema = createSelectSchema(listEditors)

export const insertScrapeSchema = createInsertSchema(scrapes)
export const selectScrapeSchema = createSelectSchema(scrapes)

export const insertUserEditorSchema = createInsertSchema(userEditors)
export const selectUserEditorSchema = createSelectSchema(userEditors)

export const insertUserViewerSchema = createInsertSchema(userViewers)
export const selectUserViewerSchema = createSelectSchema(userViewers)

/*
  Handy TS types
*/

export type AuthUser = typeof authUsers.$inferSelect
export type NewAuthUser = typeof authUsers.$inferInsert

export type PublicUser = typeof users.$inferSelect
export type NewPublicUser = typeof users.$inferInsert

export type List = typeof lists.$inferSelect
export type NewList = typeof lists.$inferInsert

export type ListItem = typeof listItems.$inferSelect
export type NewListItem = typeof listItems.$inferInsert

export type GiftedItem = typeof giftedItems.$inferSelect
export type NewGiftedItem = typeof giftedItems.$inferInsert
