import { makeList, makeUser } from '@test/integration/factories'
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { createListImpl, updateListImpl } from '@/api/_lists-impl'
import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import { appSettings, lists } from '@/db/schema'

// createListImpl / updateListImpl read the module-level `db` singleton
// (mocked to the per-worker pglite instance by the integration setup), so
// the shared withRollback(tx) harness cannot be used here: pglite holds an
// exclusive lock while a `db.transaction` is open, and the impl's own
// singleton queries would deadlock against it. Instead, open a plain
// BEGIN on the singleton session and always ROLLBACK, which keeps each
// test isolated while letting the impls query through the same session.
async function withGlobalRollback(fn: (tx: SchemaDatabase) => Promise<void>): Promise<void> {
	await db.execute(sql`begin`)
	try {
		await fn(db as unknown as SchemaDatabase)
	} finally {
		await db.execute(sql`rollback`)
	}
}

async function setAppSetting(tx: SchemaDatabase, key: string, value: unknown) {
	await tx.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } })
}

describe('createListImpl', () => {
	it('rejects a child creating a giftideas list', async () => {
		await withGlobalRollback(async tx => {
			const child = await makeUser(tx, { role: 'child' })

			const result = await createListImpl({
				actor: { id: child.id, isChild: true },
				input: { name: 'Ideas', type: 'giftideas', isPrivate: true },
			})

			expect(result).toEqual({ kind: 'error', reason: 'child-cannot-create-gift-ideas' })
			expect(await tx.select().from(lists).where(eq(lists.ownerId, child.id))).toHaveLength(0)
		})
	})

	it('allows a non-child to create a giftideas list, forcing it private and keeping the target', async () => {
		await withGlobalRollback(async tx => {
			const owner = await makeUser(tx)
			const target = await makeUser(tx)

			const result = await createListImpl({
				actor: { id: owner.id, isChild: false },
				// Caller explicitly asks for a public list; the server must
				// force-private anyway (spoiler protection).
				input: { name: 'Ideas', type: 'giftideas', isPrivate: false, giftIdeasTargetUserId: target.id },
			})

			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			const [row] = await tx.select().from(lists).where(eq(lists.id, result.list.id))
			expect(row.type).toBe('giftideas')
			expect(row.isPrivate).toBe(true)
			expect(row.giftIdeasTargetUserId).toBe(target.id)
		})
	})

	it('nulls giftIdeasTargetUserId when creating a non-giftideas list', async () => {
		await withGlobalRollback(async tx => {
			const owner = await makeUser(tx)
			const target = await makeUser(tx)

			const result = await createListImpl({
				actor: { id: owner.id, isChild: false },
				input: { name: 'Wishes', type: 'wishlist', isPrivate: false, giftIdeasTargetUserId: target.id },
			})

			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			const [row] = await tx.select().from(lists).where(eq(lists.id, result.list.id))
			expect(row.giftIdeasTargetUserId).toBeNull()
		})
	})

	it('rejects a christmas create when enableChristmasLists is off', async () => {
		await withGlobalRollback(async tx => {
			const owner = await makeUser(tx)
			await setAppSetting(tx, 'enableChristmasLists', false)

			const result = await createListImpl({
				actor: { id: owner.id, isChild: false },
				input: { name: 'Christmas', type: 'christmas', isPrivate: false },
			})

			expect(result).toEqual({ kind: 'error', reason: 'list-type-disabled' })
		})
	})

	it('rejects a birthday create when enableBirthdayLists is off', async () => {
		await withGlobalRollback(async tx => {
			const owner = await makeUser(tx)
			await setAppSetting(tx, 'enableBirthdayLists', false)

			const result = await createListImpl({
				actor: { id: owner.id, isChild: false },
				input: { name: 'Birthday', type: 'birthday', isPrivate: false },
			})

			expect(result).toEqual({ kind: 'error', reason: 'list-type-disabled' })
		})
	})

	it('rejects a holiday create when enableGenericHolidayLists is off', async () => {
		await withGlobalRollback(async tx => {
			const owner = await makeUser(tx)
			await setAppSetting(tx, 'enableGenericHolidayLists', false)

			const result = await createListImpl({
				actor: { id: owner.id, isChild: false },
				input: { name: 'Holiday', type: 'holiday', isPrivate: false },
			})

			expect(result).toEqual({ kind: 'error', reason: 'list-type-disabled' })
		})
	})

	it('rejects a todos create when enableTodoLists is off (the deployment default)', async () => {
		await withGlobalRollback(async tx => {
			const owner = await makeUser(tx)

			const result = await createListImpl({
				actor: { id: owner.id, isChild: false },
				input: { name: 'Chores', type: 'todos', isPrivate: false },
			})

			expect(result).toEqual({ kind: 'error', reason: 'list-type-disabled' })
		})
	})

	it('allows a todos create when enableTodoLists is on', async () => {
		await withGlobalRollback(async tx => {
			const owner = await makeUser(tx)
			await setAppSetting(tx, 'enableTodoLists', true)

			const result = await createListImpl({
				actor: { id: owner.id, isChild: false },
				input: { name: 'Chores', type: 'todos', isPrivate: false },
			})

			expect(result.kind).toBe('ok')
		})
	})

	it('creates a christmas list under default settings', async () => {
		await withGlobalRollback(async tx => {
			const owner = await makeUser(tx)

			const result = await createListImpl({
				actor: { id: owner.id, isChild: false },
				input: { name: 'Christmas', type: 'christmas', isPrivate: false },
			})

			expect(result.kind).toBe('ok')
		})
	})
})

