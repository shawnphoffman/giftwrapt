// Impls behind /admin/mcp and /settings/connected-apps. Read and revoke
// the better-auth `mcp()` plugin's rows (registered clients, issued
// tokens, consents). Revocation is a row delete: `/api/mcp` resolves the
// actor by looking the access token up, so a deleted row is dead on the
// next request. `dbx` is injectable for the pglite integration harness.

import { and, count, countDistinct, desc, eq, gt, max, sql } from 'drizzle-orm'

import { db, type SchemaDatabase } from '@/db'
import { oauthAccessToken, oauthApplication, oauthConsent, users } from '@/db/schema'

export type OauthClientRow = {
	id: string
	clientId: string
	name: string
	createdAt: string
	disabled: boolean
	/** Tokens whose refresh window is still open. */
	activeGrants: number
	/** Distinct users behind those tokens. */
	activeUsers: number
	lastUsedAt: string | null
}

export type OauthGrantRow = {
	id: string
	clientId: string
	clientName: string
	userId: string | null
	userName: string | null
	userEmail: string | null
	scopes: string
	createdAt: string
	lastUsedAt: string
	accessTokenExpiresAt: string
	refreshTokenExpiresAt: string | null
}

export type ConnectedAppRow = {
	clientId: string
	clientName: string
	icon: string | null
	connectedAt: string
	lastUsedAt: string | null
	activeTokens: number
	/** When the longest-lived refresh token runs out; null means already expired. */
	expiresAt: string | null
}

