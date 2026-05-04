import { relations } from 'drizzle-orm'
import { bigint, boolean, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

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

// Better-auth's API key store. Used by the `/api/mobile/*` Hono surface
// for native-client auth (iOS companion app). Each device install mints
// its own key, individually revocable, separate from the cookie-based
// session token the web uses. Schema mirrors better-auth's apiKey
// plugin contract.
export const apikey = pgTable(
	'apikey',
	{
		id: text('id').primaryKey(),
		name: text('name'),
		start: text('start'),
		prefix: text('prefix'),
		key: text('key').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		refillInterval: integer('refill_interval'),
		refillAmount: integer('refill_amount'),
		lastRefillAt: timestamp('last_refill_at'),
		enabled: boolean('enabled').notNull().default(true),
		rateLimitEnabled: boolean('rate_limit_enabled').notNull().default(true),
		rateLimitTimeWindow: integer('rate_limit_time_window'),
		rateLimitMax: integer('rate_limit_max'),
		requestCount: integer('request_count').notNull().default(0),
		remaining: integer('remaining'),
		lastRequest: timestamp('last_request'),
		expiresAt: timestamp('expires_at'),
		permissions: text('permissions'),
		metadata: text('metadata'),
		...timestamps,
	},
	table => [index('apikey_key_idx').on(table.key), index('apikey_userId_idx').on(table.userId)]
)

// Better-auth `twoFactor()` plugin store. Holds the per-user TOTP secret
// and the JSON-encoded backup-codes array. Better-auth also adds a
// `twoFactorEnabled boolean` to the `users` table (see users.ts) so the
// session can advertise the gate without joining this table on every
// request. Schema mirrors better-auth/plugins/two-factor/schema.
export const twoFactor = pgTable(
	'twoFactor',
	{
		id: text('id').primaryKey(),
		secret: text('secret').notNull(),
		backupCodes: text('backup_codes').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
	},
	table => [index('twoFactor_userId_idx').on(table.userId), index('twoFactor_secret_idx').on(table.secret)]
)

// Better-auth `passkey()` plugin store (WebAuthn credentials). One row
// per registered authenticator. `credentialID` is the WebAuthn
// credential ID (base64url) and is unique per credential; `publicKey`
// is the COSE-encoded public key used for signature verification.
// Schema mirrors @better-auth/passkey/schema.
export const passkey = pgTable(
	'passkey',
	{
		id: text('id').primaryKey(),
		name: text('name'),
		publicKey: text('public_key').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		credentialID: text('credential_id').notNull(),
		counter: integer('counter').notNull(),
		deviceType: text('device_type').notNull(),
		backedUp: boolean('backed_up').notNull(),
		transports: text('transports'),
		createdAt: timestamp('created_at').defaultNow(),
		aaguid: text('aaguid'),
	},
	table => [index('passkey_userId_idx').on(table.userId), index('passkey_credentialID_idx').on(table.credentialID)]
)

// Better-auth `oidcProvider()` plugin tables. The app *is* the OIDC
// provider (issues tokens to third-party clients). Three tables:
//
//   oauthApplication: registered OIDC clients (client_id/secret,
//     redirect URIs, type, optional owner). Admin-managed.
//   oauthAccessToken: issued access + refresh token pairs scoped to
//     a (clientId, userId) pair.
//   oauthConsent:     per-user consent decisions for a given client
//     so the consent screen only appears once per scope set.
//
// Field shapes mirror better-auth/plugins/oidc-provider/schema. We use
// `text` for every datetime to match better-auth's `type: 'date'` write
// path which serializes via the drizzle adapter.
export const oauthApplication = pgTable(
	'oauthApplication',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		icon: text('icon'),
		metadata: text('metadata'),
		clientId: text('client_id').notNull().unique(),
		clientSecret: text('client_secret'),
		redirectUrls: text('redirect_urls').notNull(),
		type: text('type').notNull(),
		disabled: boolean('disabled').notNull().default(false),
		userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
	},
	table => [index('oauthApplication_userId_idx').on(table.userId), index('oauthApplication_clientId_idx').on(table.clientId)]
)

export const oauthAccessToken = pgTable(
	'oauthAccessToken',
	{
		id: text('id').primaryKey(),
		accessToken: text('access_token').notNull().unique(),
		refreshToken: text('refresh_token').notNull().unique(),
		accessTokenExpiresAt: timestamp('access_token_expires_at').notNull(),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at').notNull(),
		clientId: text('client_id')
			.notNull()
			.references(() => oauthApplication.clientId, { onDelete: 'cascade' }),
		userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
		scopes: text('scopes').notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
	},
	table => [
		index('oauthAccessToken_clientId_idx').on(table.clientId),
		index('oauthAccessToken_userId_idx').on(table.userId),
		index('oauthAccessToken_accessToken_idx').on(table.accessToken),
		index('oauthAccessToken_refreshToken_idx').on(table.refreshToken),
	]
)

export const oauthConsent = pgTable(
	'oauthConsent',
	{
		id: text('id').primaryKey(),
		clientId: text('client_id')
			.notNull()
			.references(() => oauthApplication.clientId, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		scopes: text('scopes').notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
		consentGiven: boolean('consent_given').notNull(),
	},
	table => [index('oauthConsent_clientId_idx').on(table.clientId), index('oauthConsent_userId_idx').on(table.userId)]
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
