// import { relations } from 'drizzle-orm'
import { boolean, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'

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
		isRestricted: boolean('is_restricted').default(false).notNull(),
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
