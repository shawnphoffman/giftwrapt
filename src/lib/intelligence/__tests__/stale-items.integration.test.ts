import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { items } from '@/db/schema'
import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

import { makeDependent, makeDependentGuardianship, makeItem, makeList, makeUser } from '../../../../test/integration/factories'
import { withRollback } from '../../../../test/integration/setup'
import { staleItemsAnalyzer } from '../analyzers/stale-items'
import type { AnalyzerContext } from '../context'

const noopLogger = { info: () => undefined, warn: () => undefined, error: () => undefined }

function buildCtx(tx: any, userId: string, opts: Partial<AnalyzerContext> = {}): AnalyzerContext {
	return {
		db: tx,
		userId,
		model: null, // heuristic-only path
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

async function ageItem(tx: any, itemId: number, daysOld: number) {
	const updatedAt = new Date(Date.now() - daysOld * 86400000)
	await tx.update(items).set({ updatedAt }).where(eq(items.id, itemId))
}

describe('staleItemsAnalyzer', () => {
	it('flags candidates that are older than the 6-month threshold', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const old1 = await makeItem(tx, { listId: list.id, title: 'Old 1' })
			const old2 = await makeItem(tx, { listId: list.id, title: 'Old 2' })
			await ageItem(tx, old1.id, 200)
			await ageItem(tx, old2.id, 250)
			// recent item should not be flagged
			await makeItem(tx, { listId: list.id, title: 'Recent' })

			const result = await staleItemsAnalyzer.run(buildCtx(tx, user.id))

			// heuristic-only fallback emits one rec per list when count >= 2
			expect(result.recs).toHaveLength(1)
			expect(result.recs[0].affected?.count).toBe(2)
			expect(result.recs[0].relatedItems?.map(item => item.id).sort()).toEqual([String(old1.id), String(old2.id)].sort())
		})
	})

	it('skips giftideas lists', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'giftideas', isPrivate: true })
			const a = await makeItem(tx, { listId: list.id })
			const b = await makeItem(tx, { listId: list.id })
			await ageItem(tx, a.id, 200)
			await ageItem(tx, b.id, 220)

			const result = await staleItemsAnalyzer.run(buildCtx(tx, user.id))

			expect(result.recs).toHaveLength(0)
		})
	})

	it('skips already-archived (isArchived=true) items', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const archived = await makeItem(tx, { listId: list.id, isArchived: true })
			await ageItem(tx, archived.id, 300)

			const result = await staleItemsAnalyzer.run(buildCtx(tx, user.id))

			expect(result.recs).toHaveLength(0)
		})
	})

	it('skips inactive lists', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist', isActive: false })
			const a = await makeItem(tx, { listId: list.id })
			const b = await makeItem(tx, { listId: list.id })
			await ageItem(tx, a.id, 200)
			await ageItem(tx, b.id, 250)

			const result = await staleItemsAnalyzer.run(buildCtx(tx, user.id))

			expect(result.recs).toHaveLength(0)
		})
	})

	it('with dependentId set, scopes to that dependent and excludes the user-only lists', async () => {
		// Verifies the per-dependent runner pass: when ctx.dependentId is the
		// dependent's id, the analyzer should only see items on lists where
		// lists.subjectDependentId matches AND lists.ownerId is the guardian.
		// The guardian's own list (subjectDependentId IS NULL) must be hidden.
		await withRollback(async tx => {
			const guardian = await makeUser(tx)
			const dep = await makeDependent(tx, { createdByUserId: guardian.id, name: 'Pippa' })
			await makeDependentGuardianship(tx, { guardianUserId: guardian.id, dependentId: dep.id })

			const ownList = await makeList(tx, { ownerId: guardian.id, type: 'wishlist' })
			const ownItem = await makeItem(tx, { listId: ownList.id, title: 'Mine 1' })
			const ownItem2 = await makeItem(tx, { listId: ownList.id, title: 'Mine 2' })
			await ageItem(tx, ownItem.id, 200)
			await ageItem(tx, ownItem2.id, 220)

			const depList = await makeList(tx, { ownerId: guardian.id, subjectDependentId: dep.id, type: 'wishlist' })
			const depItem1 = await makeItem(tx, { listId: depList.id, title: 'Pip 1' })
			const depItem2 = await makeItem(tx, { listId: depList.id, title: 'Pip 2' })
			await ageItem(tx, depItem1.id, 210)
			await ageItem(tx, depItem2.id, 230)

			const userResult = await staleItemsAnalyzer.run(buildCtx(tx, guardian.id))
			const depResult = await staleItemsAnalyzer.run(
				buildCtx(tx, guardian.id, {
					dependentId: dep.id,
					subject: { kind: 'dependent', id: dep.id, name: dep.name, image: null },
				})
			)

			// User pass sees only the guardian's own items.
			expect(userResult.recs).toHaveLength(1)
			expect(userResult.recs[0].relatedItems?.map(i => i.id).sort()).toEqual([String(ownItem.id), String(ownItem2.id)].sort())

			// Dependent pass sees only the dependent-subject items, and
			// stamps the dependent identity on the rendered ListRef.
			expect(depResult.recs).toHaveLength(1)
			expect(depResult.recs[0].relatedItems?.map(i => i.id).sort()).toEqual([String(depItem1.id), String(depItem2.id)].sort())
			const subject = depResult.recs[0].relatedLists?.[0]?.subject
			expect(subject?.kind).toBe('dependent')
			if (subject?.kind === 'dependent') expect(subject.name).toBe('Pippa')
		})
	})

	it('respects candidateCap', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			for (let i = 0; i < 6; i++) {
				const created = await makeItem(tx, { listId: list.id, title: `Old ${i}` })
				await ageItem(tx, created.id, 200 + i)
			}

			const result = await staleItemsAnalyzer.run(buildCtx(tx, user.id, { candidateCap: 3 }))

			// One grouped rec, but at most candidateCap items in it
			expect(result.recs).toHaveLength(1)
			expect(result.recs[0].relatedItems?.length ?? 0).toBeLessThanOrEqual(3)
		})
	})
})
