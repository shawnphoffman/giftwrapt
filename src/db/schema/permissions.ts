import { relations } from 'drizzle-orm'
import { boolean, index, integer, pgTable, primaryKey, serial, text, unique } from 'drizzle-orm/pg-core'

import { lists } from './lists'
import { timestamps } from './shared'
import { users } from './users'

export const userRelationships = pgTable(
	'user_relationships',
	{
		ownerUserId: text('owner_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		viewerUserId: text('viewer_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		canView: boolean('can_view').default(true).notNull(),
		canEdit: boolean('can_edit').default(false).notNull(),
		...timestamps,
	},
	table => [primaryKey({ columns: [table.ownerUserId, table.viewerUserId] })]
)

export const guardianships = pgTable(
	'guardianships',
	{
		parentUserId: text('parent_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		childUserId: text('child_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		...timestamps,
	},
	table => [primaryKey({ columns: [table.parentUserId, table.childUserId] })]
)

// ===============================
// LIST EDITORS (list-level permission grant)
// ===============================
// Grants another user edit rights on a specific list. Layered above user-level
// canEdit in userRelationships; see spec §2.6 for resolution order.
// ownerId is redundant (derivable via list.ownerId) but stored for query ergonomics.
export const listEditors = pgTable(
	'list_editors',
	{
		id: serial('id').primaryKey(),
		listId: integer('list_id')
			.notNull()
			.references(() => lists.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		...timestamps,
	},
	table => [
		unique('list_editors_listId_userId_unique').on(table.listId, table.userId),
		index('list_editors_userId_idx').on(table.userId),
		index('list_editors_ownerId_idx').on(table.ownerId),
	]
)

export const listEditorsRelations = relations(listEditors, ({ one }) => ({
	list: one(lists, {
		fields: [listEditors.listId],
		references: [lists.id],
	}),
	user: one(users, {
		fields: [listEditors.userId],
		references: [users.id],
		relationName: 'listEditorUser',
	}),
	owner: one(users, {
		fields: [listEditors.ownerId],
		references: [users.id],
		relationName: 'listEditorOwner',
	}),
}))

export type ListEditor = typeof listEditors.$inferSelect
export type NewListEditor = typeof listEditors.$inferInsert
