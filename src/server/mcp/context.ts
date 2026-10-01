import type { Logger } from 'pino'

import type { SchemaDatabase } from '@/db'
import type { AppSettings } from '@/lib/settings'

/** Who a tool call runs as. Resolved from the OAuth access token by `auth.ts`. */
export type McpActor = {
	userId: string
	isAdmin: boolean
	/** The registered OAuth client (Claude, Cursor, ...) making the call. */
	clientId: string
	tokenId: string
	scopes: Array<string>
}

/** Per-request context threaded into every tool handler. */
export type ToolContext = {
	actor: McpActor
	settings: AppSettings
	dbx: SchemaDatabase
	log: Logger
	now: Date
}
