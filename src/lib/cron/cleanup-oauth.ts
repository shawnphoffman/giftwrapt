import { and, isNull, lt, notExists, or, sql } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { oauthAccessToken, oauthApplication } from '@/db/schema'
import { MCP_IDLE_CLIENT_DAYS } from '@/lib/mcp-config'

export type CleanupOauthResult = { tokensDeleted: number; clientsDeleted: number }

type Args = {
	db: SchemaDatabase
	now: Date
	idleClientDays?: number
}

// Sweeps the better-auth `mcp()` plugin tables. Rides the daily
// cleanup-verification tick.
//
// - Tokens whose refresh window has closed (or that never had one and
//   whose access window has closed) can never be used again.
// - Dynamic client registration is unauthenticated, so every client
//   install and every probe leaves an `oauth_application` row. Rows older
//   than `idleClientDays` with no surviving token are dropped; consents
//   cascade with them. Real clients re-register on their next connect.
export async function cleanupOauthImpl({ db, now, idleClientDays = MCP_IDLE_CLIENT_DAYS }: Args): Promise<CleanupOauthResult> {
	const tokens = await db
		.delete(oauthAccessToken)
		.where(
			or(
				lt(oauthAccessToken.refreshTokenExpiresAt, now),
				and(isNull(oauthAccessToken.refreshTokenExpiresAt), lt(oauthAccessToken.accessTokenExpiresAt, now))
			)
		)
		.returning({ id: oauthAccessToken.id })

	const idleBefore = new Date(now.getTime() - idleClientDays * 24 * 60 * 60 * 1000)
	const clients = await db
		.delete(oauthApplication)
		.where(
			and(
				lt(oauthApplication.createdAt, idleBefore),
				notExists(
					db
						.select({ one: sql`1` })
						.from(oauthAccessToken)
						.where(sql`${oauthAccessToken.clientId} = ${oauthApplication.clientId}`)
				)
			)
		)
		.returning({ id: oauthApplication.id })

	return { tokensDeleted: tokens.length, clientsDeleted: clients.length }
}
