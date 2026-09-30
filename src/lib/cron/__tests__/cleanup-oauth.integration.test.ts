import { makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { oauthAccessToken, oauthApplication, oauthConsent } from '@/db/schema'
import { cleanupOauthImpl } from '@/lib/cron/cleanup-oauth'

const DAY = 24 * 60 * 60 * 1000

describe('cleanupOauthImpl', () => {
	it('drops expired tokens and idle never-used clients, keeps everything else', async () => {
		await withRollback(async tx => {
			const now = new Date('2026-09-30T12:00:00Z')
			const user = await makeUser(tx)

			const mkClient = async (id: string, createdAt: Date) => {
				await tx.insert(oauthApplication).values({
					id,
					name: id,
					clientId: id,
					redirectUrls: 'http://localhost:9/cb',
					type: 'public',
					createdAt,
					updatedAt: createdAt,
				})
			}
			await mkClient('live-client', new Date(now.getTime() - 60 * DAY))
			await mkClient('idle-old-client', new Date(now.getTime() - 60 * DAY))
			await mkClient('idle-new-client', new Date(now.getTime() - 2 * DAY))

			const mkToken = async (id: string, clientId: string, accessExp: Date, refreshExp: Date | null) => {
				await tx.insert(oauthAccessToken).values({
					id,
					accessToken: `at-${id}`,
					refreshToken: `rt-${id}`,
					accessTokenExpiresAt: accessExp,
					refreshTokenExpiresAt: refreshExp,
					clientId,
					userId: user.id,
					scopes: 'openid',
				})
			}
			// Live: refresh window still open (access already expired is fine).
			await mkToken('live', 'live-client', new Date(now.getTime() - DAY), new Date(now.getTime() + DAY))
			// Dead: refresh window closed.
			await mkToken('dead-refresh', 'live-client', new Date(now.getTime() - 2 * DAY), new Date(now.getTime() - DAY))
			// Dead: no refresh token, access expired.
			await mkToken('dead-access', 'live-client', new Date(now.getTime() - DAY), null)
			await tx.insert(oauthConsent).values({ id: 'c1', clientId: 'idle-old-client', userId: user.id, scopes: 'openid', consentGiven: true })

			const result = await cleanupOauthImpl({ db: tx, now })
			expect(result).toEqual({ tokensDeleted: 2, clientsDeleted: 1 })

			const tokens = await tx.select({ id: oauthAccessToken.id }).from(oauthAccessToken)
			expect(tokens.map(t => t.id)).toEqual(['live'])
			const clients = await tx.select({ id: oauthApplication.id }).from(oauthApplication)
			expect(clients.map(c => c.id).sort()).toEqual(['idle-new-client', 'live-client'])
			// Consent rows cascade with their client.
			const consents = await tx.select({ id: oauthConsent.id }).from(oauthConsent)
			expect(consents).toHaveLength(0)
		})
	})
})
