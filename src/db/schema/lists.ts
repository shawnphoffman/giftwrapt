import { relations } from 'drizzle-orm'
import { boolean, index, integer, numeric, pgTable, serial, text } from 'drizzle-orm/pg-core'

import { listTypeEnum } from './enums'
import { itemGroups, items } from './items'
import { listEditors } from './permissions'
import { timestamps } from './shared'
import { users } from './users'

// ===============================
// LISTS
// ===============================
export const lists = pgTable(
	'lists',
	{
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		type: listTypeEnum('type').default('wishlist').notNull(),
		isActive: boolean('is_active').default(true).notNull(),
		isPrivate: boolean('is_private').default(false).notNull(),
		isPrimary: boolean('is_primary').default(false).notNull(),
		description: text('description'),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// Only populated for type === 'giftideas'. The user this list is tracking ideas FOR.
		// Never visible to that user.
		giftIdeasTargetUserId: text('gift_ideas_target_user_id').references(() => users.id, { onDelete: 'set null' }),
		...timestamps,
	},
	table => [
		index('lists_ownerId_idx').on(table.ownerId),
		index('lists_ownerId_isActive_idx').on(table.ownerId, table.isActive),
		index('lists_isPrivate_isActive_idx').on(table.isPrivate, table.isActive),
		index('lists_giftIdeasTargetUserId_idx').on(table.giftIdeasTargetUserId),
	]
)

export const listsRelations = relations(lists, ({ one, many }) => ({
	owner: one(users, {
		fields: [lists.ownerId],
		references: [users.id],
		relationName: 'owner',
	}),
	giftIdeasTarget: one(users, {
		fields: [lists.giftIdeasTargetUserId],
		references: [users.id],
		relationName: 'giftIdeasTarget',
	}),
	itemGroups: many(itemGroups),
	items: many(items),
	addons: many(listAddons),
	editors: many(listEditors),
}))

export type List = typeof lists.$inferSelect
export type NewList = typeof lists.$inferInsert

// ===============================
// LIST ADDONS (off-list gifts)
// ===============================
// Gifts that don't correspond to an existing list item - the gifter
// volunteers they're bringing something extra. Visible only to gifters
// (spoiler protection same as claims).
export const listAddons = pgTable(
	'list_addons',
	{
		id: serial('id').primaryKey(),
		listId: integer('list_id')
			.notNull()
			.references(() => lists.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		description: text('description').notNull(),
		totalCost: numeric('total_cost'),
		notes: text('notes'),
		isArchived: boolean('is_archived').default(false).notNull(),
		...timestamps,
	},
	table => [index('list_addons_listId_idx').on(table.listId), index('list_addons_userId_idx').on(table.userId)]
)

export const listAddonsRelations = relations(listAddons, ({ one }) => ({
	list: one(lists, {
		fields: [listAddons.listId],
		references: [lists.id],
	}),
	user: one(users, {
		fields: [listAddons.userId],
		references: [users.id],
	}),
}))

export type ListAddon = typeof listAddons.$inferSelect
export type NewListAddon = typeof listAddons.$inferInsert