describe('updateListImpl', () => {
	it('rejects a child changing a list type to giftideas', async () => {
		await withGlobalRollback(async tx => {
			const child = await makeUser(tx, { role: 'child' })
			const list = await makeList(tx, { ownerId: child.id, type: 'wishlist' })

			const result = await updateListImpl({
				actor: { id: child.id, isChild: true },
				input: { listId: list.id, type: 'giftideas' },
			})

			expect(result).toEqual({ kind: 'error', reason: 'child-cannot-create-gift-ideas' })
			const [row] = await tx.select().from(lists).where(eq(lists.id, list.id))
			expect(row.type).toBe('wishlist')
		})
	})

	it('allows a non-child to change a list type to giftideas, forcing it private', async () => {
		await withGlobalRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'wishlist', isPrivate: false })

			const result = await updateListImpl({
				actor: { id: owner.id, isChild: false },
				// isPrivate: false is explicitly requested and must lose to the
				// giftideas force-private rule.
				input: { listId: list.id, type: 'giftideas', isPrivate: false },
			})

			expect(result).toEqual({ kind: 'ok' })
			const [row] = await tx.select().from(lists).where(eq(lists.id, list.id))
			expect(row.type).toBe('giftideas')
			expect(row.isPrivate).toBe(true)
		})
	})

	it('preserves giftIdeasTargetUserId when updating a giftideas list without a type change', async () => {
		await withGlobalRollback(async tx => {
			const owner = await makeUser(tx)
			const target = await makeUser(tx)
			const list = await makeList(tx, {
				ownerId: owner.id,
				type: 'giftideas',
				isPrivate: true,
				giftIdeasTargetUserId: target.id,
			})

			const result = await updateListImpl({
				actor: { id: owner.id, isChild: false },
				input: { listId: list.id, name: 'Renamed ideas' },
			})

			expect(result).toEqual({ kind: 'ok' })
			const [row] = await tx.select().from(lists).where(eq(lists.id, list.id))
			expect(row.name).toBe('Renamed ideas')
			expect(row.giftIdeasTargetUserId).toBe(target.id)
		})
	})

	it('nulls giftIdeasTargetUserId when the type changes away from giftideas', async () => {
		await withGlobalRollback(async tx => {
			const owner = await makeUser(tx)
			const target = await makeUser(tx)
			const list = await makeList(tx, {
				ownerId: owner.id,
				type: 'giftideas',
				isPrivate: true,
				giftIdeasTargetUserId: target.id,
			})

			const result = await updateListImpl({
				actor: { id: owner.id, isChild: false },
				input: { listId: list.id, type: 'wishlist' },
			})

			expect(result).toEqual({ kind: 'ok' })
			const [row] = await tx.select().from(lists).where(eq(lists.id, list.id))
			expect(row.type).toBe('wishlist')
			expect(row.giftIdeasTargetUserId).toBeNull()
			expect(row.giftIdeasTargetDependentId).toBeNull()
		})
	})

	// Documents actual behavior: the force-private branch only fires when
	// the payload carries `type: 'giftideas'`. An isPrivate-only update on
	// an existing giftideas list is applied as-is, which diverges from
	// docs/logic.md ("On create or update, isPrivate is forced to true
	// whenever type === 'giftideas'"). Reported upstream; do not "fix" this
	// test without deciding the intended behavior first.
	// Regression: the force-private branch used to key on the payload's
	// `type` rather than the resulting type, so an update that omitted
	// `type` could publish a gift-ideas list.
	it('ignores isPrivate: false on an existing giftideas list when no type is passed', async () => {
		await withGlobalRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'giftideas', isPrivate: true })

			const result = await updateListImpl({
				actor: { id: owner.id, isChild: false },
				input: { listId: list.id, isPrivate: false },
			})

			expect(result).toEqual({ kind: 'ok' })
			const [row] = await tx.select().from(lists).where(eq(lists.id, list.id))
			expect(row.isPrivate).toBe(true)
		})
	})

	it('rejects converting a todos list to a wishlist', async () => {
		await withGlobalRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'todos' })

			const result = await updateListImpl({
				actor: { id: owner.id, isChild: false },
				input: { listId: list.id, type: 'wishlist' },
			})

			expect(result).toEqual({ kind: 'error', reason: 'todo-list-type-locked' })
			const [row] = await tx.select().from(lists).where(eq(lists.id, list.id))
			expect(row.type).toBe('todos')
		})
	})

	it('rejects converting a wishlist to a todos list', async () => {
		await withGlobalRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })

			const result = await updateListImpl({
				actor: { id: owner.id, isChild: false },
				input: { listId: list.id, type: 'todos' },
			})

			expect(result).toEqual({ kind: 'error', reason: 'todo-list-type-locked' })
			const [row] = await tx.select().from(lists).where(eq(lists.id, list.id))
			expect(row.type).toBe('wishlist')
		})
	})

	it('rejects a type change to a disabled type', async () => {
		await withGlobalRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			await setAppSetting(tx, 'enableChristmasLists', false)

			const result = await updateListImpl({
				actor: { id: owner.id, isChild: false },
				input: { listId: list.id, type: 'christmas' },
			})

			expect(result).toEqual({ kind: 'error', reason: 'list-type-disabled' })
			const [row] = await tx.select().from(lists).where(eq(lists.id, list.id))
			expect(row.type).toBe('wishlist')
		})
	})

	it('still allows editing an existing list of a now-disabled type when type is unchanged', async () => {
		await withGlobalRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'christmas' })
			await setAppSetting(tx, 'enableChristmasLists', false)

			const result = await updateListImpl({
				actor: { id: owner.id, isChild: false },
				input: { listId: list.id, name: 'Still my christmas list' },
			})

			expect(result).toEqual({ kind: 'ok' })
			const [row] = await tx.select().from(lists).where(eq(lists.id, list.id))
			expect(row.name).toBe('Still my christmas list')
			expect(row.type).toBe('christmas')
		})
	})

	it('treats passing the current (disabled) type explicitly as no change', async () => {
		await withGlobalRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'christmas' })
			await setAppSetting(tx, 'enableChristmasLists', false)

			const result = await updateListImpl({
				actor: { id: owner.id, isChild: false },
				input: { listId: list.id, type: 'christmas', name: 'Renamed' },
			})

			expect(result).toEqual({ kind: 'ok' })
			const [row] = await tx.select().from(lists).where(eq(lists.id, list.id))
			expect(row.name).toBe('Renamed')
		})
	})
})
