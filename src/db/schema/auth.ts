import { relations } from 'drizzle-orm'
import { bigint, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { timestamps } from './shared'
import { users } from './users'

// ===============================
// AUTH
// ===============================
export const session = pgTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: timestamp('expires_at').notNull(),
		token: text('token').notNull().unique(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		impersonatedBy: text('impersonated_by').references(() => users.id, { onDelete: 'cascade' }),
		//
		...timestamps,
	},
	table => [
		index('session_userId_idx').on(table.userId),
		index('session_expiresAt_idx').on(table.expiresAt), // For cleanup queries
		index('session_impersonatedBy_idx').on(table.impersonatedBy), // For impersonation queries
	]
)

export const account = pgTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at'),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
		scope: text('scope'),
		password: text('password'),
		...timestamps,
	},
	table => [
		index('account_userId_idx').on(table.userId),
		index('account_provider_account_idx').on(table.providerId, table.accountId), // For OAuth lookups
	]
)

export const verification = pgTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: timestamp('expires_at').notNull(),
		...timestamps,
	},
	table => [
		index('verification_identifier_idx').on(table.identifier),
		index('verification_expiresAt_idx').on(table.expiresAt), // For cleanup queries
	]
)

// Better-auth's database-backed rate limit store. Switched on in
// `src/lib/auth.ts` so the limiter is shared across instances on
// multi-instance deploys (Vercel, Railway >1 replica, Render >1 replica).
// `key` is a `${ip|userId}:${endpoint}`-shaped string; `lastRequest` is a
// unix-ms epoch (better-auth writes it as a JS number, hence bigint).
export const rateLimit = pgTable(
	'rateLimit',
	{
		id: text('id').primaryKey(),
		key: text('key').notNull(),
		count: integer('count').notNull(),
		lastRequest: bigint('last_request', { mode: 'number' }),
	},
	table => [index('rateLimit_key_idx').on(table.key)]
)

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(users, {
		fields: [session.userId],
		references: [users.id],
	}),
}))

export const accountRelations = relations(account, ({ one }) => ({
	user: one(users, {
		fields: [account.userId],
		references: [users.id],
	}),
}))
