// Claim vs off-list gift parity on dependent-subject lists.
//
// A list whose `subjectDependentId` is set is FOR the dependent, not for the
// guardian who owns it, so the "can't gift to your own list" guards only fire
// on regular lists. Claims got this carve-out first (self-claim gate in
// claimItemGiftImpl); off-list gifts must follow the same rule. Each case runs
// both actions so the two rules can't drift apart again.
//
// The main permission matrix has no dependent-list dimension (its roles and
// list states model a user-owned list), so these live as focused cases here
// rather than rows in `_expectations.ts`.

import { makeDependent, makeDependentGuardianship, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { claimItemGiftImpl } from '@/api/_gifts-impl'
import { createListAddonImpl } from '@/api/_list-addons-impl'
import type { SchemaDatabase } from '@/db'

type Tx = SchemaDatabase

type Outcome = 'ok' | 'cannot-claim-own-list' | 'cannot-add-to-own-list' | 'not-visible'

type Case = {
	name: string
	seed: (tx: Tx) => Promise<{ actorId: string; listId: number }>
	claim: Outcome
	addon: Outcome
}

async function dependentList(tx: Tx, opts: { isPrivate: boolean }) {
	const owner = await makeUser(tx)
	const coGuardian = await makeUser(tx)
	const dep = await makeDependent(tx, { createdByUserId: owner.id })
	await makeDependentGuardianship(tx, { guardianUserId: owner.id, dependentId: dep.id })
	await makeDependentGuardianship(tx, { guardianUserId: coGuardian.id, dependentId: dep.id })
	const list = await makeList(tx, { ownerId: owner.id, subjectDependentId: dep.id, isPrivate: opts.isPrivate })
	return { owner, coGuardian, list }
}

const cases: Array<Case> = [
	{
		name: 'guardian who owns a public dependent list',
		seed: async tx => {
			const { owner, list } = await dependentList(tx, { isPrivate: false })
			return { actorId: owner.id, listId: list.id }
		},
		claim: 'ok',
		addon: 'ok',
	},
	{
		name: 'guardian who owns a private dependent list',
		seed: async tx => {
			const { owner, list } = await dependentList(tx, { isPrivate: true })
			return { actorId: owner.id, listId: list.id }
		},
		claim: 'ok',
		addon: 'ok',
	},
	{
		name: 'co-guardian on a private dependent list',
		seed: async tx => {
			const { coGuardian, list } = await dependentList(tx, { isPrivate: true })
			return { actorId: coGuardian.id, listId: list.id }
		},
		claim: 'ok',
		addon: 'ok',
	},
	{
		name: 'unrelated user on a public dependent list',
		seed: async tx => {
			const { list } = await dependentList(tx, { isPrivate: false })
			const stranger = await makeUser(tx)
			return { actorId: stranger.id, listId: list.id }
		},
		claim: 'ok',
		addon: 'ok',
	},
	{
		name: 'unrelated user on a private dependent list',
		seed: async tx => {
			const { list } = await dependentList(tx, { isPrivate: true })
			const stranger = await makeUser(tx)
			return { actorId: stranger.id, listId: list.id }
		},
		claim: 'not-visible',
		addon: 'not-visible',
	},
	{
		name: 'owner of their own regular list',
		seed: async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			return { actorId: owner.id, listId: list.id }
		},
		claim: 'cannot-claim-own-list',
		addon: 'cannot-add-to-own-list',
	},
]

function expectOutcome(result: { kind: 'ok' } | { kind: 'error'; reason: string }, expected: Outcome) {
	if (expected === 'ok') {
		expect(result.kind).toBe('ok')
	} else {
		expect(result).toMatchObject({ kind: 'error', reason: expected })
	}
}

describe('dependent-subject lists: claim and off-list gift parity', () => {
	it.each(cases)('$name: claim=$claim, addon=$addon', async ({ seed, claim, addon }) => {
		await withRollback(async tx => {
			const { actorId, listId } = await seed(tx)
			const item = await makeItem(tx, { listId })

			const claimResult = await claimItemGiftImpl({
				gifterId: actorId,
				input: { itemId: item.id, quantity: 1, totalCost: undefined },
				dbx: tx,
			})
			expectOutcome(claimResult, claim)

			const addonResult = await createListAddonImpl({
				userId: actorId,
				input: { listId, description: 'extra socks', totalCost: undefined },
				dbx: tx,
			})
			expectOutcome(addonResult, addon)
		})
	})
})
