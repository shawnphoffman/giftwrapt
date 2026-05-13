// Canonical permissions matrix test: every (role, list state) combination
// run through the three list-level helpers (`canViewList`,
// `canViewListAsAnyone`, `canEditList`).
//
// When `_expectations.ts` grows a new row, this file picks it up
// automatically via `it.each`. When a new helper or impl-level path
// needs matrix coverage, copy the structure here into the matching
// resource file.

import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { describeListState } from '@/lib/__tests__/permissions/_matrix-types'
import { canEditList, canViewList, canViewListAsAnyone } from '@/lib/permissions'

import { listExpectations } from './_expectations'
import { seedFor } from './_seeds'

// Filter once into per-action arrays. Vitest test names need to be unique
// per `it.each` call, and splitting by action keeps the names readable
// instead of cramming the action verb into a generic placeholder.
const viewExpectations = listExpectations.filter(e => e.action === 'view-via-canViewList')
const viewAsAnyoneExpectations = listExpectations.filter(e => e.action === 'view-via-canViewListAsAnyone')
const editExpectations = listExpectations.filter(e => e.action === 'edit-via-canEditList')

describe('canViewList × matrix', () => {
	it.each(viewExpectations)(
		'role=$role state=$listState.privacy/$listState.active → $expected',
		async ({ role, listState, expected, reasonOnDeny }) => {
			await withRollback(async tx => {
				const { viewer, list } = await seedFor(role, { tx, listState })
				const result = await canViewList(viewer.id, list, tx)

				if (expected === 'allow') {
					expect(result, `${role} on ${describeListState(listState)} should view-allow`).toEqual({ ok: true })
				} else {
					expect(result.ok, `${role} on ${describeListState(listState)} should view-deny`).toBe(false)
					if (!result.ok && reasonOnDeny) {
						expect(result.reason).toBe(reasonOnDeny)
					}
				}
			})
		}
	)
})

describe('canViewListAsAnyone × matrix', () => {
	it.each(viewAsAnyoneExpectations)(
		'role=$role state=$listState.privacy/$listState.active → $expected',
		async ({ role, listState, expected }) => {
			await withRollback(async tx => {
				const { viewer, list } = await seedFor(role, { tx, listState })
				const result = await canViewListAsAnyone(viewer.id, list, tx)

				if (expected === 'allow') {
					expect(result, `${role} on ${describeListState(listState)} should allow`).toEqual({ ok: true })
				} else {
					expect(result.ok, `${role} on ${describeListState(listState)} should deny`).toBe(false)
				}
			})
		}
	)
})

describe('canEditList × matrix', () => {
	it.each(editExpectations)(
		'role=$role state=$listState.privacy/$listState.active → $expected',
		async ({ role, listState, expected, reasonOnDeny }) => {
			await withRollback(async tx => {
				const { viewer, list } = await seedFor(role, { tx, listState })
				const result = await canEditList(viewer.id, list, tx)

				if (expected === 'allow') {
					expect(result, `${role} on ${describeListState(listState)} should edit-allow`).toEqual({ ok: true })
				} else {
					expect(result.ok, `${role} on ${describeListState(listState)} should edit-deny`).toBe(false)
					if (!result.ok && reasonOnDeny) {
						expect(result.reason).toBe(reasonOnDeny)
					}
				}
			})
		}
	)
})

// Sanity guard so we don't silently drop coverage if the table shape
// changes. If this assertion ever bites in CI, either the matrix shrank
// (intentional? update the constant) or filter logic regressed.
describe('matrix coverage', () => {
	it('runs at least one test per (role × list-state × action) cell', () => {
		// 9 roles × 6 list states × 3 actions = 162 expected cells.
		const total = viewExpectations.length + viewAsAnyoneExpectations.length + editExpectations.length
		expect(total).toBe(162)
	})
})
