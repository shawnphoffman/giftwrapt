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

// Better-auth `mcp()` plugin store (built on its OIDC provider). Core is
// the OAuth 2.1 authorization server for MCP clients (Claude, Cursor,
// ChatGPT, ...): they register themselves here, the user consents, and
// the resulting tokens authenticate `/api/mcp`. Field names mirror
// better-auth/plugins/oidc-provider/schema; `authenticationScheme` is an
// extra the plugin's register endpoint writes but its schema omits.
// Tokens are stored plaintext by the plugin, which is one reason every
// table here is excluded from backups (`src/lib/backup/tables.ts`).
export const oauthApplication = pgTable(
	'oauth_application',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		icon: text('icon'),
		metadata: text('metadata'),
		clientId: text('client_id').notNull().unique(),
		clientSecret: text('client_secret'),
		redirectUrls: text('redirect_urls').notNull(),
		type: text('type').notNull(),
		authenticationScheme: text('authentication_scheme'),
		disabled: boolean('disabled').notNull().default(false),
		userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
		...timestamps,
	},
	table => [index('oauth_application_userId_idx').on(table.userId)]
)

export const oauthAccessToken = pgTable(
	'oauth_access_token',
	{
		id: text('id').primaryKey(),
		accessToken: text('access_token').notNull().unique(),
		refreshToken: text('refresh_token').unique(),
		accessTokenExpiresAt: timestamp('access_token_expires_at').notNull(),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
		clientId: text('client_id')
			.notNull()
			.references(() => oauthApplication.clientId, { onDelete: 'cascade' }),
		userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
		scopes: text('scopes').notNull(),
		...timestamps,
	},
	table => [
		index('oauth_access_token_clientId_idx').on(table.clientId),
		index('oauth_access_token_userId_idx').on(table.userId),
		index('oauth_access_token_refreshTokenExpiresAt_idx').on(table.refreshTokenExpiresAt), // For cleanup queries
	]
)

export const oauthConsent = pgTable(
	'oauth_consent',
	{
		id: text('id').primaryKey(),
		clientId: text('client_id')
			.notNull()
			.references(() => oauthApplication.clientId, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		scopes: text('scopes').notNull(),
		consentGiven: boolean('consent_given').notNull().default(false),
		...timestamps,
	},
	table => [index('oauth_consent_clientId_idx').on(table.clientId), index('oauth_consent_userId_idx').on(table.userId)]
)
