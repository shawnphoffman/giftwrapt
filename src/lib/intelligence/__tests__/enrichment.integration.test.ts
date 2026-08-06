import { makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import type * as AiModule from 'ai'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/db'
import { itemAiAnalysis, items } from '@/db/schema'

import type { AnalyzerContext } from '../context'
import { ANALYSIS_VERSION, contentHashFor, runEnrichment } from '../enrichment'

const generateObjectMock = vi.fn()
vi.mock('ai', async () => {
	const actual: typeof AiModule = await vi.importActual('ai')
	return { ...actual, generateObject: (...args: Array<unknown>) => generateObjectMock(...args) }
})

const sentinelModel = { modelId: 'mock', specificationVersion: 'v3' } as unknown as NonNullable<AnalyzerContext['model']>
const noopLogger = { warn: () => undefined }

function aiItem(itemId: number, overrides: Record<string, unknown> = {}) {
	return {
		itemId: String(itemId),
		category: 'clothing',
		canonicalName: `canon ${itemId}`,
		isClothing: true,
		hasSize: false,
		hasColor: false,
		sizingRationale: 'A gifter would still need the size and color.',
		suggestedSizes: ['S', 'M', 'L'],
		suggestedColors: ['Black', 'Navy'],
		...overrides,
	}
}

function mockResponseFor(itemIds: Array<number>, overridesById: Record<number, Record<string, unknown>> = {}) {
	generateObjectMock.mockImplementationOnce(async () => ({
		object: { items: itemIds.map(id => aiItem(id, overridesById[id])) },
		usage: { inputTokens: 100, outputTokens: 50, inputTokenDetails: { cacheReadTokens: 0 } },
	}))
}

beforeEach(() => {
	generateObjectMock.mockReset()
})

describe('runEnrichment', () => {
	it('analyzes new items in one batched call and upserts facet rows', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const hoodie = await makeItem(tx, { listId: list.id, title: 'Cozy Hoodie' })
			const mug = await makeItem(tx, { listId: list.id, title: 'Camping Mug' })
			mockResponseFor([hoodie.id, mug.id], {
				[mug.id]: {
					category: 'home-kitchen',
					canonicalName: 'camping mug',
					isClothing: false,
					sizingRationale: '',
					suggestedSizes: [],
					suggestedColors: [],
				},
			})

			const result = await runEnrichment({
				db: tx as unknown as Database,
				userId: user.id,
				model: sentinelModel,
				modelName: 'mock-model',
				logger: noopLogger,
				now: new Date(),
			})

			expect(generateObjectMock).toHaveBeenCalledTimes(1)
			expect(result.analyzed).toBe(2)

			const rows = await tx.select().from(itemAiAnalysis)
			expect(rows).toHaveLength(2)
			const hoodieRow = rows.find(r => r.itemId === hoodie.id)!
			expect(hoodieRow.isClothing).toBe(true)
			expect(hoodieRow.hasSize).toBe(false)
			expect(hoodieRow.category).toBe('clothing')
			expect(hoodieRow.contentHash).toBe(contentHashFor('Cozy Hoodie', hoodie.notes, hoodie.url))
			expect(hoodieRow.analysisVersion).toBe(ANALYSIS_VERSION)
			expect(hoodieRow.model).toBe('mock-model')
			const mugRow = rows.find(r => r.itemId === mug.id)!
			expect(mugRow.isClothing).toBe(false)
			expect(mugRow.canonicalName).toBe('camping mug')
			expect(mugRow.sizingRationale).toBeNull()
		})
	})

	it('is a no-op on the second run when nothing changed', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const item = await makeItem(tx, { listId: list.id, title: 'Cozy Hoodie' })
			mockResponseFor([item.id])

			const db = tx as unknown as Database
			await runEnrichment({ db, userId: user.id, model: sentinelModel, modelName: 'mock-model', logger: noopLogger, now: new Date() })
			expect(generateObjectMock).toHaveBeenCalledTimes(1)

			const second = await runEnrichment({
				db,
				userId: user.id,
				model: sentinelModel,
				modelName: 'mock-model',
				logger: noopLogger,
				now: new Date(),
			})
			expect(generateObjectMock).toHaveBeenCalledTimes(1)
			expect(second.analyzed).toBe(0)
		})
	})

	it('re-analyzes after a content edit but only touches on a no-op modifiedAt bump', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const item = await makeItem(tx, { listId: list.id, title: 'Cozy Hoodie' })
			mockResponseFor([item.id])

			const db = tx as unknown as Database
			await runEnrichment({ db, userId: user.id, model: sentinelModel, modelName: 'mock-model', logger: noopLogger, now: new Date() })

			// No-op edit: modifiedAt bumps but title/notes/url are unchanged.
			// The sweep re-selects the row, sees the hash matches, and only
			// touches updatedAt — no model call.
			await tx
				.update(items)
				.set({ modifiedAt: new Date(Date.now() + 1000) })
				.where(eq(items.id, item.id))
			const touch = await runEnrichment({
				db,
				userId: user.id,
				model: sentinelModel,
				modelName: 'mock-model',
				logger: noopLogger,
				now: new Date(Date.now() + 2000),
			})
			expect(generateObjectMock).toHaveBeenCalledTimes(1)
			expect(touch.current).toBe(1)

			// Real edit: title changes -> hash differs -> model re-called.
			await tx
				.update(items)
				.set({ title: 'Cozy Hoodie XL', modifiedAt: new Date(Date.now() + 3000) })
				.where(eq(items.id, item.id))
			mockResponseFor([item.id])
			const third = await runEnrichment({
				db,
				userId: user.id,
				model: sentinelModel,
				modelName: 'mock-model',
				logger: noopLogger,
				now: new Date(Date.now() + 4000),
			})
			expect(generateObjectMock).toHaveBeenCalledTimes(2)
			expect(third.analyzed).toBe(1)

			const [row] = await tx.select().from(itemAiAnalysis).where(eq(itemAiAnalysis.itemId, item.id))
			expect(row.contentHash).toBe(contentHashFor('Cozy Hoodie XL', item.notes, item.url))
		})
	})

	it('records a step error and continues when the model call fails', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			await makeItem(tx, { listId: list.id, title: 'Cozy Hoodie' })
			generateObjectMock.mockRejectedValueOnce(new Error('provider down'))

			const result = await runEnrichment({
				db: tx as unknown as Database,
				userId: user.id,
				model: sentinelModel,
				modelName: 'mock-model',
				logger: noopLogger,
				now: new Date(),
			})

			expect(result.analyzed).toBe(0)
			const batchStep = result.steps.find(s => s.name.startsWith('enrichment:batch'))
			expect(batchStep?.error).toContain('provider down')
			// Row was not written; the item stays selected for the next run.
			const rows = await tx.select().from(itemAiAnalysis)
			expect(rows).toHaveLength(0)
		})
	})

	it('clamps invented categories to "other" and ignores invented item ids', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const item = await makeItem(tx, { listId: list.id, title: 'Mystery Thing' })
			generateObjectMock.mockImplementationOnce(async () => ({
				object: {
					items: [
						aiItem(item.id, {
							category: 'not-a-real-category',
							isClothing: false,
							sizingRationale: '',
							suggestedSizes: [],
							suggestedColors: [],
						}),
						aiItem(999999),
					],
				},
				usage: { inputTokens: 10, outputTokens: 5, inputTokenDetails: { cacheReadTokens: 0 } },
			}))

			const result = await runEnrichment({
				db: tx as unknown as Database,
				userId: user.id,
				model: sentinelModel,
				modelName: 'mock-model',
				logger: noopLogger,
				now: new Date(),
			})

			expect(result.analyzed).toBe(1)
			const rows = await tx.select().from(itemAiAnalysis)
			expect(rows).toHaveLength(1)
			expect(rows[0].itemId).toBe(item.id)
			expect(rows[0].category).toBe('other')
		})
	})
})