function iso(value: Date | string | null | undefined): string | null {
	if (!value) return null
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export async function listOauthClientsImpl(dbx: SchemaDatabase = db, now: Date = new Date()): Promise<Array<OauthClientRow>> {
	const rows = await dbx
		.select({
			id: oauthApplication.id,
			clientId: oauthApplication.clientId,
			name: oauthApplication.name,
			createdAt: oauthApplication.createdAt,
			disabled: oauthApplication.disabled,
			activeGrants: count(sql`CASE WHEN ${oauthAccessToken.refreshTokenExpiresAt} > ${now} THEN 1 END`),
			activeUsers: countDistinct(sql`CASE WHEN ${oauthAccessToken.refreshTokenExpiresAt} > ${now} THEN ${oauthAccessToken.userId} END`),
			lastUsedAt: max(oauthAccessToken.updatedAt),
		})
		.from(oauthApplication)
		.leftJoin(oauthAccessToken, eq(oauthAccessToken.clientId, oauthApplication.clientId))
		.groupBy(oauthApplication.id)
		.orderBy(desc(oauthApplication.createdAt))
	return rows.map(r => ({
		id: r.id,
		clientId: r.clientId,
		name: r.name,
		createdAt: iso(r.createdAt) ?? new Date(0).toISOString(),
		disabled: r.disabled,
		activeGrants: Number(r.activeGrants),
		activeUsers: Number(r.activeUsers),
		lastUsedAt: iso(r.lastUsedAt),
	}))
}

export async function listOauthGrantsImpl(
	args: { userId?: string; now?: Date } = {},
	dbx: SchemaDatabase = db
): Promise<Array<OauthGrantRow>> {
	const now = args.now ?? new Date()
	const where = args.userId
		? and(eq(oauthAccessToken.userId, args.userId), gt(oauthAccessToken.refreshTokenExpiresAt, now))
		: gt(oauthAccessToken.refreshTokenExpiresAt, now)
	const rows = await dbx
		.select({
			id: oauthAccessToken.id,
			clientId: oauthAccessToken.clientId,
			clientName: oauthApplication.name,
			userId: oauthAccessToken.userId,
			userName: users.name,
			userEmail: users.email,
			scopes: oauthAccessToken.scopes,
			createdAt: oauthAccessToken.createdAt,
			lastUsedAt: oauthAccessToken.updatedAt,
			accessTokenExpiresAt: oauthAccessToken.accessTokenExpiresAt,
			refreshTokenExpiresAt: oauthAccessToken.refreshTokenExpiresAt,
		})
		.from(oauthAccessToken)
		.innerJoin(oauthApplication, eq(oauthApplication.clientId, oauthAccessToken.clientId))
		.leftJoin(users, eq(users.id, oauthAccessToken.userId))
		.where(where)
		.orderBy(desc(oauthAccessToken.updatedAt))
	return rows.map(r => ({
		id: r.id,
		clientId: r.clientId,
		clientName: r.clientName,
		userId: r.userId,
		userName: r.userName,
		userEmail: r.userEmail,
		scopes: r.scopes,
		createdAt: iso(r.createdAt) ?? new Date(0).toISOString(),
		lastUsedAt: iso(r.lastUsedAt) ?? new Date(0).toISOString(),
		accessTokenExpiresAt: iso(r.accessTokenExpiresAt) ?? new Date(0).toISOString(),
		refreshTokenExpiresAt: iso(r.refreshTokenExpiresAt),
	}))
}

export type RevokeResult = { ok: true } | { ok: false; reason: 'not-found' }

/** Delete one token. When `userId` is given the token must belong to that user. */
export async function revokeOauthGrantImpl(args: { tokenId: string; userId?: string }, dbx: SchemaDatabase = db): Promise<RevokeResult> {
	const where = args.userId
		? and(eq(oauthAccessToken.id, args.tokenId), eq(oauthAccessToken.userId, args.userId))
		: eq(oauthAccessToken.id, args.tokenId)
	const deleted = await dbx.delete(oauthAccessToken).where(where).returning({ id: oauthAccessToken.id })
	return deleted.length > 0 ? { ok: true } : { ok: false, reason: 'not-found' }
}

export async function setOauthClientDisabledImpl(
	args: { clientId: string; disabled: boolean },
	dbx: SchemaDatabase = db
): Promise<RevokeResult> {
	const updated = await dbx
		.update(oauthApplication)
		.set({ disabled: args.disabled })
		.where(eq(oauthApplication.clientId, args.clientId))
		.returning({ id: oauthApplication.id })
	if (updated.length === 0) return { ok: false, reason: 'not-found' }
	// Disabling also revokes: the guard rejects tokens of disabled clients,
	// but dropping the rows keeps the grants table honest.
	if (args.disabled) await dbx.delete(oauthAccessToken).where(eq(oauthAccessToken.clientId, args.clientId))
	return { ok: true }
}

/** Delete a registered client; tokens and consents cascade. */
export async function deleteOauthClientImpl(args: { clientId: string }, dbx: SchemaDatabase = db): Promise<RevokeResult> {
	const deleted = await dbx
		.delete(oauthApplication)
		.where(eq(oauthApplication.clientId, args.clientId))
		.returning({ id: oauthApplication.id })
	return deleted.length > 0 ? { ok: true } : { ok: false, reason: 'not-found' }
}

/** One row per client the user has connected: what /settings/connected-apps shows. */
export async function listMyConnectedAppsImpl(
	args: { userId: string; now?: Date },
	dbx: SchemaDatabase = db
): Promise<Array<ConnectedAppRow>> {
	const now = args.now ?? new Date()
	const rows = await dbx
		.select({
			clientId: oauthApplication.clientId,
			clientName: oauthApplication.name,
			icon: oauthApplication.icon,
			connectedAt: sql<Date | null>`min(${oauthAccessToken.createdAt})`,
			lastUsedAt: max(oauthAccessToken.updatedAt),
			activeTokens: count(sql`CASE WHEN ${oauthAccessToken.refreshTokenExpiresAt} > ${now} THEN 1 END`),
			expiresAt: max(oauthAccessToken.refreshTokenExpiresAt),
		})
		.from(oauthAccessToken)
		.innerJoin(oauthApplication, eq(oauthApplication.clientId, oauthAccessToken.clientId))
		.where(eq(oauthAccessToken.userId, args.userId))
		.groupBy(oauthApplication.clientId, oauthApplication.name, oauthApplication.icon)
		.orderBy(desc(max(oauthAccessToken.updatedAt)))
	return rows
		.map(r => ({
			clientId: r.clientId,
			clientName: r.clientName,
			icon: r.icon,
			connectedAt: iso(r.connectedAt) ?? new Date(0).toISOString(),
			lastUsedAt: iso(r.lastUsedAt),
			activeTokens: Number(r.activeTokens),
			expiresAt: r.expiresAt && r.expiresAt > now ? iso(r.expiresAt) : null,
		}))
		.filter(r => r.activeTokens > 0)
}

/** Disconnect a client from the caller's account: every token and consent for that pair. */
export async function revokeMyConnectedAppImpl(
	args: { userId: string; clientId: string },
	dbx: SchemaDatabase = db
): Promise<RevokeResult> {
	const tokens = await dbx
		.delete(oauthAccessToken)
		.where(and(eq(oauthAccessToken.userId, args.userId), eq(oauthAccessToken.clientId, args.clientId)))
		.returning({ id: oauthAccessToken.id })
	await dbx.delete(oauthConsent).where(and(eq(oauthConsent.userId, args.userId), eq(oauthConsent.clientId, args.clientId)))
	return tokens.length > 0 ? { ok: true } : { ok: false, reason: 'not-found' }
}
