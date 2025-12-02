import { boolean, pgTable, serial, text } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { timestamps } from './shared'
import { users } from './users'
import { statusEnum } from './enums'

// ===============================
// RE-EXPORTS
// ===============================
export * from './enums'
export * from './users'
export * from './auth'
export * from './lists'
export * from './items'

// Alias for query API compatibility
export { users as user } from './users'

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
		.references(() => users.id, { onDelete: 'cascade' }),
	//
	...timestamps,
})

// ------------------------------
// RELATIONS
// ------------------------------
export const todosRelations = relations(todos, ({ one }) => ({
	creator: one(users, {
		fields: [todos.creatorId],
		references: [users.id],
	}),
}))

export type Todo = typeof todos.$inferSelect
export type NewTodo = typeof todos.$inferInsert
