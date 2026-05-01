import { relations } from 'drizzle-orm'
import { boolean, index, pgTable, smallint, text, timestamp } from 'drizzle-orm/pg-core'
import z from 'zod'

import { LIMITS } from '@/lib/validation/limits'

import { account, session } from './auth'
import { birthMonthEnum, birthMonthEnumValues, roleEnum, roleEnumValues } from './enums'
import { lists } from './lists'
import { timestamps } from './shared'

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
		role: roleEnum('role').default('user').notNull(),
		banned: boolean('banned').default(false).notNull(),
		banReason: text('ban_reason'),
		banExpires: timestamp('ban_expires'),
		//
		birthMonth: birthMonthEnum('birth_month'),
		birthDay: smallint('birth_day'),
		birthYear: smallint('birth_year'),
		image: text('image'),
		partnerId: text('partner_id'),
		// Set by better-auth's two-factor plugin once a user finishes
		// TOTP enrollment. Read by the sign-in flow to know whether to
		// route to the 2FA challenge after a successful password.
		twoFactorEnabled: boolean('two_factor_enabled').default(false).notNull(),
		...timestamps,
		// TO_REVIEW
		emailVerified: boolean('email_verified').default(false).notNull(),
	},
	table => [
		index('users_partnerId_idx').on(table.partnerId), // For partner relationship queries
	]
)

export const UserSchema = z.object({
	email: z.email('Invalid email address').max(LIMITS.EMAIL, `Email must be ${LIMITS.EMAIL} characters or fewer`),
	name: z.string().min(1, 'Name is required').max(LIMITS.SHORT_NAME, `Name must be ${LIMITS.SHORT_NAME} characters or fewer`),
	role: z.enum(roleEnumValues),
	birthMonth: z.enum(birthMonthEnumValues).nullish(),
	birthDay: z
		.union([
			z
				.number()
				.int('Birth day must be a whole number')
				.min(1, 'Birth day must be between 1 and 31')
				.max(31, 'Birth day must be between 1 and 31'),
			z.null(),
		])
		.optional(),
	birthYear: z
		.union([
			z
				.number()
				.int('Birth year must be a whole number')
				.min(1900, 'Birth year must be between 1900 and the current year')
				.max(new Date().getFullYear(), 'Birth year must be between 1900 and the current year'),
			z.null(),
		])
		.optional(),
	guardianIds: z.array(z.string()).optional(),
	partnerId: z.string().optional(),
	image: z.string().max(LIMITS.URL).optional(),
})

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
	lists: many(lists, { relationName: 'owner' }),
}))

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
