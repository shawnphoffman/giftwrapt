import { makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import type * as AiModule from 'ai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

import { duplicatesAnalyzer } from '../analyzers/duplicates'
import type { AnalyzerContext } from '../context'

// Used by the LLM-path tests to assert exactly which pairs reached the
// model. Cleared per-test.
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
		// Default null: no model. The URL short-circuit MUST work without a
		// model. Tests that want to exercise the LLM path override this.
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

describe('duplicatesAnalyzer URL short-circuit', () => {
	it('emits a confident rec when two items on different lists share the same product URL, even with different titles', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const a = await makeList(tx, { ownerId: user.id, type: 'wishlist', name: 'Wishlist' })
			const b = await makeList(tx, { ownerId: user.id, type: 'christmas', name: 'Christmas 2026' })
			const left = await makeItem(tx, {
				listId: a.id,
				title: 'Sony XM4',
				url: 'https://www.amazon.com/dp/B08MVGF24M?ref_=foo',
			})
			const right = await makeItem(tx, {
				listId: b.id,
				title: 'Sony WH-1000XM4 black',
				url: 'http://amazon.com/dp/B08MVGF24M',
			})

			const result = await duplicatesAnalyzer.run(buildCtx(tx, user.id))

			expect(result.recs).toHaveLength(1)
			const rec = result.recs[0]
			// The URL-confirmed branch emits `suggest` severity and a
			// rationale that mentions the shared product page.
			expect(rec.severity).toBe('suggest')
			expect(rec.body).toMatch(/same product page/i)
			expect(rec.relatedItems?.map(i => i.id).sort()).toEqual([String(left.id), String(right.id)].sort())
			// The URL pass leaves a step marker so the admin debug surface
			// can see we short-circuited.
			expect(result.steps.some(s => s.name === 'duplicates:url-short-circuit')).toBe(true)
			// No model step recorded since ctx.model is null AND the URL
			// pass already consumed the only candidate pair.
			expect(result.steps.some(s => s.name === 'duplicates')).toBe(false)
		})
	})

	it('does NOT pair items on the SAME list even when their URLs match', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			await makeItem(tx, { listId: list.id, title: 'A', url: 'https://example.com/p/1' })
			await makeItem(tx, { listId: list.id, title: 'B', url: 'https://example.com/p/1' })

			const result = await duplicatesAnalyzer.run(buildCtx(tx, user.id))

			expect(result.recs).toHaveLength(0)
		})
	})

	it('does NOT pair items whose URLs differ in path, even when hosts match', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const a = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const b = await makeList(tx, { ownerId: user.id, type: 'christmas' })
			await makeItem(tx, { listId: a.id, title: 'Sony XM4', url: 'https://amazon.com/dp/B08MVGF24M' })
			await makeItem(tx, { listId: b.id, title: 'Sony XM5', url: 'https://amazon.com/dp/B0XYZ' })

			const result = await duplicatesAnalyzer.run(buildCtx(tx, user.id))

			// Different paths → not URL-paired. Title heuristic also
			// doesn't match (different normalized titles), so zero recs.
			expect(result.recs).toHaveLength(0)
		})
	})

	it('does not double-emit a pair already caught by the URL pass when the title pass would also have flagged it', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const a = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const b = await makeList(tx, { ownerId: user.id, type: 'christmas' })
			// Same URL AND same normalized title - both passes would have
			// flagged this. The URL pass should win and dedup the title
			// pass so we don't emit two recs for one pair.
			await makeItem(tx, { listId: a.id, title: 'Same Title', url: 'https://example.com/p/1' })
			await makeItem(tx, { listId: b.id, title: 'Same Title', url: 'https://example.com/p/1' })

			const result = await duplicatesAnalyzer.run(buildCtx(tx, user.id))

			expect(result.recs).toHaveLength(1)
			expect(result.recs[0].body).toMatch(/same product page/i)
		})
	})
})

describe('duplicatesAnalyzer title-Jaccard pre-filter', () => {
	beforeEach(() => {
		generateObjectMock.mockReset()
	})
	afterEach(() => {
		generateObjectMock.mockReset()
	})

	it('routes SKU-suffixed title pairs to the LLM that exact-normalize would have missed', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const a = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const b = await makeList(tx, { ownerId: user.id, type: 'christmas' })
			const left = await makeItem(tx, { listId: a.id, title: 'LEGO Star Wars X-Wing' })
			const right = await makeItem(tx, { listId: b.id, title: 'LEGO Star Wars X-Wing 75355' })

			generateObjectMock.mockResolvedValue({
				object: {
					pairs: [
						{
							leftItemId: String(left.id),
							rightItemId: String(right.id),
							confident: true,
							rationale: 'same Lego set, the 75355 suffix is the SKU.',
						},
					],
				},
				usage: { inputTokens: 80, outputTokens: 12, inputTokenDetails: {} },
			})

			const result = await duplicatesAnalyzer.run(buildCtx(tx, user.id, { model: sentinelModel }))

			expect(generateObjectMock).toHaveBeenCalledTimes(1)
			// The user prompt that hit the model must include both items.
			const callArgs = generateObjectMock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
			const userMsg = callArgs.messages.find(m => m.role === 'user')!
			expect(userMsg.content).toContain('LEGO Star Wars X-Wing 75355')
			expect(userMsg.content).toContain('LEGO Star Wars X-Wing')
			expect(result.recs).toHaveLength(1)
			expect(result.recs[0].body).toMatch(/Lego/i)
		})
	})

	it('drops obviously-unrelated pairs before the LLM call', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const a = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const b = await makeList(tx, { ownerId: user.id, type: 'christmas' })
			await makeItem(tx, { listId: a.id, title: 'Sony WH-1000XM4' })
			await makeItem(tx, { listId: b.id, title: 'Bose QuietComfort 45' })

			const result = await duplicatesAnalyzer.run(buildCtx(tx, user.id, { model: sentinelModel }))

			// Token-set Jaccard is 0 here, well below the LLM floor.
			expect(generateObjectMock).not.toHaveBeenCalled()
			expect(result.recs).toHaveLength(0)
		})
	})

	it('heuristic-only fallback (no model) requires identical token sets, not just partial overlap', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const a = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const b = await makeList(tx, { ownerId: user.id, type: 'christmas' })
			// Token sets differ by one element (the SKU). Above the LLM
			// floor of 0.5 but below 1.0, so the no-model fallback
			// (which trades recall for precision) should NOT emit.
			await makeItem(tx, { listId: a.id, title: 'LEGO Star Wars X-Wing' })
			await makeItem(tx, { listId: b.id, title: 'LEGO Star Wars X-Wing 75355' })

			const result = await duplicatesAnalyzer.run(buildCtx(tx, user.id))

			expect(result.recs).toHaveLength(0)
		})
	})

	it('heuristic-only fallback still emits for identical token sets (e.g. reordered words)', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const a = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const b = await makeList(tx, { ownerId: user.id, type: 'christmas' })
			// Same token set (order differs). Token-set Jaccard = 1.0.
			await makeItem(tx, { listId: a.id, title: 'Apple AirPods Pro' })
			await makeItem(tx, { listId: b.id, title: 'AirPods Pro Apple' })

			const result = await duplicatesAnalyzer.run(buildCtx(tx, user.id))

			expect(result.recs).toHaveLength(1)
			expect(result.recs[0].body).toMatch(/very similar titles/i)
		})
	})
})
