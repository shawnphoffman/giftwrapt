import { boolean, pgTable, serial, text } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { timestamps } from './shared'
import { user } from './users'
import { statusEnum } from './enums'

// ===============================
// RE-EXPORTS
// ===============================
export * from './enums'
export * from './users'
export * from './auth'

// ===============================
// TEMP Todos
// ===============================
export const todos = pgTable('todos', {
	id: serial('id').primaryKey(),
	title: text('title').notNull(),
	status: statusEnum('status').default('incomplete').notNull(),
	isArchived: boolean('is_archived').default(false).notNull(),
	creatorId: text('creator_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	//
	...timestamps,
})

// ------------------------------
// RELATIONS
// ------------------------------
export const todosRelations = relations(todos, ({ one }) => ({
	creator: one(user, {
		fields: [todos.creatorId],
		references: [user.id],
	}),
}))
