// Coverage for the `stale-public-list` rec produced by the list-hygiene
// analyzer + the `archive-list` apply branch added in 2026-05 (phase
// 2). Covers the happy path for both branches (event-passed and
// owner-inactive), the combined-reason variant, the public-only +
// user-subject-only scopes, the `archive-list` apply (success, no-op
// when already archived, edit-access gate), and the spoiler-safety
// construction (rec body / chips never reference claims).
//
// Pure-helper edge cases (`evaluateStaleListPredicate`, `lastAnnualDate`,
// `reverseRenameToWishlist`) live in
// src/lib/intelligence/__tests__/stale-list.test.ts.

import { randomUUID } from 'node:crypto'

import { makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { applyRecommendationImpl } from '@/api/intelligence'
import { customHolidays, lists, recommendations } from '@/db/schema'
import { listHygieneAnalyzer } from '@/lib/intelligence/analyzers/list-hygiene'
import type { AnalyzerContext } from '@/lib/intelligence/context'
import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

const noopLogger = { info: () => undefined, warn: () => undefined, error: () => undefined }

// May 14, 2026. Christmas 2025 is 140 days ago — past the 90-day
// default threshold. The owner-inactivity windows below count back
// from this date.
const NOW = new Date('2026-05-14T12:00:00Z')
const FIFTEEN_MONTHS_AGO = new Date('2025-02-14T00:00:00Z')

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
			kind: 'stale-public-list',
			fingerprint: `stale-${randomUUID()}`,
			status: args.status ?? 'active',
			severity: 'suggest',
			title: 'stale test',
			body: 'body',
			payload: {},
		})
		.returning()
	return row
}

