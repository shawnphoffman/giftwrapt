import { makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import type * as AiModule from 'ai'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { intelligenceVerdicts, itemAiAnalysis, items } from '@/db/schema'
import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

import { duplicatesAnalyzer, pairVerdictKey } from '../analyzers/duplicates'
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

	it('still emits for identical token sets (e.g. reordered words) - auto-confirmed even with no model', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const a = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const b = await makeList(tx, { ownerId: user.id, type: 'christmas' })
			// Same token set (order differs). Jaccard = 1.0 → auto-
			// confirms above any LLM path, model present or not.
			await makeItem(tx, { listId: a.id, title: 'Apple AirPods Pro' })
			await makeItem(tx, { listId: b.id, title: 'AirPods Pro Apple' })

			const result = await duplicatesAnalyzer.run(buildCtx(tx, user.id))

			expect(result.recs).toHaveLength(1)
			expect(result.recs[0].body).toMatch(/nearly identical/i)
		})
	})
})

describe('duplicatesAnalyzer auto-confirm', () => {
	beforeEach(() => {
		generateObjectMock.mockReset()
	})
	afterEach(() => {
		generateObjectMock.mockReset()
	})

	it('emits a confident rec WITHOUT calling the model when titles share identical token sets', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const a = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const b = await makeList(tx, { ownerId: user.id, type: 'christmas' })
			// Token-set Jaccard = 1.0 (reordered words). Above the
			// auto-confirm floor of 0.9 → no LLM call.
			await makeItem(tx, { listId: a.id, title: 'Apple AirPods Pro' })
			await makeItem(tx, { listId: b.id, title: 'AirPods Pro Apple' })

			const result = await duplicatesAnalyzer.run(buildCtx(tx, user.id, { model: sentinelModel }))

			expect(generateObjectMock).not.toHaveBeenCalled()
			expect(result.recs).toHaveLength(1)
			expect(result.recs[0].severity).toBe('suggest')
			expect(result.recs[0].body).toMatch(/nearly identical/i)
			expect(result.steps.some(s => s.name === 'duplicates:auto-confirm')).toBe(true)
		})
	})

	it('does NOT auto-confirm borderline pairs - those still go to the LLM', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const a = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const b = await makeList(tx, { ownerId: user.id, type: 'christmas' })
			// {sony, xm4} vs {sony, xm4, black} → 2/3 ≈ 0.67. Above LLM
			// floor (0.5) but below auto-confirm floor (0.9). The model
			// is the right judge here ("black is a color spec, not a
			// duplicate").
			const left = await makeItem(tx, { listId: a.id, title: 'Sony XM4' })
			const right = await makeItem(tx, { listId: b.id, title: 'Sony XM4 Black' })

			generateObjectMock.mockResolvedValue({
				object: {
					pairs: [{ leftItemId: String(left.id), rightItemId: String(right.id), confident: false, rationale: 'color spec differs' }],
				},
				usage: { inputTokens: 50, outputTokens: 8, inputTokenDetails: {} },
			})

			const result = await duplicatesAnalyzer.run(buildCtx(tx, user.id, { model: sentinelModel }))

			expect(generateObjectMock).toHaveBeenCalledTimes(1)
			// LLM said not-confident → no rec emitted.
			expect(result.recs).toHaveLength(0)
			expect(result.steps.some(s => s.name === 'duplicates:auto-confirm')).toBe(false)
		})
	})

	it('mixes auto-confirm and LLM passes in one run when there are pairs in both tiers', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const a = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const b = await makeList(tx, { ownerId: user.id, type: 'christmas' })
			// Auto-confirm pair (identical token set).
			await makeItem(tx, { listId: a.id, title: 'PlayStation 5' })
			await makeItem(tx, { listId: b.id, title: 'PlayStation 5' })
			// LLM-tier pair (0.67 Jaccard).
			const left = await makeItem(tx, { listId: a.id, title: 'Sony XM4' })
			const right = await makeItem(tx, { listId: b.id, title: 'Sony XM4 Black' })

			generateObjectMock.mockResolvedValue({
				object: {
					pairs: [
						{
							leftItemId: String(left.id),
							rightItemId: String(right.id),
							confident: true,
							rationale: 'same model, color is just a variant',
						},
					],
				},
				usage: { inputTokens: 60, outputTokens: 12, inputTokenDetails: {} },
			})

			const result = await duplicatesAnalyzer.run(buildCtx(tx, user.id, { model: sentinelModel }))

			// One model call, with ONLY the borderline pair (the auto-
			// confirmed PS5 pair must not show up in the prompt).
			expect(generateObjectMock).toHaveBeenCalledTimes(1)
			const callArgs = generateObjectMock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
			const userMsg = callArgs.messages.find(m => m.role === 'user')!
			expect(userMsg.content).toContain('Sony XM4')
			expect(userMsg.content).not.toContain('PlayStation 5')

			// Two recs: one from auto-confirm, one from the LLM.
			expect(result.recs).toHaveLength(2)
			const bodies = result.recs.map(r => r.body)
			expect(bodies.some(body => /nearly identical/i.test(body))).toBe(true)
			expect(bodies.some(body => /same model/i.test(body))).toBe(true)
		})
	})
})

