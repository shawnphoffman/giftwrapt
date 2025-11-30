import { boolean, pgTable, smallint, text, timestamp } from 'drizzle-orm/pg-core'
import { timestamps } from './shared'
import { relations } from 'drizzle-orm'
import { session, account } from './auth'
import { birthMonthEnum } from './enums'

// ===============================
// USERS
// ===============================
export const user = pgTable('user', {
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
})

export const partnerRelations = relations(user, ({ one }) => ({
	partnerUser: one(user, {
		fields: [user.partnerId],
		references: [user.id],
	}),
}))

// ------------------------------
// RELATIONS
// ------------------------------
export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
}))