describe('list-hygiene stale-public-list analyzer pass', () => {
	it('fires event-passed for a christmas list well past last Dec 25', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, {
				ownerId: user.id,
				type: 'christmas',
				isPrivate: false,
				name: 'Christmas 2025',
				createdAt: new Date('2024-11-01'),
				updatedAt: new Date('2025-12-26'),
			})
			// Add a recent item so the inactive branch DOESN'T fire — we
			// want the rec to come purely from event-passed.
			await makeItem(tx, { listId: list.id, title: 'thing' })

			const result = await listHygieneAnalyzer.run(buildCtx(tx, user.id))
			const stale = result.recs.find(r => r.kind === 'stale-public-list')
			expect(stale).toBeDefined()
			expect(stale?.title).toContain('Christmas 2025')
			expect(stale?.body).toContain('Last Christmas')
			// Spoiler-safety probe: rec text contains no claim-existence
			// wording.
			const banned = /\b(claim|claimed|claims|gift|gifter|gifters|purchase|purchased)\b/i
			expect(stale?.title).not.toMatch(banned)
			expect(stale?.body).not.toMatch(banned)
			// Two-action card.
			expect(stale?.actions).toHaveLength(2)
			const apply0 = stale?.actions?.[0]?.apply
			const apply1 = stale?.actions?.[1]?.apply
			expect(apply0?.kind).toBe('archive-list')
			expect(apply1?.kind).toBe('convert-list')
			if (apply1?.kind === 'convert-list') {
				expect(apply1.newType).toBe('wishlist')
				expect(apply1.newCustomHolidayId).toBeNull()
				// Reverse rename strips the event + year tokens.
				expect(apply1.newName).toBe('Wishlist')
			}
		})
	})

	it('fires inactive for a wishlist with old list.updatedAt and old max(items.updatedAt)', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, {
				ownerId: user.id,
				type: 'wishlist',
				isPrivate: false,
				name: 'Old Wishlist',
				createdAt: new Date('2024-01-01'),
				updatedAt: FIFTEEN_MONTHS_AGO,
			})
			// Item updated 15 months ago so MAX(items.updatedAt) is also old.
			await makeItem(tx, { listId: list.id, title: 'thing', updatedAt: FIFTEEN_MONTHS_AGO })

			const result = await listHygieneAnalyzer.run(buildCtx(tx, user.id))
			const stale = result.recs.find(r => r.kind === 'stale-public-list')
			expect(stale).toBeDefined()
			expect(stale?.body).toContain("hasn't been touched in over a year")
		})
	})

	it('fires the combined-reason rec when both event-passed AND inactive fire', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, {
				ownerId: user.id,
				type: 'christmas',
				isPrivate: false,
				name: 'Christmas 2024',
				createdAt: new Date('2023-12-01'),
				updatedAt: FIFTEEN_MONTHS_AGO,
			})
			await makeItem(tx, { listId: list.id, title: 'thing', updatedAt: FIFTEEN_MONTHS_AGO })

			const result = await listHygieneAnalyzer.run(buildCtx(tx, user.id))
			const stale = result.recs.find(r => r.kind === 'stale-public-list')
			expect(stale).toBeDefined()
			// Combined-reason wording prefers the event-passed body and
			// appends the "also hasn't been touched" sentence.
			expect(stale?.body).toContain('Last Christmas')
			expect(stale?.body).toContain('also')
		})
	})

	it('does NOT fire for a private list (out of scope for this phase)', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, {
				ownerId: user.id,
				type: 'wishlist',
				isPrivate: true,
				name: 'Old Private List',
				createdAt: new Date('2024-01-01'),
				updatedAt: FIFTEEN_MONTHS_AGO,
			})
			await makeItem(tx, { listId: list.id, title: 'thing', updatedAt: FIFTEEN_MONTHS_AGO })

			const result = await listHygieneAnalyzer.run(buildCtx(tx, user.id))
			expect(result.recs.find(r => r.kind === 'stale-public-list')).toBeUndefined()
		})
	})

	it('does NOT fire on dependent-subject runs (user-subject only in this phase)', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const { dependents, dependentGuardianships } = await import('@/db/schema')
			const depId = `dep_${user.id}`
			await tx.insert(dependents).values({ id: depId, name: 'Sprout', createdByUserId: user.id })
			await tx.insert(dependentGuardianships).values({ guardianUserId: user.id, dependentId: depId })
			const list = await makeList(tx, {
				ownerId: user.id,
				subjectDependentId: depId,
				type: 'wishlist',
				isPrivate: false,
				name: "Sprout's Old List",
				createdAt: new Date('2024-01-01'),
				updatedAt: FIFTEEN_MONTHS_AGO,
			})
			await makeItem(tx, { listId: list.id, title: 'thing', updatedAt: FIFTEEN_MONTHS_AGO })

			const result = await listHygieneAnalyzer.run(buildCtx(tx, user.id, { dependentId: depId }))
			expect(result.recs.find(r => r.kind === 'stale-public-list')).toBeUndefined()
		})
	})

	it('respects the intelligenceStaleListPastEventDays threshold', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, {
				ownerId: user.id,
				type: 'christmas',
				isPrivate: false,
				name: 'Christmas 2025',
				createdAt: new Date('2024-11-01'),
				updatedAt: new Date('2025-12-26'),
			})
			await makeItem(tx, { listId: list.id, title: 'thing' })

			// Set threshold to 365 days; the list is only ~140 days past Dec 25.
			const result = await listHygieneAnalyzer.run(
				buildCtx(tx, user.id, { settings: { ...DEFAULT_APP_SETTINGS, intelligenceStaleListPastEventDays: 365 } })
			)
			expect(result.recs.find(r => r.kind === 'stale-public-list')).toBeUndefined()
		})
	})

	it('resolves customHolidayLastOccurrence for a stale holiday-typed list', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			// Annual holiday Easter (Apr 5, source=custom, year=null).
			// On 2026-05-14, last occurrence rolled back to 2026-04-05 —
			// 39 days ago. Use a 30-day threshold so it qualifies.
			const easterId = '11111111-1111-1111-1111-111111111111'
			await tx.insert(customHolidays).values({ id: easterId, title: 'Easter', source: 'custom', customMonth: 4, customDay: 5 })
			const list = await makeList(tx, {
				ownerId: user.id,
				type: 'holiday',
				customHolidayId: easterId,
				isPrivate: false,
				name: 'Easter 2026',
				createdAt: new Date('2026-02-01'),
				updatedAt: new Date('2026-04-10'),
			})
			await makeItem(tx, { listId: list.id, title: 'thing' })

			const result = await listHygieneAnalyzer.run(
				buildCtx(tx, user.id, { settings: { ...DEFAULT_APP_SETTINGS, intelligenceStaleListPastEventDays: 30 } })
			)
			const stale = result.recs.find(r => r.kind === 'stale-public-list')
			expect(stale).toBeDefined()
			expect(stale?.body).toContain('Last Easter')
		})
	})

	it('preserves a name when reverseRenameToWishlist would still emit something meaningful', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, {
				ownerId: user.id,
				type: 'wishlist',
				isPrivate: false,
				// "Christmas" is an event token, "2024" is a year token —
				// both stripped. "Sam's" survives the strip.
				name: "Sam's Christmas 2024 List",
				createdAt: new Date('2024-01-01'),
				updatedAt: FIFTEEN_MONTHS_AGO,
			})
			await makeItem(tx, { listId: list.id, title: 'thing', updatedAt: FIFTEEN_MONTHS_AGO })

			const result = await listHygieneAnalyzer.run(buildCtx(tx, user.id))
			const stale = result.recs.find(r => r.kind === 'stale-public-list')
			const convertApply = stale?.actions?.find(a => a.apply?.kind === 'convert-list')?.apply
			expect(convertApply?.kind).toBe('convert-list')
			if (convertApply?.kind === 'convert-list') {
				expect(convertApply.newName).toBe("Sam's List")
			}
		})
	})

	it('produces a fingerprint that varies with staleReason', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, {
				ownerId: user.id,
				type: 'christmas',
				isPrivate: false,
				name: 'Christmas 2025',
				createdAt: new Date('2024-11-01'),
				updatedAt: new Date('2025-12-26'),
			})
			await makeItem(tx, { listId: list.id, title: 'thing' })

			const eventOnly = await listHygieneAnalyzer.run(buildCtx(tx, user.id))
			const eventFp = eventOnly.recs.find(r => r.kind === 'stale-public-list')?.fingerprintTargets.join(',')
			expect(eventFp).toContain('event-passed')

			// Make it also inactive — fingerprint reason should flip to "both".
			await tx.update(lists).set({ updatedAt: FIFTEEN_MONTHS_AGO }).where(eq(lists.id, list.id))
			await tx
				.update((await import('@/db/schema')).items)
				.set({ updatedAt: FIFTEEN_MONTHS_AGO })
				.where(eq((await import('@/db/schema')).items.listId, list.id))

			const both = await listHygieneAnalyzer.run(buildCtx(tx, user.id))
			const bothFp = both.recs.find(r => r.kind === 'stale-public-list')?.fingerprintTargets.join(',')
			expect(bothFp).toContain('both')
			expect(bothFp).not.toBe(eventFp)
		})
	})
})

