import { describe, expect, it } from 'vitest'

import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

import { makeList, makeUser } from '../../../../test/integration/factories'
import { withRollback } from '../../../../test/integration/setup'
import { primaryListAnalyzer } from '../analyzers/primary-list'
import type { AnalyzerContext } from '../context'

const noopLogger = { info: () => undefined, warn: () => undefined, error: () => undefined }

function buildCtx(tx: any, userId: string, opts: Partial<AnalyzerContext> = {}): AnalyzerContext {
	return {
		db: tx,
		userId,
		model: null,
		settings: DEFAULT_APP_SETTINGS,
		logger: noopLogger,
		now: new Date(),
		candidateCap: 50,
		dryRun: false,
		dependentId: null,
		subject: { kind: 'user', name: 'You', image: null },
		...opts,
	}
}

describe('primaryListAnalyzer', () => {
	it('emits a no-primary rec when the user has lists but none are primary', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			await makeList(tx, { ownerId: user.id, isActive: true, isPrimary: false, type: 'wishlist' })
			await makeList(tx, { ownerId: user.id, isActive: true, isPrimary: false, type: 'birthday' })

			const result = await primaryListAnalyzer.run(buildCtx(tx, user.id))

			expect(result.recs).toHaveLength(1)
			expect(result.recs[0].kind).toBe('no-primary')
			expect(result.recs[0].severity).toBe('important')
			expect(result.recs[0].interaction?.kind).toBe('list-picker')
			// fingerprint targets are empty so dismissals stick across "I added a new list"
			expect(result.recs[0].fingerprintTargets).toEqual([])
		})
	})

	it('emits no rec when the user already has a primary list', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			await makeList(tx, { ownerId: user.id, isActive: true, isPrimary: true, type: 'wishlist' })
			await makeList(tx, { ownerId: user.id, isActive: true, isPrimary: false, type: 'birthday' })

			const result = await primaryListAnalyzer.run(buildCtx(tx, user.id))

			expect(result.recs).toHaveLength(0)
		})
	})

	it('emits no rec when the user has no eligible lists at all', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			// giftideas is intentionally excluded from "eligible to be primary"
			await makeList(tx, { ownerId: user.id, isActive: true, isPrimary: false, type: 'giftideas' })

			const result = await primaryListAnalyzer.run(buildCtx(tx, user.id))

			expect(result.recs).toHaveLength(0)
		})
	})

	it('does not consider archived (isActive=false) lists as eligible', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			await makeList(tx, { ownerId: user.id, isActive: false, isPrimary: false, type: 'wishlist' })

			const result = await primaryListAnalyzer.run(buildCtx(tx, user.id))

			expect(result.recs).toHaveLength(0)
		})
	})

	it('input hash flips when primary status changes (cache invalidates correctly)', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, isActive: true, isPrimary: false, type: 'wishlist' })

			const before = await primaryListAnalyzer.run(buildCtx(tx, user.id))
			await tx
				.update((await import('@/db/schema')).lists)
				.set({ isPrimary: true })
				.where((await import('drizzle-orm')).eq((await import('@/db/schema')).lists.id, list.id))
			const after = await primaryListAnalyzer.run(buildCtx(tx, user.id))

			expect(before.inputHash).not.toBe(after.inputHash)
		})
	})
})
