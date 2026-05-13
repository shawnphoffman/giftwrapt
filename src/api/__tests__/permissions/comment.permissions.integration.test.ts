// Item comment permissions matrix.
//
// Surfaces covered:
//   - getCommentsForItemImpl   (canViewListAsAnyone-gated; returns [] on deny)
//   - createItemCommentImpl    (canViewListAsAnyone-gated; comments feature toggle is enabled by default)
//   - updateItemCommentImpl    (author-only; row-ownership gate)
//   - deleteItemCommentImpl    (author OR list owner; the "owner can delete any" path is load-bearing)

import { makeItem, makeItemComment, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { createItemCommentImpl, deleteItemCommentImpl, getCommentsForItemImpl, updateItemCommentImpl } from '@/api/_comments-impl'
import { describeListState } from '@/lib/__tests__/permissions/_matrix-types'

import { commentExpectations } from './_expectations'
import { seedFor } from './_seeds'

const viewCommentsMatrix = commentExpectations.filter(e => e.action === 'view-comments')
const createCommentMatrix = commentExpectations.filter(e => e.action === 'create-comment')

describe('getCommentsForItem x matrix', () => {
	// getCommentsForItemImpl deliberately swallows permission denials into
	// an empty array (the route layer renders "no comments" rather than a
	// 403). To get a positive signal on the allow case, seed a comment from
	// a third party first; the deny case still returns [].
	it.each(viewCommentsMatrix)(
		'role=$role state=$listState.privacy/$listState.active -> $expected',
		async ({ role, listState, expected }) => {
			await withRollback(async tx => {
				const { viewer, owner, list } = await seedFor(role, { tx, listState })
				const item = await makeItem(tx, { listId: list.id })
				await makeItemComment(tx, { itemId: item.id, userId: owner.id, comment: 'seeded' })
				const rows = await getCommentsForItemImpl({ userId: viewer.id, itemId: item.id, dbx: tx })
				if (expected === 'allow') {
					expect(rows.length, `${role} on ${describeListState(listState)} should see the comment`).toBe(1)
				} else {
					expect(rows, `${role} on ${describeListState(listState)} should get []`).toEqual([])
				}
			})
		}
	)
})

describe('createItemComment x matrix', () => {
	it.each(createCommentMatrix)(
		'role=$role state=$listState.privacy/$listState.active -> $expected',
		async ({ role, listState, expected, reasonOnDeny }) => {
			await withRollback(async tx => {
				const { viewer, list } = await seedFor(role, { tx, listState })
				const item = await makeItem(tx, { listId: list.id })
				const result = await createItemCommentImpl({
					userId: viewer.id,
					input: { itemId: item.id, comment: 'hello' },
					dbx: tx,
				})
				if (expected === 'allow') {
					expect(result.kind, `${role} on ${describeListState(listState)} should create-allow`).toBe('ok')
				} else {
					expect(result.kind, `${role} on ${describeListState(listState)} should create-deny`).toBe('error')
					if (result.kind === 'error' && reasonOnDeny) expect(result.reason).toBe(reasonOnDeny)
				}
			})
		}
	)
})

// ---------------------------------------------------------------------------
// Non-matrix invariants
// ---------------------------------------------------------------------------

describe('updateItemComment - author-only', () => {
	it('lets the author update their own comment', async () => {
		await withRollback(async tx => {
			const author = await makeUser(tx)
			const list = await makeList(tx, { ownerId: author.id })
			const item = await makeItem(tx, { listId: list.id })
			const comment = await makeItemComment(tx, { itemId: item.id, userId: author.id })
			const result = await updateItemCommentImpl({
				userId: author.id,
				input: { commentId: comment.id, comment: 'edited' },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
		})
	})

	it("rejects a non-author with 'not-yours' even if they are the list owner", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const commenter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const comment = await makeItemComment(tx, { itemId: item.id, userId: commenter.id })
			const result = await updateItemCommentImpl({
				userId: owner.id,
				input: { commentId: comment.id, comment: 'edited' },
				dbx: tx,
			})
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('not-yours')
		})
	})
})

describe('deleteItemComment - author OR list owner', () => {
	it('lets the author delete their own comment', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const commenter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const comment = await makeItemComment(tx, { itemId: item.id, userId: commenter.id })
			const result = await deleteItemCommentImpl({ userId: commenter.id, input: { commentId: comment.id }, dbx: tx })
			expect(result.kind).toBe('ok')
		})
	})

	it('lets the list owner delete a third-party comment on their list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const commenter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const comment = await makeItemComment(tx, { itemId: item.id, userId: commenter.id })
			const result = await deleteItemCommentImpl({ userId: owner.id, input: { commentId: comment.id }, dbx: tx })
			expect(result.kind).toBe('ok')
		})
	})

	it("rejects an unrelated user with 'not-authorized'", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const commenter = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const comment = await makeItemComment(tx, { itemId: item.id, userId: commenter.id })
			const result = await deleteItemCommentImpl({ userId: stranger.id, input: { commentId: comment.id }, dbx: tx })
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('not-authorized')
		})
	})
})