describe('duplicatesAnalyzer canonical-name tier', () => {
	it('confirms duplicates via matching canonical names without a model, even when titles diverge', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const a = await makeList(tx, { ownerId: user.id, type: 'wishlist', name: 'Wishlist' })
			const b = await makeList(tx, { ownerId: user.id, type: 'christmas', name: 'Christmas' })
			// Titles are dissimilar enough that the Jaccard floor would never
			// pair them — only the enrichment-derived canonical name links them.
			const left = await makeItem(tx, { listId: a.id, title: 'Pegasus 40 running shoes' })
			const right = await makeItem(tx, { listId: b.id, title: 'Nike Air Zoom (blue, size 11)' })
			await tx.insert(itemAiAnalysis).values([
				{ itemId: left.id, contentHash: 'h1', analysisVersion: 1, canonicalName: 'nike air zoom pegasus 40' },
				{ itemId: right.id, contentHash: 'h2', analysisVersion: 1, canonicalName: 'nike air zoom pegasus 40' },
			])

			const result = await duplicatesAnalyzer.run(buildCtx(tx, user.id))

			expect(result.recs).toHaveLength(1)
			expect(result.recs[0].body).toMatch(/same product/i)
			expect(result.steps.some(s => s.name === 'duplicates:canonical-name')).toBe(true)
			expect(generateObjectMock).not.toHaveBeenCalled()
		})
	})
})

