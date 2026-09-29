import { randomUUID } from 'node:crypto'

import { makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import type * as AiModule from 'ai'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { itemGroups, items, recommendations } from '@/db/schema'
import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

import { groupingAnalyzer } from '../analyzers/grouping'
import type { AnalyzerContext } from '../context'
import { fingerprintFor } from '../fingerprint'
import { GROUPING_MAX_SUGGESTIONS } from '../prompts/grouping'

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
		model: sentinelModel,
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

type Suggestion = { action: 'new' | 'add'; groupType: 'or' | 'order'; groupId: string; itemIds: Array<string>; rationale: string }

function respondWith(suggestions: Array<Suggestion>) {
	generateObjectMock.mockResolvedValue({
		object: { suggestions },
		usage: { inputTokens: 100, outputTokens: 20, inputTokenDetails: {} },
	})
}

function userPromptOf(call: number): string {
	const args = generateObjectMock.mock.calls[call][0] as { messages: Array<{ role: string; content: string }> }
	return args.messages.find(m => m.role === 'user')!.content
}

function applyOf(rec: { actions?: Array<{ apply?: unknown }> }) {
	return rec.actions?.find(a => a.apply)?.apply as Record<string, unknown>
}

describe('groupingAnalyzer whole-list judging', () => {
	beforeEach(() => generateObjectMock.mockReset())
	afterEach(() => generateObjectMock.mockReset())

	it('sends the whole list with its existing groups, and emits multi-item and add-to-group recs', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist', name: 'Wishlist' })
			const [group] = await tx.insert(itemGroups).values({ listId: list.id, type: 'or' }).returning()
			const shoeA = await makeItem(tx, { listId: list.id, title: 'Hoka Clifton 9' })
			const shoeB = await makeItem(tx, { listId: list.id, title: 'Brooks Ghost 16' })
			await tx.update(items).set({ groupId: group.id, groupSortOrder: 0 }).where(eq(items.id, shoeA.id))
			await tx.update(items).set({ groupId: group.id, groupSortOrder: 1 }).where(eq(items.id, shoeB.id))
			const shoeC = await makeItem(tx, { listId: list.id, title: 'Nike Pegasus 41' })
			const bike1 = await makeItem(tx, { listId: list.id, title: 'EGO Power+ Mini Bike' })
			const bike2 = await makeItem(tx, { listId: list.id, title: 'Electric Dirt Bike' })
			const bike3 = await makeItem(tx, { listId: list.id, title: 'Antic Bike' })
			await makeItem(tx, { listId: list.id, title: 'Sisal Cat Scratcher' })

			respondWith([
				{
					action: 'new',
					groupType: 'or',
					groupId: '',
					itemIds: [bike1, bike2, bike3].map(i => String(i.id)),
					rationale: 'Three kids bikes.',
				},
				{ action: 'add', groupType: 'order', groupId: String(group.id), itemIds: [String(shoeC.id)], rationale: 'Another running shoe.' },
			])

			const result = await groupingAnalyzer.run(buildCtx(tx, user.id))

			expect(generateObjectMock).toHaveBeenCalledTimes(1)
			const prompt = userPromptOf(0)
			expect(prompt).toContain(`group id=${group.id} (or, pick one): "Hoka Clifton 9"; "Brooks Ghost 16"`)
			expect(prompt).toContain(`"Nike Pegasus 41" (id=${shoeC.id})`)
			expect(prompt).toContain('"Sisal Cat Scratcher"')
			// Grouped items appear only inside their group, not as ungrouped.
			expect(prompt).not.toContain(`(id=${shoeA.id})`)

			expect(result.recs).toHaveLength(2)
			const newGroup = result.recs.find(r => applyOf(r).kind === 'create-group')!
			expect(applyOf(newGroup).itemIds).toEqual([bike1, bike2, bike3].map(i => String(i.id)))
			const addRec = result.recs.find(r => applyOf(r).kind === 'add-to-group')!
			// Takes the group's real type, not the model's echo.
			expect(addRec.title).toContain('"pick one"')
			expect(applyOf(addRec)).toEqual({
				kind: 'add-to-group',
				listId: String(list.id),
				groupId: String(group.id),
				itemIds: [String(shoeC.id)],
			})
			expect(addRec.fingerprintTargets).toContain(`group:${group.id}`)
		})
	})

	it('drops malformed suggestions: unknown ids, reused items, single-item new groups, unknown groups', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const a = await makeItem(tx, { listId: list.id, title: 'PS5' })
			const b = await makeItem(tx, { listId: list.id, title: 'PS5 Controllers' })
			const c = await makeItem(tx, { listId: list.id, title: 'Bike helmet' })

			respondWith([
				{
					action: 'new',
					groupType: 'order',
					groupId: '',
					itemIds: [String(a.id), String(b.id), '999999'],
					rationale: 'Console then controllers.',
				},
				{ action: 'new', groupType: 'or', groupId: '', itemIds: [String(b.id), String(c.id)], rationale: 'Reuses b.' },
				{ action: 'add', groupType: 'or', groupId: '424242', itemIds: [String(c.id)], rationale: 'No such group.' },
			])

			const result = await groupingAnalyzer.run(buildCtx(tx, user.id))
			expect(result.recs).toHaveLength(1)
			expect(applyOf(result.recs[0]).itemIds).toEqual([String(a.id), String(b.id)])
		})
	})

	it('replays a cached list verdict without a model call, and re-asks once the list changes', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const a = await makeItem(tx, { listId: list.id, title: 'Jute Rug 2x3' })
			const b = await makeItem(tx, { listId: list.id, title: 'Jute Braided Rug' })
			respondWith([{ action: 'new', groupType: 'or', groupId: '', itemIds: [String(a.id), String(b.id)], rationale: 'Two small rugs.' }])

			await groupingAnalyzer.run(buildCtx(tx, user.id))
			expect(generateObjectMock).toHaveBeenCalledTimes(1)

			const replay = await groupingAnalyzer.run(buildCtx(tx, user.id))
			expect(generateObjectMock).toHaveBeenCalledTimes(1)
			expect(replay.recs).toHaveLength(1)
			expect(applyOf(replay.recs[0]).itemIds).toEqual([String(a.id), String(b.id)])

			await makeItem(tx, { listId: list.id, title: 'Sisal Rug 2x3' })
			await groupingAnalyzer.run(buildCtx(tx, user.id))
			expect(generateObjectMock).toHaveBeenCalledTimes(2)
		})
	})

	it('without a model, surfaces only cached verdicts', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			await makeItem(tx, { listId: list.id, title: 'Jute Rug 2x3' })
			await makeItem(tx, { listId: list.id, title: 'Jute Braided Rug' })
			const result = await groupingAnalyzer.run(buildCtx(tx, user.id, { model: null }))
			expect(generateObjectMock).not.toHaveBeenCalled()
			expect(result.recs).toHaveLength(0)
		})
	})

	it('dismissed recs are re-emitted (to stay dismissed) without using a fresh slot', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const pairs: Array<Suggestion> = []
			for (let i = 0; i <= GROUPING_MAX_SUGGESTIONS; i++) {
				const x = await makeItem(tx, { listId: list.id, title: `Thing ${i} red` })
				const y = await makeItem(tx, { listId: list.id, title: `Thing ${i} blue` })
				pairs.push({ action: 'new', groupType: 'or', groupId: '', itemIds: [String(x.id), String(y.id)], rationale: 'Two colors.' })
			}
			respondWith(pairs)

			const first = await groupingAnalyzer.run(buildCtx(tx, user.id))
			expect(first.recs).toHaveLength(GROUPING_MAX_SUGGESTIONS)

			await tx.insert(recommendations).values({
				userId: user.id,
				batchId: randomUUID(),
				analyzerId: 'grouping',
				kind: 'group-suggestion',
				fingerprint: fingerprintFor({
					analyzerId: 'grouping',
					kind: 'group-suggestion',
					fingerprintTargets: first.recs[0].fingerprintTargets,
				}),
				status: 'dismissed',
				severity: 'suggest',
				title: first.recs[0].title,
				body: first.recs[0].body,
				payload: {},
			})

			const second = await groupingAnalyzer.run(buildCtx(tx, user.id))
			expect(second.recs).toHaveLength(GROUPING_MAX_SUGGESTIONS + 1)
			expect(second.recs[0].fingerprintTargets).toEqual(first.recs[0].fingerprintTargets)
		})
	})
})
