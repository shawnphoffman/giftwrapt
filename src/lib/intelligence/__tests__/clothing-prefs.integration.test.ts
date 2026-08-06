import { makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { itemAiAnalysis } from '@/db/schema'
import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

import { clothingPrefsAnalyzer } from '../analyzers/clothing-prefs'
import type { AnalyzerContext } from '../context'
import { ANALYSIS_VERSION, contentHashFor } from '../enrichment'

const noopLogger = { info: () => undefined, warn: () => undefined, error: () => undefined }

function buildCtx(tx: any, userId: string, opts: Partial<AnalyzerContext> = {}): AnalyzerContext {
	return {
		db: tx,
		userId,
		// Facet-driven: no model needed at rec time.
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

async function seedAnalysis(
	tx: any,
	item: { id: number; title: string; notes: string | null; url: string | null },
	facets: Partial<typeof itemAiAnalysis.$inferInsert> = {}
) {
	await tx.insert(itemAiAnalysis).values({
		itemId: item.id,
		contentHash: contentHashFor(item.title, item.notes, item.url),
		analysisVersion: ANALYSIS_VERSION,
		category: 'clothing',
		isClothing: true,
		hasSize: false,
		hasColor: false,
		sizingRationale: 'A gifter would still need the size.',
		...facets,
	})
}

describe('clothingPrefsAnalyzer (facet-driven)', () => {
	it('bundles clothing items missing size/color from stored facets, without a model', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const hoodie = await makeItem(tx, { listId: list.id, title: 'Cozy Hoodie' })
			const tee = await makeItem(tx, { listId: list.id, title: 'Graphic Tee' })
			// Fully specified: has both size and color -> excluded.
			const jacket = await makeItem(tx, { listId: list.id, title: 'Rain Jacket, Navy, L' })
			// Not clothing -> excluded.
			const mug = await makeItem(tx, { listId: list.id, title: 'Camping Mug' })
			await seedAnalysis(tx, hoodie)
			await seedAnalysis(tx, tee, { hasSize: true, sizingRationale: 'Color preference is still missing.' })
			await seedAnalysis(tx, jacket, { hasSize: true, hasColor: true, sizingRationale: null })
			await seedAnalysis(tx, mug, { category: 'home-kitchen', isClothing: false, sizingRationale: null })

			const result = await clothingPrefsAnalyzer.run(buildCtx(tx, user.id))

			expect(result.recs).toHaveLength(1)
			const rec = result.recs[0]
			expect(rec.kind).toBe('clothing-missing-prefs')
			expect(rec.subItems?.map(s => s.id).sort()).toEqual([String(hoodie.id), String(tee.id)].sort())
			const teeRow = rec.subItems?.find(s => s.id === String(tee.id))
			expect(teeRow?.detail).toBe('Color preference is still missing.')
		})
	})

	it('emits nothing when items have no analysis rows yet', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			await makeItem(tx, { listId: list.id, title: 'Cozy Hoodie' })

			const result = await clothingPrefsAnalyzer.run(buildCtx(tx, user.id))

			expect(result.recs).toHaveLength(0)
			expect(result.inputHash).not.toBeNull()
		})
	})

	it('returns unchanged=true when priorInputHash matches, and a facet change invalidates it', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			const hoodie = await makeItem(tx, { listId: list.id, title: 'Cozy Hoodie' })
			await seedAnalysis(tx, hoodie)

			const first = await clothingPrefsAnalyzer.run(buildCtx(tx, user.id))
			expect(first.recs).toHaveLength(1)
			expect(first.unchanged).toBeUndefined()

			const second = await clothingPrefsAnalyzer.run(buildCtx(tx, user.id, { priorInputHash: first.inputHash }))
			expect(second.unchanged).toBe(true)
			expect(second.recs).toHaveLength(0)

			// User records the size/color -> re-enrichment flips the facets
			// -> the facet state participates in the hash, so the carry
			// breaks and the analyzer regenerates (now with no gaps left).
			await tx.update(itemAiAnalysis).set({ hasSize: true, hasColor: true }).where(eq(itemAiAnalysis.itemId, hoodie.id))
			const third = await clothingPrefsAnalyzer.run(buildCtx(tx, user.id, { priorInputHash: first.inputHash }))
			expect(third.unchanged).toBeUndefined()
			expect(third.recs).toHaveLength(0)
			expect(third.inputHash).not.toBe(first.inputHash)
		})
	})
})
