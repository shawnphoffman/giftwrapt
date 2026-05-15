// Coverage for the `duplicate-event-lists` rec produced by the
// list-hygiene analyzer + the `merge-lists` apply branch added in
// 2026-05 (phase 2). Covers the happy path (items, item groups, list
// addons, and claims follow items to the survivor; source list
// archived), drift cases that flip the rec to dismissed-equivalent
// (cluster mismatch, missing list, cross-type assertion), and the
// spoiler-safety construction (no `giftedItems` read in the analyzer;
// rec body / chips never mention claims).

import { randomUUID } from 'node:crypto'

import { makeGiftedItem, makeItem, makeList, makeListAddon, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { and, eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { applyRecommendationImpl } from '@/api/intelligence'
import { giftedItems, itemGroups, items, listAddons, lists, recommendations } from '@/db/schema'
import { listHygieneAnalyzer } from '@/lib/intelligence/analyzers/list-hygiene'
import type { AnalyzerContext } from '@/lib/intelligence/context'
import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

const NOW = new Date('2026-05-14T12:00:00Z')
const TWO_YEARS_AGO = new Date('2024-04-01T00:00:00Z')

const noopLogger = { info: () => undefined, warn: () => undefined, error: () => undefined }

function buildCtx(tx: any, userId: string, opts: Partial<AnalyzerContext> = {}): AnalyzerContext {
	return {
		db: tx,
		userId,
		model: null,
		settings: DEFAULT_APP_SETTINGS,
		logger: noopLogger,
		now: NOW,
		candidateCap: 50,
		dryRun: false,
		dependentId: null,
		subject: { kind: 'user', name: 'You', image: null },
		...opts,
	}
}

async function makeRec(
	tx: Parameters<Parameters<typeof withRollback>[0]>[0],
	args: { userId: string; status?: 'active' | 'dismissed' | 'applied' }
) {
	const [row] = await tx
		.insert(recommendations)
		.values({
			userId: args.userId,
			batchId: randomUUID(),
			analyzerId: 'list-hygiene',
			kind: 'duplicate-event-lists',
			fingerprint: `merge-${randomUUID()}`,
			status: args.status ?? 'active',
			severity: 'suggest',
			title: 'merge test',
			body: 'body',
			payload: {},
		})
		.returning()
	return row
}

describe('list-hygiene duplicate-event-lists analyzer pass', () => {
	it('surfaces a merge rec when two same-type lists with items exist and the older is forgotten', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const older = await makeList(tx, {
				ownerId: user.id,
				type: 'wishlist',
				name: 'Old Wishlist',
				createdAt: new Date('2023-01-01'),
				updatedAt: TWO_YEARS_AGO,
			})
			await makeItem(tx, { listId: older.id, title: 'Old item' })
			const newer = await makeList(tx, {
				ownerId: user.id,
				type: 'wishlist',
				name: 'New Wishlist',
				createdAt: new Date('2026-04-01'),
				updatedAt: new Date('2026-04-01'),
			})
			await makeItem(tx, { listId: newer.id, title: 'New item' })

			const result = await listHygieneAnalyzer.run(buildCtx(tx, user.id))
			const merge = result.recs.find(r => r.kind === 'duplicate-event-lists')
			expect(merge).toBeDefined()
			const apply = merge?.actions?.[0]?.apply
			expect(apply?.kind).toBe('merge-lists')
			if (apply?.kind === 'merge-lists') {
				expect(apply.survivorListId).toBe(String(newer.id))
				expect(apply.sourceListIds).toEqual([String(older.id)])
			}
			// Spoiler-safety probe: no claim-existence wording anywhere in
			// the rec text or chip metadata.
			const banned = /\b(claim|claimed|gift|gifter|gifters|purchase|purchased)\b/i
			expect(merge?.title).not.toMatch(banned)
			expect(merge?.body).not.toMatch(banned)
			for (const line of merge?.affected?.lines ?? []) expect(line).not.toMatch(banned)
		})
	})

	it('does not propose merging holiday lists bound to different customHolidayIds', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const easterId = '11111111-1111-1111-1111-111111111111'
			const halloweenId = '22222222-2222-2222-2222-222222222222'
			const { customHolidays } = await import('@/db/schema')
			await tx.insert(customHolidays).values({ id: easterId, title: 'Easter', source: 'custom', customMonth: 4, customDay: 5 })
			await tx.insert(customHolidays).values({ id: halloweenId, title: 'Halloween', source: 'custom', customMonth: 10, customDay: 31 })
			const easter = await makeList(tx, {
				ownerId: user.id,
				type: 'holiday',
				customHolidayId: easterId,
				createdAt: new Date('2023-01-01'),
				updatedAt: TWO_YEARS_AGO,
			})
			await makeItem(tx, { listId: easter.id })
			const halloween = await makeList(tx, {
				ownerId: user.id,
				type: 'holiday',
				customHolidayId: halloweenId,
				createdAt: new Date('2026-04-01'),
				updatedAt: new Date('2026-04-01'),
			})
			await makeItem(tx, { listId: halloween.id })

			const result = await listHygieneAnalyzer.run(buildCtx(tx, user.id))
			expect(result.recs.find(r => r.kind === 'duplicate-event-lists')).toBeUndefined()
		})
	})

	it('does not propose merging a wishlist with a christmas list (cross-type)', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const wish = await makeList(tx, {
				ownerId: user.id,
				type: 'wishlist',
				createdAt: new Date('2023-01-01'),
				updatedAt: TWO_YEARS_AGO,
			})
			await makeItem(tx, { listId: wish.id })
			const xmas = await makeList(tx, {
				ownerId: user.id,
				type: 'christmas',
				createdAt: new Date('2026-04-01'),
				updatedAt: new Date('2026-04-01'),
			})
			await makeItem(tx, { listId: xmas.id })

			const result = await listHygieneAnalyzer.run(buildCtx(tx, user.id))
			expect(result.recs.find(r => r.kind === 'duplicate-event-lists')).toBeUndefined()
		})
	})

	it('does not propose merging when the older list was touched within 365 days', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const a = await makeList(tx, {
				ownerId: user.id,
				type: 'wishlist',
				createdAt: new Date('2023-01-01'),
				updatedAt: new Date('2026-04-01'), // recent
			})
			await makeItem(tx, { listId: a.id })
			const b = await makeList(tx, {
				ownerId: user.id,
				type: 'wishlist',
				createdAt: new Date('2026-04-15'),
				updatedAt: new Date('2026-04-15'),
			})
			await makeItem(tx, { listId: b.id })

			const result = await listHygieneAnalyzer.run(buildCtx(tx, user.id))
			expect(result.recs.find(r => r.kind === 'duplicate-event-lists')).toBeUndefined()
		})
	})

	it('excludes a list with zero non-archived items', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const empty = await makeList(tx, {
				ownerId: user.id,
				type: 'wishlist',
				createdAt: new Date('2023-01-01'),
				updatedAt: TWO_YEARS_AGO,
			})
			// no items on `empty`
			const newer = await makeList(tx, {
				ownerId: user.id,
				type: 'wishlist',
				createdAt: new Date('2026-04-01'),
				updatedAt: new Date('2026-04-01'),
			})
			await makeItem(tx, { listId: newer.id })

			const result = await listHygieneAnalyzer.run(buildCtx(tx, empty.ownerId))
			expect(result.recs.find(r => r.kind === 'duplicate-event-lists')).toBeUndefined()
		})
	})
})

