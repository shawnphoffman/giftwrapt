// Coverage for the three list-hygiene apply branches added to
// applyRecommendationImpl: convert-list, change-list-privacy, create-list.
// Each branch is exercised on the happy path plus its key re-validation
// gates (todos-lock, list-type-disabled, giftideas force-private,
// invalid-holiday-selection, not-dependent-guardian, etc.).

import { randomUUID } from 'node:crypto'

import { makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { applyRecommendationImpl } from '@/api/intelligence'
import { customHolidays, dependentGuardianships, dependents, lists, recommendations } from '@/db/schema'

async function makeRec(
	tx: Parameters<Parameters<typeof withRollback>[0]>[0],
	args: { userId: string; status?: 'active' | 'dismissed' | 'applied'; analyzerId?: string; kind?: string }
) {
	const [row] = await tx
		.insert(recommendations)
		.values({
			userId: args.userId,
			batchId: randomUUID(),
			analyzerId: args.analyzerId ?? 'list-hygiene',
			kind: args.kind ?? 'convert-public-list',
			fingerprint: `test-${randomUUID()}`,
			status: args.status ?? 'active',
			severity: 'important',
			title: 'List-hygiene rec',
			body: 'Body',
			payload: {},
		})
		.returning()
	return row
}

describe('applyRecommendationImpl - convert-list', () => {
	it('changes list type, updates name, and marks the rec applied', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'christmas', name: 'Christmas 2025' })
			const rec = await makeRec(tx, { userId: owner.id })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: {
					kind: 'convert-list',
					listId: String(list.id),
					newType: 'birthday',
					newName: 'Birthday 2026',
				},
			})

			expect(result.ok).toBe(true)
			if (!result.ok || result.kind !== 'convert-list') throw new Error('expected convert-list result')

			const after = await tx.query.lists.findFirst({ where: eq(lists.id, list.id) })
			expect(after?.type).toBe('birthday')
			expect(after?.name).toBe('Birthday 2026')

			const recAfter = await tx.query.recommendations.findFirst({ where: eq(recommendations.id, rec.id) })
			expect(recAfter?.status).toBe('applied')
		})
	})

	it('rebinds customHolidayId and nulls lastHolidayArchiveAt when type stays holiday', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const easterId = '11111111-1111-1111-1111-111111111111'
			const halloweenId = '22222222-2222-2222-2222-222222222222'
			await tx.insert(customHolidays).values({ id: easterId, title: 'Easter', source: 'custom', customMonth: 4, customDay: 5 })
			await tx.insert(customHolidays).values({ id: halloweenId, title: 'Halloween', source: 'custom', customMonth: 6, customDay: 1 })
			const list = await makeList(tx, {
				ownerId: owner.id,
				type: 'holiday',
				customHolidayId: easterId,
				lastHolidayArchiveAt: new Date(),
			})
			const rec = await makeRec(tx, { userId: owner.id })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: {
					kind: 'convert-list',
					listId: String(list.id),
					newType: 'holiday',
					newCustomHolidayId: halloweenId,
				},
			})

			expect(result.ok).toBe(true)
			const after = await tx.query.lists.findFirst({ where: eq(lists.id, list.id) })
			expect(after?.customHolidayId).toBe(halloweenId)
			expect(after?.lastHolidayArchiveAt).toBeNull()
		})
	})

	it('clears holiday metadata when leaving the holiday type', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const easterId = '33333333-3333-3333-3333-333333333333'
			await tx.insert(customHolidays).values({ id: easterId, title: 'Easter', source: 'custom', customMonth: 4, customDay: 5 })
			const list = await makeList(tx, {
				ownerId: owner.id,
				type: 'holiday',
				customHolidayId: easterId,
				holidayCountry: 'US',
				holidayKey: 'easter',
			})
			const rec = await makeRec(tx, { userId: owner.id })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: {
					kind: 'convert-list',
					listId: String(list.id),
					newType: 'birthday',
				},
			})

			expect(result.ok).toBe(true)
			const after = await tx.query.lists.findFirst({ where: eq(lists.id, list.id) })
			expect(after?.type).toBe('birthday')
			expect(after?.customHolidayId).toBeNull()
			expect(after?.holidayCountry).toBeNull()
			expect(after?.holidayKey).toBeNull()
		})
	})

	it('refuses when the list was deleted between rec creation and apply', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const rec = await makeRec(tx, { userId: owner.id })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: {
					kind: 'convert-list',
					listId: '999999999',
					newType: 'birthday',
				},
			})

			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.reason).toBe('list-not-found')
		})
	})

	it('refuses when the new type is admin-disabled', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const rec = await makeRec(tx, { userId: owner.id })

			// Disable birthday lists tenant-wide so the convert is refused.
			const { appSettings } = await import('@/db/schema')
			await tx.insert(appSettings).values({ key: 'enableBirthdayLists', value: false })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'convert-list', listId: String(list.id), newType: 'birthday' },
			})

			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.reason).toBe('list-type-disabled')
		})
	})

	it('refuses when newType is todos (type-locked) or current is todos', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const rec = await makeRec(tx, { userId: owner.id })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'convert-list', listId: String(list.id), newType: 'todos' },
			})

			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.reason).toBe('todo-list-type-locked')
		})
	})

	it('refuses convert TO holiday without a customHolidayId', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const rec = await makeRec(tx, { userId: owner.id })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'convert-list', listId: String(list.id), newType: 'holiday' },
			})

			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.reason).toBe('invalid-holiday-selection')
		})
	})
})