describe('duplicatesAnalyzer verdict cache', () => {
	it('serves cached pair verdicts without calling the model', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const a = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const b = await makeList(tx, { ownerId: user.id, type: 'christmas' })
			await makeItem(tx, { listId: a.id, title: 'Lego X-Wing Starfighter' })
			await makeItem(tx, { listId: b.id, title: 'Lego X-Wing Starfighter 75355' })
			await tx.insert(intelligenceVerdicts).values({
				userId: user.id,
				kind: 'duplicate-pair',
				key: pairVerdictKey('Lego X-Wing Starfighter', 'Lego X-Wing Starfighter 75355'),
				verdict: { matched: true, confident: true, rationale: 'Same set, one title includes the set number.' },
			})

			const result = await duplicatesAnalyzer.run(buildCtx(tx, user.id, { model: sentinelModel }))

			expect(generateObjectMock).not.toHaveBeenCalled()
			expect(result.recs).toHaveLength(1)
			expect(result.recs[0].body).toMatch(/set number/i)
			const cacheStep = result.steps.find(s => s.name === 'duplicates:verdict-cache')
			expect(cacheStep?.parsed).toMatchObject({ hits: 1, misses: 0 })
		})
	})

	it('cached negative verdicts suppress the model call and the rec', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const a = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const b = await makeList(tx, { ownerId: user.id, type: 'christmas' })
			await makeItem(tx, { listId: a.id, title: 'Kindle Paperwhite 16GB' })
			await makeItem(tx, { listId: b.id, title: 'Kindle Paperwhite 32GB' })
			await tx.insert(intelligenceVerdicts).values({
				userId: user.id,
				kind: 'duplicate-pair',
				key: pairVerdictKey('Kindle Paperwhite 16GB', 'Kindle Paperwhite 32GB'),
				verdict: { matched: false, confident: false, rationale: '' },
			})

			const result = await duplicatesAnalyzer.run(buildCtx(tx, user.id, { model: sentinelModel }))

			expect(generateObjectMock).not.toHaveBeenCalled()
			expect(result.recs).toHaveLength(0)
		})
	})

	it('stores verdicts for judged and unechoed pairs after a model call', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const a = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const b = await makeList(tx, { ownerId: user.id, type: 'christmas' })
			const left = await makeItem(tx, { listId: a.id, title: 'Lego X-Wing Starfighter' })
			const right = await makeItem(tx, { listId: b.id, title: 'Lego X-Wing Starfighter 75355' })
			generateObjectMock.mockResolvedValueOnce({
				object: {
					pairs: [{ leftItemId: String(left.id), rightItemId: String(right.id), confident: true, rationale: 'Same set.' }],
				},
				usage: { inputTokens: 40, outputTokens: 10, inputTokenDetails: {} },
			})

			const first = await duplicatesAnalyzer.run(buildCtx(tx, user.id, { model: sentinelModel }))
			expect(generateObjectMock).toHaveBeenCalledTimes(1)
			expect(first.recs).toHaveLength(1)

			const stored = await tx.select().from(intelligenceVerdicts)
			expect(stored).toHaveLength(1)
			expect(stored[0].verdict).toMatchObject({ matched: true, confident: true })

			// Second run: same pair now hits the cache — no model call. (The
			// runner would normally skip via priorInputHash before even
			// getting here; the cache covers slates that changed elsewhere.)
			const second = await duplicatesAnalyzer.run(buildCtx(tx, user.id, { model: sentinelModel }))
			expect(generateObjectMock).toHaveBeenCalledTimes(1)
			expect(second.recs).toHaveLength(1)
		})
	})
})

describe('duplicatesAnalyzer skip-before-call gate', () => {
	it('returns unchanged=true and skips all work when priorInputHash matches', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const a = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const b = await makeList(tx, { ownerId: user.id, type: 'christmas' })
			await makeItem(tx, { listId: a.id, title: 'Lego X-Wing Starfighter' })
			await makeItem(tx, { listId: b.id, title: 'Lego X-Wing Starfighter 75355' })
			generateObjectMock.mockResolvedValue({
				object: { pairs: [] },
				usage: { inputTokens: 40, outputTokens: 10, inputTokenDetails: {} },
			})

			const first = await duplicatesAnalyzer.run(buildCtx(tx, user.id, { model: sentinelModel }))
			expect(first.unchanged).toBeUndefined()
			const callsAfterFirst = generateObjectMock.mock.calls.length

			const second = await duplicatesAnalyzer.run(buildCtx(tx, user.id, { model: sentinelModel, priorInputHash: first.inputHash }))
			expect(second.unchanged).toBe(true)
			expect(second.recs).toHaveLength(0)
			expect(generateObjectMock.mock.calls.length).toBe(callsAfterFirst)

			// A title edit breaks the carry: hash covers titles, not just ids.
			await tx.update(items).set({ title: 'Lego X-Wing Starfighter (UCS)' }).where(eq(items.listId, a.id))
			const third = await duplicatesAnalyzer.run(buildCtx(tx, user.id, { model: sentinelModel, priorInputHash: first.inputHash }))
			expect(third.unchanged).toBeUndefined()
		})
	})
})
