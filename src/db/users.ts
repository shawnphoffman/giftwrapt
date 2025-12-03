import { boolean, index, pgTable, smallint, text, timestamp } from 'drizzle-orm/pg-core'
import { timestamps } from './shared'
import { relations } from 'drizzle-orm'
import { session, account } from './auth'
import { birthMonthEnum } from './enums'
import { lists } from './lists'

// ===============================
// USERS
// ===============================
export const users = pgTable(
	'users',
	{
		id: text('id').primaryKey(), // should this be serial?
		email: text('email').notNull().unique(),
		name: text('name'),
		//
		role: text('role').default('user').notNull(),
		banned: boolean('banned').default(false).notNull(),
		banReason: text('ban_reason'),
		banExpires: timestamp('ban_expires'),
		//
		birthMonth: birthMonthEnum('birth_month'),
		birthDay: smallint('birth_day'),
		isAdmin: boolean('is_admin').default(false).notNull(),
		image: text('image'),
		partnerId: text('partner_id'),
		...timestamps,
		// TO_REVIEW
		emailVerified: boolean('email_verified').default(false).notNull(),
	},
	table => [
		index('users_partnerId_idx').on(table.partnerId), // For partner relationship queries
		index('users_isAdmin_idx').on(table.isAdmin), // For admin queries
	]
)

// ------------------------------
// RELATIONS
// ------------------------------
export const usersRelations = relations(users, ({ many, one }) => ({
	sessions: many(session),
	accounts: many(account),
	//
	partner: one(users, {
		fields: [users.partnerId],
		references: [users.id],
	}),
	//
	lists: many(lists),
}))

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
