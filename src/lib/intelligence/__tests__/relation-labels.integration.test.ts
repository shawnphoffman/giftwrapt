// Coverage for the relation-labels analyzer. Verifies the feature
// flag, the lead-time window, the per-label miss / fill states, and
// fingerprint stability across years.

import { makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { addRelationLabelImpl } from '@/api/_relation-labels-impl'
import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

import { relationLabelsAnalyzer } from '../analyzers/relation-labels'
import type { AnalyzerContext } from '../context'

const noopLogger = { info: () => undefined, warn: () => undefined, error: () => undefined }

function buildCtx(tx: any, userId: string, opts: Partial<AnalyzerContext> = {}): AnalyzerContext {
	return {
		db: tx,
		userId,
		model: null,
		// Both arms enabled with a 7-day lead so the tests below land within
		// the trigger window for May 10 Mother's Day / Jun 21 Father's Day.
		settings: {
			...DEFAULT_APP_SETTINGS,
			enableMothersDayReminders: true,
			mothersDayReminderLeadDays: 7,
			enableFathersDayReminders: true,
			fathersDayReminderLeadDays: 7,
		},
		logger: noopLogger,
		now: new Date(),
		candidateCap: 50,
		dryRun: false,
		dependentId: null,
		subject: { kind: 'user', name: 'You', image: null },
		...opts,
	}
}

describe('relationLabelsAnalyzer', () => {
	// US Mother's Day 2026 = May 10. Day-of-trigger for leadDays=7 is May 3.
	it('skips when the feature flag is off', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const ctx = buildCtx(tx, user.id, {
				now: new Date('2026-05-03T12:00:00Z'),
				settings: { ...DEFAULT_APP_SETTINGS, enableMothersDayReminders: false, enableFathersDayReminders: false },
			})
			const result = await relationLabelsAnalyzer.run(ctx)
			expect(result.recs).toHaveLength(0)
		})
	})

	it('skips when no holiday is within the lead-time window', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			// Aug 1 - both MD (May 10 next year) and FD (Jun 21 next year) are far away.
			const ctx = buildCtx(tx, user.id, { now: new Date('2026-08-01T12:00:00Z') })
			const result = await relationLabelsAnalyzer.run(ctx)
			expect(result.recs).toHaveLength(0)
		})
	})

	it("emits a rec when Mother's Day is within the window and the user has no mothers tagged", async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const ctx = buildCtx(tx, user.id, { now: new Date('2026-05-08T12:00:00Z') })
			const result = await relationLabelsAnalyzer.run(ctx)
			expect(result.recs).toHaveLength(1)
			expect(result.recs[0].kind).toBe('set-relation-labels')
			expect(result.recs[0].body).toContain('mothers')
			// nav must point at /settings/ via the path-shaped variant,
			// NOT the broken `{ listId: 'settings' }` shape that built
			// `/lists/settings` (a route that doesn't exist).
			const action = result.recs[0].actions?.[0]
			expect(action?.nav).toEqual({ path: '/settings/' })
		})
	})

	it("does not emit when the user has at least one mother tagged before Mother's Day", async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const mom = await makeUser(tx)
			const add = await addRelationLabelImpl({ userId: user.id, input: { label: 'mother', targetUserId: mom.id }, dbx: tx })
			expect(add.kind).toBe('ok')

			// Father's Day 2026 = June 21; we're three days out. With a mother
			// already tagged but no father, the rec should still fire for the
			// father side.
			const ctx = buildCtx(tx, user.id, { now: new Date('2026-06-18T12:00:00Z') })
			const result = await relationLabelsAnalyzer.run(ctx)
			expect(result.recs).toHaveLength(1)
			expect(result.recs[0].body).toContain('fathers')
			expect(result.recs[0].body).not.toContain('mothers')
		})
	})

	it('emits nothing when both labels are filled within the window', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const mom = await makeUser(tx)
			const dad = await makeUser(tx)
			await addRelationLabelImpl({ userId: user.id, input: { label: 'mother', targetUserId: mom.id }, dbx: tx })
			await addRelationLabelImpl({ userId: user.id, input: { label: 'father', targetUserId: dad.id }, dbx: tx })

			const ctx = buildCtx(tx, user.id, { now: new Date('2026-05-08T12:00:00Z') })
			const result = await relationLabelsAnalyzer.run(ctx)
			expect(result.recs).toHaveLength(0)
		})
	})

	it('skips for dependent-subject runs', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const ctx = buildCtx(tx, user.id, {
				now: new Date('2026-05-08T12:00:00Z'),
				dependentId: 'dep-fake',
				subject: { kind: 'dependent', id: 'dep-fake', name: 'Pet', image: null },
			})
			const result = await relationLabelsAnalyzer.run(ctx)
			expect(result.recs).toHaveLength(0)
		})
	})

	it('fingerprintTargets include the year so a 2026 dismiss does not block 2027', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const ctx2026 = buildCtx(tx, user.id, { now: new Date('2026-05-08T12:00:00Z') })
			const ctx2027 = buildCtx(tx, user.id, { now: new Date('2027-05-07T12:00:00Z') })
			const a = await relationLabelsAnalyzer.run(ctx2026)
			const b = await relationLabelsAnalyzer.run(ctx2027)
			expect(a.recs[0].fingerprintTargets).toContain('year:2026')
			expect(b.recs[0].fingerprintTargets).toContain('year:2027')
		})
	})
})
