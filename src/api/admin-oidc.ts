// Admin-only server fns for OIDC client (oauthApplication) CRUD.
// Better-auth's oidcProvider plugin exposes /oauth2/register publicly
// (so external apps can self-register), but we want operator-controlled
// provisioning for the admin UI: the operator decides which clients are
// trusted, can rotate secrets, and disable misbehaving entries. These
// fns talk to the `oauthApplication` table directly so we don't need
// to thread an OIDC bearer-token dance through the admin UI.

import { createServerFn } from '@tanstack/react-start'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { oauthAccessToken, oauthApplication, oauthConsent } from '@/db/schema'
import { loggingMiddleware } from '@/lib/logger'
import { adminAuthMiddleware } from '@/middleware/auth'

// Application-type values come straight from RFC 7591: the OAuth2
// dynamic client registration spec. better-auth allows `public`,
// `web`, `native`, `user-agent-based`. We surface the same set.
export const oidcAppTypeValues = ['web', 'native', 'public', 'user-agent-based'] as const
export type OidcAppType = (typeof oidcAppTypeValues)[number]

export type OidcApplicationRow = {
	id: string
	clientId: string
	clientSecret: string | null
	name: string
	type: OidcAppType
	icon: string | null
	redirectUrls: Array<string>
	disabled: boolean
	createdAt: Date
	updatedAt: Date
}

const CreateOidcApplicationInputSchema = z.object({
	name: z.string().min(1).max(120),
	type: z.enum(oidcAppTypeValues),
	redirectUrls: z.array(z.url('Each entry must be a full https:// URL')).min(1).max(10),
	icon: z.url().optional(),
})

const UpdateOidcApplicationInputSchema = z.object({
	id: z.string().min(1),
	disabled: z.boolean().optional(),
	name: z.string().min(1).max(120).optional(),
	redirectUrls: z.array(z.url()).min(1).max(10).optional(),
	icon: z.url().nullable().optional(),
})

const DeleteOidcApplicationInputSchema = z.object({ id: z.string().min(1) })

const RotateOidcSecretInputSchema = z.object({ id: z.string().min(1) })

// Returns 64 base64url chars of cryptographic randomness. The OIDC
// `client_secret_basic` flow expects an opaque secret here; the client
// stores it on its server and uses it to authenticate to /oauth2/token.
function generateClientSecret(): string {
	const bytes = new Uint8Array(48)
	crypto.getRandomValues(bytes)
	return Buffer.from(bytes).toString('base64url')
}

function generateClientId(): string {
	const bytes = new Uint8Array(24)
	crypto.getRandomValues(bytes)
	return Buffer.from(bytes).toString('base64url')
}

function rowToPublic(row: typeof oauthApplication.$inferSelect): OidcApplicationRow {
	return {
		id: row.id,
		clientId: row.clientId,
		clientSecret: row.clientSecret,
		name: row.name,
		type: row.type as OidcAppType,
		icon: row.icon,
		redirectUrls: row.redirectUrls.split(/[,\s]+/).filter(Boolean),
		disabled: row.disabled,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	}
}

export const listOidcApplicationsAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler(async (): Promise<Array<OidcApplicationRow>> => {
		const rows = await db.select().from(oauthApplication).orderBy(desc(oauthApplication.createdAt))
		return rows.map(rowToPublic)
	})

export const createOidcApplicationAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CreateOidcApplicationInputSchema>) => CreateOidcApplicationInputSchema.parse(data))
	.handler(async ({ data, context }): Promise<OidcApplicationRow> => {
		const id = crypto.randomUUID()
		const clientId = generateClientId()
		// `public` type clients (mobile, SPA) MUST NOT have a secret per
		// RFC 7591 §2; everything else gets one.
		const clientSecret = data.type === 'public' ? null : generateClientSecret()
		const [row] = await db
			.insert(oauthApplication)
			.values({
				id,
				name: data.name,
				type: data.type,
				clientId,
				clientSecret,
				redirectUrls: data.redirectUrls.join(' '),
				icon: data.icon ?? null,
				userId: context.session.user.id,
				disabled: false,
			})
			.returning()
		return rowToPublic(row)
	})

export const updateOidcApplicationAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateOidcApplicationInputSchema>) => UpdateOidcApplicationInputSchema.parse(data))
	.handler(async ({ data }): Promise<OidcApplicationRow> => {
		const updates: Partial<typeof oauthApplication.$inferInsert> = { updatedAt: new Date() }
		if (data.name !== undefined) updates.name = data.name
		if (data.disabled !== undefined) updates.disabled = data.disabled
		if (data.redirectUrls !== undefined) updates.redirectUrls = data.redirectUrls.join(' ')
		if (data.icon !== undefined) updates.icon = data.icon
		const result = await db.update(oauthApplication).set(updates).where(eq(oauthApplication.id, data.id)).returning()
		const row = result.at(0)
		if (!row) throw new Error('not-found')
		return rowToPublic(row)
	})

export const rotateOidcSecretAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof RotateOidcSecretInputSchema>) => RotateOidcSecretInputSchema.parse(data))
	.handler(async ({ data }): Promise<{ clientSecret: string }> => {
		// Rotates the secret in place. Existing access tokens issued
		// against the old secret stay valid (the secret is only checked
		// at token-exchange time, never on resource access). Operator
		// is expected to revoke active tokens manually if they're
		// rotating because of a leak.
		const clientSecret = generateClientSecret()
		const result = await db
			.update(oauthApplication)
			.set({ clientSecret, updatedAt: new Date() })
			.where(eq(oauthApplication.id, data.id))
			.returning()
		const row = result.at(0)
		if (!row) throw new Error('not-found')
		if (row.type === 'public') {
			// Public clients shouldn't have a secret. If we get here it
			// was created before this guard or the row was hand-edited.
			throw new Error('cannot rotate secret on a public client')
		}
		return { clientSecret }
	})

export const deleteOidcApplicationAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteOidcApplicationInputSchema>) => DeleteOidcApplicationInputSchema.parse(data))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		// Tokens and consents cascade-delete via the FK on clientId.
		// Verify by selecting first so the admin sees a clear error
		// instead of a no-op delete.
		const result = await db.select().from(oauthApplication).where(eq(oauthApplication.id, data.id))
		const row = result.at(0)
		if (!row) throw new Error('not-found')
		await db.delete(oauthAccessToken).where(eq(oauthAccessToken.clientId, row.clientId))
		await db.delete(oauthConsent).where(eq(oauthConsent.clientId, row.clientId))
		await db.delete(oauthApplication).where(eq(oauthApplication.id, data.id))
		return { ok: true }
	})
