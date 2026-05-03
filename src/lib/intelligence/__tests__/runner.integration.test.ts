import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import type { Database } from '@/db'
import { appSettings, recommendationRuns, recommendations } from '@/db/schema'

import { makeList, makeUser } from '../../../../test/integration/factories'
import { withRollback } from '../../../../test/integration/setup'
import { fingerprintFor } from '../fingerprint'
import { generateForUser } from '../runner'

// Most runner tests use withRollback so settings written during the test
// don't leak between tests. The runner reads settings via getAppSettings
// against the same `db` singleton that the test mock points at, so writes
// inside the rollback transaction are visible.

async function setIntelligenceEnabled(tx: any, enabled: boolean) {
	await tx
		.insert(appSettings)
		.values({ key: 'intelligenceEnabled', value: enabled })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: enabled } })
}

describe('generateForUser - skip states', () => {
	it('skips with reason "disabled" when feature flag is off', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			// Default is off; explicit set for clarity.
			await setIntelligenceEnabled(tx, false)

			const result = await generateForUser(tx as unknown as Database, user.id, { trigger: 'manual' })

			expect(result.status).toBe('skipped')
			if (result.status === 'skipped') expect(result.reason).toBe('disabled')
		})
	})

	it('skips with reason "no-provider" when feature is on but no AI is configured', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			await setIntelligenceEnabled(tx, true)

			const result = await generateForUser(tx as unknown as Database, user.id, { trigger: 'manual' })

			expect(result.status).toBe('skipped')
			if (result.status === 'skipped') expect(result.reason).toBe('no-provider')
		})
	})

	it('does not write a run row when preconditions fail', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			// Both checks fall before any DB write.
			await generateForUser(tx as unknown as Database, user.id, { trigger: 'cron' })

			const runs = await tx.select().from(recommendationRuns).where(eq(recommendationRuns.userId, user.id))
			expect(runs).toHaveLength(0)
		})
	})
})

describe('fingerprint stickiness (carrying dismissals across regenerations)', () => {
	it('produces stable fingerprints regardless of target order', () => {
		// Sanity guard: persistBatch in the runner relies on this.
		const a = fingerprintFor({ analyzerId: 'duplicates', kind: 'cross-list-duplicate', fingerprintTargets: ['10', '20'] })
		const b = fingerprintFor({ analyzerId: 'duplicates', kind: 'cross-list-duplicate', fingerprintTargets: ['20', '10'] })
		expect(a).toBe(b)
	})
})

describe('integration sanity - tables exist + runner does not crash on cold DB', () => {
	it('runs against an empty users table without error', async () => {
		await withRollback(async tx => {
			// no user; should not run
			const fakeId = 'nonexistent-user'
			const result = await generateForUser(tx as unknown as Database, fakeId, { trigger: 'manual' })
			// preconditions fail first (default settings disable feature)
			expect(['skipped', 'error']).toContain(result.status)
		})
	})

	it('recommendations and recommendationRuns tables are queryable', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			await makeList(tx, { ownerId: user.id })
			const recs = await tx.select().from(recommendations).where(eq(recommendations.userId, user.id))
			const runs = await tx.select().from(recommendationRuns).where(eq(recommendationRuns.userId, user.id))
			expect(recs).toEqual([])
			expect(runs).toEqual([])
		})
	})
})
