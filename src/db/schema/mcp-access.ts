import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

import { oauthApplication } from './auth'
import { users } from './users'

// =====================================================================
// MCP CLIENT ACCESS (read-only versus full, per user and assistant)
// =====================================================================
//
// What a connected AI assistant may do on a user's account. The user
// picks on the consent screen and can change it later under Settings,
// Connected Apps.
//
// This is core's own record, not an OAuth scope: the better-auth `mcp()`
// plugin fixes the granted scope at the authorize step, before the
// consent page is shown, so the consent choice cannot narrow it there.
// The token guard (src/server/mcp/auth.ts) reads this row on every
// request instead.
//
// No row means full access, which is what every grant issued before the
// choice existed has.

export const MCP_ACCESS_LEVELS = ['read', 'write'] as const
export type McpAccessLevel = (typeof MCP_ACCESS_LEVELS)[number]

export const mcpClientAccess = pgTable(
	'mcp_client_access',
	{
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// The registered OAuth client. Cascades when the client is deleted,
		// including the idle-client sweep.
		clientId: text('client_id')
			.notNull()
			.references(() => oauthApplication.clientId, { onDelete: 'cascade' }),
		// 'read': only tools that change nothing. 'write': everything the
		// user can do.
		access: text('access').$type<McpAccessLevel>().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
	},
	table => [primaryKey({ columns: [table.userId, table.clientId] })]
)
