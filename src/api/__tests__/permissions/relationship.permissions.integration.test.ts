// User-relationship permissions matrix.
//
// Surfaces covered:
//   - upsertUserRelationshipsImpl     (owner-perspective; sets canView/canEdit)
//   - upsertViewerRelationshipsImpl   (viewer-perspective; can only set accessLevel)
//
// The load-bearing invariants:
//   1. Partners and guardian-paired users cannot be set to 'restricted'
//      from either perspective (the upsert returns 'restricted-not-allowed').
//   2. The viewer-perspective upsert cannot grant itself canEdit (the
//      schema doesn't expose canEdit on the input).
//   3. Setting accessLevel='restricted' forces canEdit=false in the row
//      and removes any pre-existing listEditors row for that pair.

import { makeGuardianship, makeList, makeListEditor, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { upsertUserRelationshipsImpl, upsertViewerRelationshipsImpl } from '@/api/_permissions-impl'
import { listEditors, userRelationships, users } from '@/db/schema'
import { describeListState } from '@/lib/__tests__/permissions/_matrix-types'

import { relationshipExpectations } from './_expectations'
import { seedFor } from './_seeds'

describe('upsertUserRelationships x restricted-not-allowed matrix', () => {
	// One row per role describing whether the owner can set THAT viewer
	// to accessLevel='restricted'. Partners and guardians must reject;
	// everyone else accepts. listState is a sentinel here (the impl
	// doesn't read it) but we still encode it in the row for the
	// duplicate-key validator's benefit.
	it.each(relationshipExpectations)(
		'role=$role state=$listState.privacy/$listState.active -> $expected',
		async ({ role, listState, expected, reasonOnDeny }) => {
			await withRollback(async tx => {
				const { viewer, owner } = await seedFor(role, { tx, listState })
				// The 'owner' role's seeder returns viewer === owner, which
				// would self-upsert. Real callers never reach this path (the
				// route filters self), but the impl writes the row anyway.
				const result = await upsertUserRelationshipsImpl({
					ownerUserId: owner.id,
					input: { relationships: [{ viewerUserId: viewer.id, accessLevel: 'restricted', canEdit: false }] },
					dbx: tx,
				})
				if (expected === 'allow') {
					expect(result.success, `${role} on ${describeListState(listState)} should allow restricted`).toBe(true)
				} else {
					expect(result.success, `${role} on ${describeListState(listState)} should reject restricted`).toBe(false)
					if (!result.success && reasonOnDeny) expect(result.reason).toBe(reasonOnDeny)
				}
			})
		}
	)
})

// ---------------------------------------------------------------------------
// Non-matrix invariants
// ---------------------------------------------------------------------------

describe('upsertUserRelationships - canEdit & listEditors interactions', () => {
	it("forces canEdit=false when storing accessLevel='restricted'", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const result = await upsertUserRelationshipsImpl({
				ownerUserId: owner.id,
				input: { relationships: [{ viewerUserId: viewer.id, accessLevel: 'restricted', canEdit: true }] },
				dbx: tx,
			})
			expect(result.success).toBe(true)
			const row = await tx.query.userRelationships.findFirst({
				where: and(eq(userRelationships.ownerUserId, owner.id), eq(userRelationships.viewerUserId, viewer.id)),
			})
			expect(row?.accessLevel).toBe('restricted')
			expect(row?.canEdit).toBe(false)
		})
	})

	it('removes existing listEditors rows in the same transaction', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await makeListEditor(tx, { listId: list.id, userId: viewer.id, ownerId: owner.id })

			const result = await upsertUserRelationshipsImpl({
				ownerUserId: owner.id,
				input: { relationships: [{ viewerUserId: viewer.id, accessLevel: 'restricted', canEdit: false }] },
				dbx: tx,
			})
			expect(result.success).toBe(true)

			const remaining = await tx
				.select({ id: listEditors.id })
				.from(listEditors)
				.where(and(eq(listEditors.ownerId, owner.id), eq(listEditors.userId, viewer.id)))
			expect(remaining).toHaveLength(0)
		})
	})

	it("preserves canEdit when accessLevel != 'restricted'", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const result = await upsertUserRelationshipsImpl({
				ownerUserId: owner.id,
				input: { relationships: [{ viewerUserId: viewer.id, accessLevel: 'view', canEdit: true }] },
				dbx: tx,
			})
			expect(result.success).toBe(true)
			const row = await tx.query.userRelationships.findFirst({
				where: and(eq(userRelationships.ownerUserId, owner.id), eq(userRelationships.viewerUserId, viewer.id)),
			})
			expect(row?.canEdit).toBe(true)
		})
	})
})

describe('upsertViewerRelationships - same restricted-not-allowed gate', () => {
	it('rejects restricting a partner from the viewer perspective', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			const partner = await makeUser(tx, { partnerId: me.id })
			await tx.update(users).set({ partnerId: partner.id }).where(eq(users.id, me.id))
			const result = await upsertViewerRelationshipsImpl({
				viewerUserId: me.id,
				input: { relationships: [{ ownerUserId: partner.id, accessLevel: 'restricted' }] },
				dbx: tx,
			})
			expect(result.success).toBe(false)
			if (!result.success) expect(result.reason).toBe('restricted-not-allowed')
		})
	})

	it('rejects restricting a guardian-paired user from the viewer perspective', async () => {
		await withRollback(async tx => {
			const child = await makeUser(tx, { role: 'child' })
			const parent = await makeUser(tx)
			await makeGuardianship(tx, { parentUserId: parent.id, childUserId: child.id })

			const result = await upsertViewerRelationshipsImpl({
				viewerUserId: parent.id,
				input: { relationships: [{ ownerUserId: child.id, accessLevel: 'restricted' }] },
				dbx: tx,
			})
			expect(result.success).toBe(false)
		})
	})

	it('does not let the viewer self-grant canEdit (input schema has no canEdit field)', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			const owner = await makeUser(tx)
			const result = await upsertViewerRelationshipsImpl({
				viewerUserId: me.id,
				input: { relationships: [{ ownerUserId: owner.id, accessLevel: 'view' }] },
				dbx: tx,
			})
			expect(result.success).toBe(true)
			const row = await tx.query.userRelationships.findFirst({
				where: and(eq(userRelationships.ownerUserId, owner.id), eq(userRelationships.viewerUserId, me.id)),
			})
			expect(row?.canEdit).toBe(false)
		})
	})
})
