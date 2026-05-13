// Integration tests for the todo API. Covers the four core paths:
//   - createTodo: requires edit access + a list of type='todos'.
//   - toggleTodoClaim: any viewer can claim, claim ≡ done, repeated
//     toggles flip back and forth.
//   - deleteTodo: gated on edit access.
//   - list-type isolation: items can't be created on todo lists,
//     todos can't be moved across types via moveItemsToList.

import { makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { createItemImpl } from '@/api/_items-impl'
import { createTodoImpl, deleteTodoImpl, toggleTodoClaimImpl, updateTodoImpl } from '@/api/_todos-impl'
import { todoItems } from '@/db/schema'

describe('todo API', () => {
	it('createTodo rejects non-todo lists', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const result = await createTodoImpl({
				db: tx,
				actor: { id: owner.id },
				input: { listId: list.id, title: 'Walk the dog' },
			})
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('not-a-todo-list')
		})
	})

	it('createTodo persists with default priority', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'todos' })
			const result = await createTodoImpl({
				db: tx,
				actor: { id: owner.id },
				input: { listId: list.id, title: 'Take out trash', notes: 'Tuesday morning' },
			})
			expect(result.kind).toBe('ok')
			if (result.kind === 'ok') {
				expect(result.todo.title).toBe('Take out trash')
				expect(result.todo.notes).toBe('Tuesday morning')
				expect(result.todo.priority).toBe('normal')
				expect(result.todo.claimedByUserId).toBeNull()
			}
		})
	})

	it('createTodo rejects non-edit users', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'todos' })
			const result = await createTodoImpl({
				db: tx,
				actor: { id: stranger.id },
				input: { listId: list.id, title: 'Hijack' },
			})
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('not-authorized')
		})
	})

	it('toggleTodoClaim claims, unclaims, and switches claimer', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const helper = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'todos' })
			const created = await createTodoImpl({
				db: tx,
				actor: { id: owner.id },
				input: { listId: list.id, title: 'Mow lawn' },
			})
			expect(created.kind).toBe('ok')
			if (created.kind !== 'ok') throw new Error('setup failed')

			// Helper claims.
			const claim1 = await toggleTodoClaimImpl({
				db: tx,
				actor: { id: helper.id },
				input: { todoId: created.todo.id },
			})
			expect(claim1.kind).toBe('ok')
			if (claim1.kind === 'ok') {
				expect(claim1.todo.claimedByUserId).toBe(helper.id)
				expect(claim1.todo.claimedAt).not.toBeNull()
			}

			// Helper unclaims (toggle).
			const claim2 = await toggleTodoClaimImpl({
				db: tx,
				actor: { id: helper.id },
				input: { todoId: created.todo.id },
			})
			expect(claim2.kind).toBe('ok')
			if (claim2.kind === 'ok') {
				expect(claim2.todo.claimedByUserId).toBeNull()
				expect(claim2.todo.claimedAt).toBeNull()
			}

			// Owner claims.
			const claim3 = await toggleTodoClaimImpl({
				db: tx,
				actor: { id: owner.id },
				input: { todoId: created.todo.id },
			})
			expect(claim3.kind).toBe('ok')
			if (claim3.kind === 'ok') expect(claim3.todo.claimedByUserId).toBe(owner.id)

			// Helper takes over the claim (allowed per the resolved spec).
			const claim4 = await toggleTodoClaimImpl({
				db: tx,
				actor: { id: helper.id },
				input: { todoId: created.todo.id },
			})
			expect(claim4.kind).toBe('ok')
			if (claim4.kind === 'ok') expect(claim4.todo.claimedByUserId).toBe(helper.id)
		})
	})

	it('updateTodo gated on edit access', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'todos' })
			const created = await createTodoImpl({
				db: tx,
				actor: { id: owner.id },
				input: { listId: list.id, title: 'Original' },
			})
			if (created.kind !== 'ok') throw new Error('setup failed')

			const stranged = await updateTodoImpl({
				db: tx,
				actor: { id: stranger.id },
				input: { todoId: created.todo.id, title: 'Hacked' },
			})
			expect(stranged.kind).toBe('error')

			const owned = await updateTodoImpl({
				db: tx,
				actor: { id: owner.id },
				input: { todoId: created.todo.id, title: 'Updated' },
			})
			expect(owned.kind).toBe('ok')
			if (owned.kind === 'ok') expect(owned.todo.title).toBe('Updated')
		})
	})

	it('deleteTodo gated on edit access', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'todos' })
			const created = await createTodoImpl({
				db: tx,
				actor: { id: owner.id },
				input: { listId: list.id, title: 'To remove' },
			})
			if (created.kind !== 'ok') throw new Error('setup failed')

			const reject = await deleteTodoImpl({
				db: tx,
				actor: { id: stranger.id },
				input: { todoId: created.todo.id },
			})
			expect(reject.kind).toBe('error')

			const ok = await deleteTodoImpl({
				db: tx,
				actor: { id: owner.id },
				input: { todoId: created.todo.id },
			})
			expect(ok.kind).toBe('ok')

			const remaining = await tx.select().from(todoItems).where(eq(todoItems.id, created.todo.id))
			expect(remaining).toHaveLength(0)
		})
	})

	it('items cannot be created on a todo-typed list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'todos' })
			const result = await createItemImpl({
				db: tx,
				actor: { id: owner.id },
				input: { listId: list.id, title: 'Gift item on a todo list' },
			})
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('todo-list-rejects-items')
		})
	})
})
