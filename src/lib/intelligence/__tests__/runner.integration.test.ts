import { makeDependent, makeDependentGuardianship, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import type { Database } from '@/db'
import { appSettings, recommendationRuns, recommendations } from '@/db/schema'

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

// Configure a sham AI provider so the runner's preconditions pass and we
// can exercise the per-dependent pass loop. Heuristic-only analyzers
// (primary-list) don't actually call the model so the runner returns
// successful recs without any external network access.
async function configureAi(tx: any) {
	const setting = (key: string, value: unknown) =>
		tx.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } })
	await setting('aiProviderType', 'anthropic')
	await setting('aiApiKey', 'test-key')
	await setting('aiModel', 'claude-3-7-sonnet-latest')
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

describe('per-dependent pass', () => {
	it('runs primary-list for the user pass but skips it for dependent passes', async () => {
		// primary-list is heuristic-only and emits a no-primary rec when the
		// candidate list set has zero primaries. The user has a list of
		// their own, so the user pass should produce one. The dependent has
		// its own list too, but `lists.isPrimary` is per-owner and applying
		// a "pick a primary" rec on a dependent would clobber the
		// guardian's own primary - so the analyzer deliberately skips the
		// dependent subject and emits no rec there.
		await withRollback(async tx => {
			const guardian = await makeUser(tx)
			const dep = await makeDependent(tx, { createdByUserId: guardian.id, name: 'Pippa' })
			await makeDependentGuardianship(tx, { guardianUserId: guardian.id, dependentId: dep.id })

			const ownList = await makeList(tx, { ownerId: guardian.id, type: 'wishlist', isPrimary: false })
			await makeItem(tx, { listId: ownList.id })
			const depList = await makeList(tx, { ownerId: guardian.id, subjectDependentId: dep.id, type: 'wishlist', isPrimary: false })
			await makeItem(tx, { listId: depList.id })

			await setIntelligenceEnabled(tx, true)
			await configureAi(tx)

			const result = await generateForUser(tx as unknown as Database, guardian.id, { trigger: 'manual' })
			expect(result.status).toBe('success')

			const rows = await tx.select().from(recommendations).where(eq(recommendations.userId, guardian.id))
			const userRecs = rows.filter(r => r.dependentId === null)
			const depRecs = rows.filter(r => r.dependentId === dep.id)

			// User pass fires primary-list; dependent pass does not. Other
			// analyzers (AI-calling) likely error out without a real
			// provider, but per-analyzer errors are trapped into step rows
			// and don't fail the run.
			expect(userRecs.some(r => r.analyzerId === 'primary-list')).toBe(true)
			expect(depRecs.some(r => r.analyzerId === 'primary-list')).toBe(false)
		})
	})

	it('skips dependents with no active non-giftideas lists owned by the guardian', async () => {
		await withRollback(async tx => {
			const guardian = await makeUser(tx)
			const dep = await makeDependent(tx, { createdByUserId: guardian.id })
			await makeDependentGuardianship(tx, { guardianUserId: guardian.id, dependentId: dep.id })
			// Guardian has their own list, but the dependent has no list of
			// their own; we should NOT spin up a dependent pass for them.
			await makeList(tx, { ownerId: guardian.id, type: 'wishlist', isPrimary: false })

			await setIntelligenceEnabled(tx, true)
			await configureAi(tx)

			const result = await generateForUser(tx as unknown as Database, guardian.id, { trigger: 'manual' })
			expect(result.status).toBe('success')

			const rows = await tx.select().from(recommendations).where(eq(recommendations.userId, guardian.id))
			const depRecs = rows.filter(r => r.dependentId === dep.id)
			expect(depRecs).toHaveLength(0)
		})
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
