import { makeDependent, makeDependentGuardianship, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import type * as AiModule from 'ai'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { items } from '@/db/schema'
import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

import { staleItemsAnalyzer } from '../analyzers/stale-items'
import type { AnalyzerContext } from '../context'

const generateObjectMock = vi.fn()
vi.mock('ai', async () => {
	const actual: typeof AiModule = await vi.importActual('ai')
	return { ...actual, generateObject: (...args: Array<unknown>) => generateObjectMock(...args) }
})

const sentinelModel = { modelId: 'mock', specificationVersion: 'v3' } as unknown as NonNullable<AnalyzerContext['model']>

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

// LLM-path: the model returns each rec with an `intent` discriminator
// that decides whether we surface delete-per-item (cleanup) or a single
// "Group as Pick One" action (pick-one). Co-flagging 2+ items as
// alternatives is the case that motivated the discriminator: the rec
// "you have two old surge protectors - pick one" is structurally a
// grouping suggestion, not a cleanup, even though stale-items detected
// it.
describe('staleItemsAnalyzer intent branching (LLM path)', () => {
	beforeEach(() => {
		generateObjectMock.mockReset()
	})
	afterEach(() => {
		generateObjectMock.mockReset()
	})

	it("intent='pick-one' on 2+ items emits a group-suggestion rec with a create-group action", async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist', name: 'Office gear' })
			const surge1 = await makeItem(tx, { listId: list.id, title: 'Furman PST-8 Power Station' })
			const surge2 = await makeItem(tx, { listId: list.id, title: 'CyberPower Surge Multi-Pack' })
			await ageItem(tx, surge1.id, 864)
			await ageItem(tx, surge2.id, 862)

			generateObjectMock.mockResolvedValue({
				object: {
					lists: [
						{
							listId: String(list.id),
							recs: [
								{
									include: true,
									severity: 'suggest',
									headline: 'Two surge/power protection picks',
									rationale: 'You have multiple older power protection items that may be redundant - pick one.',
									itemIds: [String(surge1.id), String(surge2.id)],
									intent: 'pick-one',
								},
							],
						},
					],
				},
				usage: { inputTokens: 100, outputTokens: 30, inputTokenDetails: {} },
			})

			const result = await staleItemsAnalyzer.run(buildCtx(tx, user.id, { model: sentinelModel }))

			expect(result.recs).toHaveLength(1)
			const rec = result.recs[0]
			expect(rec.kind).toBe('group-suggestion')
			expect(rec.actions?.find(a => a.label === 'Group as Pick One')).toBeDefined()
			// No per-item Delete actions on the pick-one path.
			expect(rec.actions?.some(a => a.apply?.kind === 'delete-items')).toBe(false)

			const groupAction = (rec.actions ?? []).find(a => a.apply?.kind === 'create-group')
			expect(groupAction).toBeDefined()
			expect(groupAction?.apply).toMatchObject({
				kind: 'create-group',
				listId: String(list.id),
				groupType: 'or',
				itemIds: [String(surge1.id), String(surge2.id)],
			})
			// "Keep separate" lets the user dismiss the grouping framing.
			expect(rec.actions?.some(a => a.label === 'Keep separate' && a.intent === 'noop')).toBe(true)
		})
	})

	it("intent='cleanup' preserves the per-item Delete shape", async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist', name: 'Misc' })
			const a = await makeItem(tx, { listId: list.id, title: 'Random old thing A' })
			const b = await makeItem(tx, { listId: list.id, title: 'Random old thing B' })
			await ageItem(tx, a.id, 400)
			await ageItem(tx, b.id, 410)

			generateObjectMock.mockResolvedValue({
				object: {
					lists: [
						{
							listId: String(list.id),
							recs: [
								{
									include: true,
									severity: 'info',
									headline: 'Old items on Misc',
									rationale: 'These items have been forgotten - consider removing them.',
									itemIds: [String(a.id), String(b.id)],
									intent: 'cleanup',
								},
							],
						},
					],
				},
				usage: { inputTokens: 80, outputTokens: 20, inputTokenDetails: {} },
			})

			const result = await staleItemsAnalyzer.run(buildCtx(tx, user.id, { model: sentinelModel }))

			expect(result.recs).toHaveLength(1)
			const rec = result.recs[0]
			expect(rec.kind).toBe('old-items')
			// Two Delete rows (one per item), no grouping action.
			const deletes = rec.actions?.filter(act => act.apply?.kind === 'delete-items') ?? []
			expect(deletes).toHaveLength(2)
			expect(rec.actions?.some(act => act.apply?.kind === 'create-group')).toBe(false)
		})
	})

	it("intent='pick-one' with a single item is clamped to cleanup (grouping needs 2+)", async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const only = await makeItem(tx, { listId: list.id, title: 'Forgotten gadget' })
			await ageItem(tx, only.id, 400)

			generateObjectMock.mockResolvedValue({
				object: {
					lists: [
						{
							listId: String(list.id),
							recs: [
								{
									include: true,
									severity: 'info',
									headline: 'Forgotten gadget',
									rationale: 'You have not touched this in a long time.',
									itemIds: [String(only.id)],
									// Model misbehaves and returns pick-one for a
									// single-item rec; the analyzer must clamp it.
									intent: 'pick-one',
								},
							],
						},
					],
				},
				usage: { inputTokens: 70, outputTokens: 10, inputTokenDetails: {} },
			})

			const result = await staleItemsAnalyzer.run(buildCtx(tx, user.id, { model: sentinelModel }))

			expect(result.recs).toHaveLength(1)
			const rec = result.recs[0]
			expect(rec.kind).toBe('old-item')
			expect(rec.actions?.some(a => a.apply?.kind === 'create-group')).toBe(false)
			expect(rec.actions?.some(a => a.apply?.kind === 'delete-items')).toBe(true)
		})
	})
})
