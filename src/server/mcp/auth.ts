// Resolves the OAuth bearer token on `/api/mcp` to an actor.
//
// Deliberately not better-auth's `withMcpAuth`: its `getMcpSession` in
// 1.4.22 is a bare token lookup that never checks `accessTokenExpiresAt`,
// strips "Bearer " case-sensitively, and knows nothing about disabled
// clients, banned users, or child accounts. This guard does all of that
// with one query and never falls back to the session cookie.

import { and, eq, lt, sql } from 'drizzle-orm'

import { db, type SchemaDatabase } from '@/db'
import { mcpClientAccess, oauthAccessToken, oauthApplication, users } from '@/db/schema'
import { isUserBanned } from '@/lib/user-ban'

import type { McpActor } from './context'

export type McpAuthFailure =
	| 'missing-token'
	| 'invalid-token'
	| 'expired-token'
	| 'client-disabled'
	| 'user-not-found'
	| 'banned'
	| 'child-not-allowed'

export type McpAuthResult = { ok: true; actor: McpActor; token: string; expiresAt: Date } | { ok: false; reason: McpAuthFailure }

const LAST_USED_TOUCH_MS = 60 * 1000

export function extractBearer(headers: Headers): string | null {
	const raw = headers.get('authorization')
	if (!raw) return null
	const match = /^bearer\s+(.+)$/iu.exec(raw.trim())
	const token = match?.[1]?.trim()
	return token && token.length > 0 ? token : null
}

export async function resolveMcpActor(headers: Headers, dbx: SchemaDatabase = db, now: Date = new Date()): Promise<McpAuthResult> {
	const token = extractBearer(headers)
	if (!token) return { ok: false, reason: 'missing-token' }

	const rows = await dbx
		.select({
			tokenId: oauthAccessToken.id,
			userId: oauthAccessToken.userId,
			clientId: oauthAccessToken.clientId,
			scopes: oauthAccessToken.scopes,
			accessTokenExpiresAt: oauthAccessToken.accessTokenExpiresAt,
			updatedAt: oauthAccessToken.updatedAt,
			clientDisabled: oauthApplication.disabled,
		})
		.from(oauthAccessToken)
		.innerJoin(oauthApplication, eq(oauthApplication.clientId, oauthAccessToken.clientId))
		.where(eq(oauthAccessToken.accessToken, token))
		.limit(1)
	const row = rows.at(0)
	if (!row) return { ok: false, reason: 'invalid-token' }
	if (row.accessTokenExpiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired-token' }
	if (row.clientDisabled) return { ok: false, reason: 'client-disabled' }
	if (!row.userId) return { ok: false, reason: 'user-not-found' }

	const user = await dbx.query.users.findFirst({
		where: eq(users.id, row.userId),
		columns: { id: true, role: true, banned: true, banExpires: true },
	})
	if (!user) return { ok: false, reason: 'user-not-found' }
	if (isUserBanned(user, now)) return { ok: false, reason: 'banned' }
	// Settled in plan 20 (F8): a child account cannot drive an AI assistant.
	if (user.role === 'child') return { ok: false, reason: 'child-not-allowed' }

	// Read-only when the user chose it for this assistant. No row means the
	// grant predates the choice, which is full access.
	const access = await dbx
		.select({ access: mcpClientAccess.access })
		.from(mcpClientAccess)
		.where(and(eq(mcpClientAccess.userId, user.id), eq(mcpClientAccess.clientId, row.clientId)))
		.limit(1)
	const canWrite = access.at(0)?.access !== 'read'

	// `updatedAt` doubles as "last used" on the admin and connected-apps
	// screens. Touch it at most once a minute so a chatty client doesn't
	// turn every tool call into a write.
	if (now.getTime() - row.updatedAt.getTime() > LAST_USED_TOUCH_MS) {
		await dbx
			.update(oauthAccessToken)
			.set({ updatedAt: now })
			.where(and(eq(oauthAccessToken.id, row.tokenId), lt(oauthAccessToken.updatedAt, sql`${now}::timestamp - interval '1 minute'`)))
	}

	return {
		ok: true,
		token,
		expiresAt: row.accessTokenExpiresAt,
		actor: {
			userId: user.id,
			isAdmin: user.role === 'admin',
			clientId: row.clientId,
			tokenId: row.tokenId,
			scopes: row.scopes.split(' ').filter(Boolean),
			canWrite,
		},
	}
}
