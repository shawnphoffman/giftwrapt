// Todo-list rows. Deliberately separate from `items` because the data
// shape is very different: no price/quantity/url/vendor/image/rating,
// no `giftedItems` join, no spoiler-protected claims. A todo is just a
// title, optional markdown notes, a priority, and "is it done."
//
// Claim semantics: in todo lists, claiming IS completion. A todo with
// `claimedByUserId IS NULL` is open; a todo with it set is done, with
// the claimer as the "who finished this" attribution. Any viewer can
// toggle claim state (unlike gift claims, which have a self-claim block
// and edit-access gates). No partial-quantity claims, no co-claimers.
//
// Visibility: all viewers see the claimer. There is no spoiler
// protection because todos have nothing to spoil.

import { relations } from 'drizzle-orm'
import { index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

import { priorityEnum } from './enums'
import { lists } from './lists'
import { timestamps } from './shared'
import { users } from './users'

export const todoItems = pgTable(
	'todo_items',
	{
		id: serial('id').primaryKey(),
		listId: integer('list_id')
			.notNull()
			.references(() => lists.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		// Markdown-rendered in the row UI. URLs go here too.
		notes: text('notes'),
		priority: priorityEnum('priority').default('normal').notNull(),
		// Who marked this done. Null when not done. Survives the user's
		// deletion (SET NULL): the todo stays in the list with an
		// unattributed completion that any viewer can re-claim.
		claimedByUserId: text('claimed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
		claimedAt: timestamp('claimed_at', { withTimezone: true }),
		// Manual position within the list. Lower first; nulls last.
		sortOrder: integer('sort_order'),
		...timestamps,
	},
	table => [
		index('todo_items_listId_idx').on(table.listId),
		index('todo_items_listId_claimedByUserId_idx').on(table.listId, table.claimedByUserId),
	]
)

export const todoItemsRelations = relations(todoItems, ({ one }) => ({
	list: one(lists, {
		fields: [todoItems.listId],
		references: [lists.id],
	}),
	claimedBy: one(users, {
		fields: [todoItems.claimedByUserId],
		references: [users.id],
	}),
}))

export type TodoItem = typeof todoItems.$inferSelect
export type NewTodoItem = typeof todoItems.$inferInsert