describe('applyRecommendationImpl - archive-list', () => {
	it('flips isActive to false and marks the rec applied', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'christmas' })
			const rec = await makeRec(tx, { userId: owner.id })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'archive-list', listId: String(list.id) },
			})
			expect(result.ok).toBe(true)
			if (!result.ok || result.kind !== 'archive-list') throw new Error('expected archive-list result')

			const after = await tx.query.lists.findFirst({ where: eq(lists.id, list.id) })
			expect(after?.isActive).toBe(false)
			const recAfter = await tx.query.recommendations.findFirst({ where: eq(recommendations.id, rec.id) })
			expect(recAfter?.status).toBe('applied')
		})
	})

	it('is a no-op when the list was already archived (marks rec applied)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'christmas', isActive: false })
			const rec = await makeRec(tx, { userId: owner.id })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'archive-list', listId: String(list.id) },
			})
			expect(result.ok).toBe(true)
			const recAfter = await tx.query.recommendations.findFirst({ where: eq(recommendations.id, rec.id) })
			expect(recAfter?.status).toBe('applied')
		})
	})

	it('refuses when the list does not exist', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const rec = await makeRec(tx, { userId: owner.id })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'archive-list', listId: '999999999' },
			})
			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.reason).toBe('list-not-found')
		})
	})

	it('refuses when caller has no edit access on the list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const other = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'christmas' })
			const rec = await makeRec(tx, { userId: other.id })

			const result = await applyRecommendationImpl(tx, other.id, {
				id: rec.id,
				apply: { kind: 'archive-list', listId: String(list.id) },
			})
			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.reason).toBe('cannot-edit')
		})
	})

	it('refuses when the rec is no longer active', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'christmas' })
			const rec = await makeRec(tx, { userId: owner.id, status: 'dismissed' })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'archive-list', listId: String(list.id) },
			})
			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.reason).toBe('rec-not-active')
		})
	})
})
