import { makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import {
	deleteOauthClientImpl,
	listMyConnectedAppsImpl,
	listOauthClientsImpl,
	listOauthGrantsImpl,
	revokeMyConnectedAppImpl,
	revokeOauthGrantImpl,
	setMcpClientAccessImpl,
	setOauthClientDisabledImpl,
} from '@/api/_mcp-admin-impl'
import { mcpClientAccess, oauthAccessToken, oauthApplication, oauthConsent } from '@/db/schema'

const DAY = 24 * 60 * 60 * 1000

describe('MCP admin and connected-apps impls', () => {
	it('lists clients and grants, and revocation is scoped correctly', async () => {
		await withRollback(async tx => {
			const now = new Date('2026-09-30T12:00:00Z')
			const alice = await makeUser(tx, { name: 'Alice', email: 'alice@test.local' })
			const bob = await makeUser(tx, { name: 'Bob', email: 'bob@test.local' })
			await tx.insert(oauthApplication).values([
				{
					id: 'app-claude',
					name: 'Claude',
					clientId: 'cid-claude',
					redirectUrls: 'http://localhost:9/cb',
					type: 'public',
					createdAt: now,
					updatedAt: now,
				},
				{
					id: 'app-cursor',
					name: 'Cursor',
					clientId: 'cid-cursor',
					redirectUrls: 'http://localhost:9/cb',
					type: 'public',
					createdAt: now,
					updatedAt: now,
				},
			])
			const mkToken = (id: string, clientId: string, userId: string, refreshExp: Date) => ({
				id,
				accessToken: `at-${id}`,
				refreshToken: `rt-${id}`,
				accessTokenExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
				refreshTokenExpiresAt: refreshExp,
				clientId,
				userId,
				scopes: 'openid',
				createdAt: now,
				updatedAt: now,
			})
			await tx
				.insert(oauthAccessToken)
				.values([
					mkToken('alice-claude', 'cid-claude', alice.id, new Date(now.getTime() + 10 * DAY)),
					mkToken('alice-cursor', 'cid-cursor', alice.id, new Date(now.getTime() + 10 * DAY)),
					mkToken('bob-claude', 'cid-claude', bob.id, new Date(now.getTime() + 10 * DAY)),
					mkToken('bob-claude-expired', 'cid-claude', bob.id, new Date(now.getTime() - DAY)),
				])
			await tx
				.insert(oauthConsent)
				.values({ id: 'c-alice-claude', clientId: 'cid-claude', userId: alice.id, scopes: 'openid', consentGiven: true })

			const clients = await listOauthClientsImpl(tx, now)
			const claude = clients.find(c => c.clientId === 'cid-claude')!
			expect(claude.activeGrants).toBe(2)
			expect(claude.activeUsers).toBe(2)
			const cursor = clients.find(c => c.clientId === 'cid-cursor')!
			expect(cursor.activeGrants).toBe(1)

			// Expired refresh windows are not "active connections".
			const grants = await listOauthGrantsImpl({ now }, tx)
			expect(grants.map(g => g.id).sort()).toEqual(['alice-claude', 'alice-cursor', 'bob-claude'])
			expect(grants.find(g => g.id === 'bob-claude')!.userEmail).toBe('bob@test.local')
			const bobOnly = await listOauthGrantsImpl({ userId: bob.id, now }, tx)
			expect(bobOnly.map(g => g.id)).toEqual(['bob-claude'])

			// A user cannot revoke someone else's token through the ownership-scoped path.
			expect(await revokeOauthGrantImpl({ tokenId: 'bob-claude', userId: alice.id }, tx)).toEqual({ ok: false, reason: 'not-found' })
			expect(await revokeOauthGrantImpl({ tokenId: 'bob-claude' }, tx)).toEqual({ ok: true })

			// Connected apps for Alice: one row per client.
			const apps = await listMyConnectedAppsImpl({ userId: alice.id, now }, tx)
			expect(apps.map(a => a.clientId).sort()).toEqual(['cid-claude', 'cid-cursor'])

			// Access level: full until the user says otherwise, per user and client.
			expect(apps.every(a => a.access === 'write')).toBe(true)
			expect(await setMcpClientAccessImpl({ userId: alice.id, clientId: 'cid-claude', access: 'read', now }, tx)).toEqual({ ok: true })
			const afterChoice = await listMyConnectedAppsImpl({ userId: alice.id, now }, tx)
			expect(afterChoice.find(a => a.clientId === 'cid-claude')!.access).toBe('read')
			expect(afterChoice.find(a => a.clientId === 'cid-cursor')!.access).toBe('write')
			const adminView = await listOauthGrantsImpl({ now }, tx)
			expect(adminView.find(g => g.id === 'alice-claude')!.access).toBe('read')
			expect(adminView.find(g => g.id === 'alice-cursor')!.access).toBe('write')
			expect(await setMcpClientAccessImpl({ userId: alice.id, clientId: 'cid-nobody', access: 'read', now }, tx)).toEqual({
				ok: false,
				reason: 'not-found',
			})
			expect(await revokeMyConnectedAppImpl({ userId: alice.id, clientId: 'cid-claude' }, tx)).toEqual({ ok: true })
			expect((await listMyConnectedAppsImpl({ userId: alice.id, now }, tx)).map(a => a.clientId)).toEqual(['cid-cursor'])
			const consents = await tx.select({ id: oauthConsent.id }).from(oauthConsent)
			expect(consents).toHaveLength(0)
			// Disconnecting forgets the access choice, so reconnecting asks again.
			expect(await tx.select({ clientId: mcpClientAccess.clientId }).from(mcpClientAccess)).toEqual([])
			expect(await revokeMyConnectedAppImpl({ userId: alice.id, clientId: 'cid-claude' }, tx)).toEqual({ ok: false, reason: 'not-found' })

			// Disabling a client drops its remaining tokens; deleting it cascades.
			expect(await setOauthClientDisabledImpl({ clientId: 'cid-cursor', disabled: true }, tx)).toEqual({ ok: true })
			expect(await listOauthGrantsImpl({ now }, tx)).toHaveLength(0)
			expect(await deleteOauthClientImpl({ clientId: 'cid-claude' }, tx)).toEqual({ ok: true })
			expect(await deleteOauthClientImpl({ clientId: 'cid-claude' }, tx)).toEqual({ ok: false, reason: 'not-found' })
			const remaining = await tx.select({ id: oauthApplication.id }).from(oauthApplication)
			expect(remaining.map(r => r.id)).toEqual(['app-cursor'])
		})
	})
})