describe('applyRecommendationImpl - merge-lists', () => {
	it('moves items, item groups, list addons, and follows claims; archives sources', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const survivor = await makeList(tx, { ownerId: owner.id, type: 'wishlist', name: 'Keep' })
			const source = await makeList(tx, { ownerId: owner.id, type: 'wishlist', name: 'Old' })

			// Source has: an item with a claim, a list addon, and an item
			// inside a group. Survivor has its own item.
			const survivorItem = await makeItem(tx, { listId: survivor.id, title: 'Survivor item' })
			const sourceItem = await makeItem(tx, { listId: source.id, title: 'Source item' })
			await makeGiftedItem(tx, { itemId: sourceItem.id, gifterId: gifter.id })
			const [group] = await tx.insert(itemGroups).values({ listId: source.id, type: 'or', priority: 'normal' }).returning()
			const groupedItem = await makeItem(tx, { listId: source.id, title: 'Grouped', groupId: group.id, groupSortOrder: 0 })
			await makeListAddon(tx, { listId: source.id, userId: gifter.id, description: 'Bringing snacks' })

			const rec = await makeRec(tx, { userId: owner.id })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'merge-lists', survivorListId: String(survivor.id), sourceListIds: [String(source.id)] },
			})
			expect(result.ok).toBe(true)
			if (!result.ok || result.kind !== 'merge-lists') throw new Error('expected merge-lists result')
			expect(result.archivedSourceListIds).toEqual([String(source.id)])

			// Items moved.
			const survivorItems = await tx.select({ id: items.id }).from(items).where(eq(items.listId, survivor.id))
			expect(survivorItems.map(i => i.id).sort()).toEqual([survivorItem.id, sourceItem.id, groupedItem.id].sort())

			// Item group moved with its members; groupId on the item is preserved.
			const movedGroup = await tx.query.itemGroups.findFirst({ where: eq(itemGroups.id, group.id) })
			expect(movedGroup?.listId).toBe(survivor.id)
			const movedGroupedItem = await tx.query.items.findFirst({ where: eq(items.id, groupedItem.id) })
			expect(movedGroupedItem?.groupId).toBe(group.id)
			expect(movedGroupedItem?.listId).toBe(survivor.id)

			// List addon moved.
			const movedAddons = await tx.select({ id: listAddons.id }).from(listAddons).where(eq(listAddons.listId, survivor.id))
			expect(movedAddons).toHaveLength(1)

			// Claim still points at the original itemId; not modified.
			const claim = await tx.query.giftedItems.findFirst({ where: eq(giftedItems.itemId, sourceItem.id) })
			expect(claim).toBeDefined()

			// Source archived, not deleted.
			const sourceAfter = await tx.query.lists.findFirst({ where: eq(lists.id, source.id) })
			expect(sourceAfter?.isActive).toBe(false)

			// Rec flipped to applied.
			const recAfter = await tx.query.recommendations.findFirst({ where: eq(recommendations.id, rec.id) })
			expect(recAfter?.status).toBe('applied')
		})
	})

	it('leaves pending-deletion items on the source list (orphan-alert flow)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const survivor = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const source = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const stuck = await makeItem(tx, { listId: source.id, title: 'Pending deletion', pendingDeletionAt: NOW })
			const normal = await makeItem(tx, { listId: source.id, title: 'Normal' })

			const rec = await makeRec(tx, { userId: owner.id })
			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'merge-lists', survivorListId: String(survivor.id), sourceListIds: [String(source.id)] },
			})
			expect(result.ok).toBe(true)

			const stuckAfter = await tx.query.items.findFirst({ where: eq(items.id, stuck.id) })
			expect(stuckAfter?.listId).toBe(source.id)
			const normalAfter = await tx.query.items.findFirst({ where: eq(items.id, normal.id) })
			expect(normalAfter?.listId).toBe(survivor.id)
		})
	})

	it('refuses when a source list became inactive between rec and apply', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const survivor = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const source = await makeList(tx, { ownerId: owner.id, type: 'wishlist', isActive: false })
			const rec = await makeRec(tx, { userId: owner.id })
			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'merge-lists', survivorListId: String(survivor.id), sourceListIds: [String(source.id)] },
			})
			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.reason).toBe('merge-cluster-mismatch')
		})
	})

	it('refuses when a source list type drifted away from the survivor type', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const survivor = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const source = await makeList(tx, { ownerId: owner.id, type: 'christmas' })
			const rec = await makeRec(tx, { userId: owner.id })
			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'merge-lists', survivorListId: String(survivor.id), sourceListIds: [String(source.id)] },
			})
			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.reason).toBe('merge-cluster-mismatch')
		})
	})

	it('refuses when source and survivor have different subjectDependentId', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const { dependents, dependentGuardianships } = await import('@/db/schema')
			const depId = `dep_${owner.id}`
			await tx.insert(dependents).values({ id: depId, name: 'Sprout', createdByUserId: owner.id })
			await tx.insert(dependentGuardianships).values({ guardianUserId: owner.id, dependentId: depId })
			const survivor = await makeList(tx, { ownerId: owner.id, type: 'wishlist', subjectDependentId: null })
			const source = await makeList(tx, { ownerId: owner.id, type: 'wishlist', subjectDependentId: depId })
			const rec = await makeRec(tx, { userId: owner.id })
			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'merge-lists', survivorListId: String(survivor.id), sourceListIds: [String(source.id)] },
			})
			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.reason).toBe('merge-cluster-mismatch')
		})
	})

	it('refuses when survivor list does not exist', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const source = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const rec = await makeRec(tx, { userId: owner.id })
			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'merge-lists', survivorListId: '999999999', sourceListIds: [String(source.id)] },
			})
			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.reason).toBe('list-not-found')
		})
	})

	it('refuses when survivor id also appears in sourceListIds (self-merge)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const rec = await makeRec(tx, { userId: owner.id })
			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'merge-lists', survivorListId: String(list.id), sourceListIds: [String(list.id)] },
			})
			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.reason).toBe('merge-cluster-mismatch')
		})
	})

	it('refuses when the rec is no longer active (applied/dismissed)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const survivor = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const source = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const rec = await makeRec(tx, { userId: owner.id, status: 'dismissed' })
			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'merge-lists', survivorListId: String(survivor.id), sourceListIds: [String(source.id)] },
			})
			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.reason).toBe('rec-not-active')
		})
	})

	it('refuses when caller has no edit access on a list in the cluster', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const other = await makeUser(tx)
			const survivor = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const source = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			// `other` owns the rec (so the rec lookup passes) but isn't an
			// owner / guardian / editor of either list — canEditList blocks.
			const rec = await makeRec(tx, { userId: other.id })
			const result = await applyRecommendationImpl(tx, other.id, {
				id: rec.id,
				apply: { kind: 'merge-lists', survivorListId: String(survivor.id), sourceListIds: [String(source.id)] },
			})
			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.reason).toBe('cannot-edit')
		})
	})

	it('merges three lists at once (sources array of length 2)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const survivor = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const s1 = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const s2 = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			await makeItem(tx, { listId: s1.id, title: 'a' })
			await makeItem(tx, { listId: s2.id, title: 'b' })

			const rec = await makeRec(tx, { userId: owner.id })
			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'merge-lists', survivorListId: String(survivor.id), sourceListIds: [String(s1.id), String(s2.id)] },
			})
			expect(result.ok).toBe(true)
			if (!result.ok || result.kind !== 'merge-lists') throw new Error('expected merge-lists result')
			expect(result.archivedSourceListIds.sort()).toEqual([String(s1.id), String(s2.id)].sort())

			const onSurvivor = await tx.select({ id: items.id }).from(items).where(eq(items.listId, survivor.id))
			expect(onSurvivor).toHaveLength(2)

			const archived = await tx
				.select({ id: lists.id, isActive: lists.isActive })
				.from(lists)
				.where(and(inArray(lists.id, [s1.id, s2.id])))
			expect(archived.every(l => l.isActive === false)).toBe(true)
		})
	})
})
