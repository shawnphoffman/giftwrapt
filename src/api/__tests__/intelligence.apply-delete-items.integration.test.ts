import { randomUUID } from 'node:crypto'

import { makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { applyRecommendationImpl } from '@/api/intelligence'
import { items, recommendations } from '@/db/schema'

type Tx = Parameters<Parameters<typeof withRollback>[0]>[0]

async function makeStaleRec(tx: Tx, args: { userId: string; listId: number; itemRefs: Array<{ id: string; title: string }> }) {
	const payload = {
		relatedItems: args.itemRefs.map(it => ({
			id: it.id,
			title: it.title,
			listId: String(args.listId),
			listName: 'L',
			imageUrl: null,
			updatedAt: new Date().toISOString(),
			availability: 'available',
		})),
		affected: {
			noun: 'items',
			count: args.itemRefs.length,
			lines: args.itemRefs.map(it => `${it.title} · last edited 600 days ago`),
		},
		actions: args.itemRefs.map(it => ({
			label: 'Delete',
			description: `Delete "${it.title}".`,
			intent: 'destructive',
			apply: { kind: 'delete-items', listId: String(args.listId), itemIds: [it.id] },
		})),
	}
	const [row] = await tx
		.insert(recommendations)
		.values({
			userId: args.userId,
			batchId: randomUUID(),
			analyzerId: 'stale-items',
			kind: 'old-items',
			fingerprint: `test-${randomUUID()}`,
			status: 'active',
			severity: 'info',
			title: 'Long-stale items',
			body: 'These look stale.',
			payload,
		})
		.returning()
	return row
}

describe('applyRecommendationImpl - delete-items (partial)', () => {
	it('keeps the rec active and prunes the deleted item from the payload when others remain', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const a = await makeItem(tx, { listId: list.id, title: 'A' })
			const b = await makeItem(tx, { listId: list.id, title: 'B' })
			const c = await makeItem(tx, { listId: list.id, title: 'C' })
			const rec = await makeStaleRec(tx, {
				userId: owner.id,
				listId: list.id,
				itemRefs: [
					{ id: String(a.id), title: 'A' },
					{ id: String(b.id), title: 'B' },
					{ id: String(c.id), title: 'C' },
				],
			})

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'delete-items', listId: String(list.id), itemIds: [String(b.id)] },
			})
			expect(result.ok).toBe(true)

			const recAfter = await tx.query.recommendations.findFirst({ where: eq(recommendations.id, rec.id) })
			expect(recAfter?.status).toBe('active')

			const payload = recAfter?.payload as {
				relatedItems: Array<{ id: string; title: string }>
				affected: { count: number; lines: Array<string> }
				actions: Array<{ apply?: { itemIds: Array<string> } }>
			}
			expect(payload.relatedItems.map(r => r.id)).toEqual([String(a.id), String(c.id)])
			expect(payload.affected.count).toBe(2)
			expect(payload.affected.lines).toEqual(['A · last edited 600 days ago', 'C · last edited 600 days ago'])
			expect(payload.actions.flatMap(act => act.apply?.itemIds ?? [])).toEqual([String(a.id), String(c.id)])

			const itemRows = await tx.select({ id: items.id }).from(items).where(eq(items.listId, list.id))
			expect(itemRows.map(r => r.id).sort()).toEqual([a.id, c.id].sort())
		})
	})

	it('marks the rec applied when the last remaining item is deleted', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const a = await makeItem(tx, { listId: list.id, title: 'A' })
			const rec = await makeStaleRec(tx, {
				userId: owner.id,
				listId: list.id,
				itemRefs: [{ id: String(a.id), title: 'A' }],
			})

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'delete-items', listId: String(list.id), itemIds: [String(a.id)] },
			})
			expect(result.ok).toBe(true)

			const recAfter = await tx.query.recommendations.findFirst({ where: eq(recommendations.id, rec.id) })
			expect(recAfter?.status).toBe('applied')
		})
	})
})