describe('applyRecommendationImpl - change-list-privacy', () => {
	it('flips a private list public', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday', isPrivate: true })
			const rec = await makeRec(tx, { userId: owner.id, kind: 'make-private-list-public' })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'change-list-privacy', listId: String(list.id), isPrivate: false },
			})

			expect(result.ok).toBe(true)
			const after = await tx.query.lists.findFirst({ where: eq(lists.id, list.id) })
			expect(after?.isPrivate).toBe(false)
		})
	})

	it('refuses to flip a giftideas list public (force-private rule)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'giftideas', isPrivate: true })
			const rec = await makeRec(tx, { userId: owner.id, kind: 'make-private-list-public' })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'change-list-privacy', listId: String(list.id), isPrivate: false },
			})

			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.reason).toBe('invalid-list-type')
		})
	})

	it('marks the rec applied on a no-op (already at target value)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday', isPrivate: false })
			const rec = await makeRec(tx, { userId: owner.id, kind: 'make-private-list-public' })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: { kind: 'change-list-privacy', listId: String(list.id), isPrivate: false },
			})

			expect(result.ok).toBe(true)
			const recAfter = await tx.query.recommendations.findFirst({ where: eq(recommendations.id, rec.id) })
			expect(recAfter?.status).toBe('applied')
		})
	})
})

describe('applyRecommendationImpl - create-list', () => {
	it('creates a private list and promotes it to primary when no primary exists', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const rec = await makeRec(tx, { userId: owner.id, kind: 'create-event-list' })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: {
					kind: 'create-list',
					type: 'birthday',
					name: 'Birthday 2026',
					isPrivate: true,
					setAsPrimary: true,
				},
			})

			expect(result.ok).toBe(true)
			if (!result.ok || result.kind !== 'create-list') throw new Error('expected create-list result')
			expect(result.setPrimary).toBe(true)

			const created = await tx.query.lists.findFirst({ where: eq(lists.id, Number.parseInt(result.listId, 10)) })
			expect(created?.type).toBe('birthday')
			expect(created?.name).toBe('Birthday 2026')
			expect(created?.isPrivate).toBe(true)
			expect(created?.isPrimary).toBe(true)
			expect(created?.ownerId).toBe(owner.id)
		})
	})

	it('does NOT promote to primary when a primary already exists', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			await makeList(tx, { ownerId: owner.id, type: 'wishlist', isPrimary: true })
			const rec = await makeRec(tx, { userId: owner.id, kind: 'create-event-list' })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: {
					kind: 'create-list',
					type: 'birthday',
					name: 'Birthday 2026',
					isPrivate: true,
					setAsPrimary: true,
				},
			})

			expect(result.ok).toBe(true)
			if (!result.ok || result.kind !== 'create-list') throw new Error('expected create-list result')
			expect(result.setPrimary).toBe(false)
		})
	})

	it('creates a dependent-subject list when caller is a guardian', async () => {
		await withRollback(async tx => {
			const guardian = await makeUser(tx)
			const depId = `dep_${guardian.id}`
			await tx.insert(dependents).values({ id: depId, name: 'Sprout', createdByUserId: guardian.id })
			await tx.insert(dependentGuardianships).values({ guardianUserId: guardian.id, dependentId: depId })

			const rec = await makeRec(tx, { userId: guardian.id, kind: 'create-event-list' })
			const result = await applyRecommendationImpl(tx, guardian.id, {
				id: rec.id,
				apply: {
					kind: 'create-list',
					type: 'birthday',
					name: 'Sprout Birthday 2026',
					isPrivate: true,
					setAsPrimary: false,
					subjectDependentId: depId,
				},
			})

			expect(result.ok).toBe(true)
			if (!result.ok || result.kind !== 'create-list') throw new Error('expected create-list result')
			const created = await tx.query.lists.findFirst({ where: eq(lists.id, Number.parseInt(result.listId, 10)) })
			expect(created?.subjectDependentId).toBe(depId)
		})
	})

	it('refuses when subjectDependentId is set but caller is not a guardian', async () => {
		await withRollback(async tx => {
			const guardian = await makeUser(tx)
			const stranger = await makeUser(tx)
			const depId = `dep_${guardian.id}`
			await tx.insert(dependents).values({ id: depId, name: 'Sprout', createdByUserId: guardian.id })
			await tx.insert(dependentGuardianships).values({ guardianUserId: guardian.id, dependentId: depId })

			const rec = await makeRec(tx, { userId: stranger.id, kind: 'create-event-list' })
			const result = await applyRecommendationImpl(tx, stranger.id, {
				id: rec.id,
				apply: {
					kind: 'create-list',
					type: 'birthday',
					name: 'Sneaky',
					isPrivate: true,
					setAsPrimary: false,
					subjectDependentId: depId,
				},
			})

			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.reason).toBe('not-dependent-guardian')
		})
	})

	it('refuses when the requested type is admin-disabled', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const { appSettings } = await import('@/db/schema')
			await tx.insert(appSettings).values({ key: 'enableBirthdayLists', value: false })

			const rec = await makeRec(tx, { userId: owner.id, kind: 'create-event-list' })
			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: {
					kind: 'create-list',
					type: 'birthday',
					name: 'Birthday 2026',
					isPrivate: true,
					setAsPrimary: false,
				},
			})

			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.reason).toBe('list-type-disabled')
		})
	})

	it('refuses when type=holiday without a customHolidayId', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const rec = await makeRec(tx, { userId: owner.id, kind: 'create-event-list' })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: {
					kind: 'create-list',
					type: 'holiday',
					name: 'Generic Holiday',
					isPrivate: true,
					setAsPrimary: false,
				},
			})

			expect(result.ok).toBe(false)
			if (result.ok) return
			expect(result.reason).toBe('invalid-holiday-selection')
		})
	})
})
