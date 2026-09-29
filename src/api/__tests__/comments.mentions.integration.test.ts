// @mentions in item comments: token sanitizing on write, name refresh on
// read, the typeahead audience, and who gets the notification email.
//
// `@/lib/resend` is mocked at the module boundary so the impls run end to
// end against the seeded DB; assertions read the recipients and the
// `mentioned` flag off the mock calls.

import { makeGuardianship, makeItem, makeItemComment, makeList, makeUser, makeUserRelationship } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createItemCommentImpl, getCommentsForItemImpl, getMentionableUsersForItemImpl, updateItemCommentImpl } from '@/api/_comments-impl'
import type { SchemaDatabase } from '@/db'
import { appSettings, itemComments, users } from '@/db/schema'
import { formatMentionToken } from '@/lib/comment-mentions'

vi.mock('@/lib/resend', () => ({
	sendNewCommentEmail: vi.fn(() => Promise.resolve(null)),
}))

const { sendNewCommentEmail } = await import('@/lib/resend')

async function enableCommentEmails(tx: SchemaDatabase, enabled = true) {
	await tx
		.insert(appSettings)
		.values({ key: 'enableCommentEmails', value: enabled })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: enabled } })
}

const mention = (u: { id: string; name: string | null }) => formatMentionToken({ userId: u.id, name: u.name ?? 'x' })

// [recipient email, mentioned flag] per send, sorted for stable asserts.
function sends(): Array<[string, boolean]> {
	return vi
		.mocked(sendNewCommentEmail)
		.mock.calls.map(c => [c[1], Boolean(c[7]?.mentioned)] as [string, boolean])
		.sort((a, b) => a[0].localeCompare(b[0]))
}

beforeEach(() => {
	vi.mocked(sendNewCommentEmail).mockClear()
})

describe('createItemComment - mention sanitizing', () => {
	it('keeps mentions of people who can see the list, refreshed to their current name', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const friend = await makeUser(tx, { name: 'Friend Now' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })

			const result = await createItemCommentImpl({
				userId: author.id,
				input: { itemId: item.id, comment: `hey @[Stale Name](${friend.id})` },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
			if (result.kind === 'ok') expect(result.comment.comment).toBe(`hey @[Friend Now](${friend.id})`)
		})
	})

	it('demotes mentions of users who cannot see the list, unknown ids, and banned users to plain text', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const denied = await makeUser(tx, { name: 'Denied' })
			const banned = await makeUser(tx, { name: 'Banned', banned: true })
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: denied.id, accessLevel: 'none' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })

			const result = await createItemCommentImpl({
				userId: author.id,
				input: { itemId: item.id, comment: `${mention(denied)} ${mention(banned)} @[Ghost](nope)` },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
			if (result.kind === 'ok') expect(result.comment.comment).toBe('@Denied @Banned @Ghost')
		})
	})

	it('refuses mentions on a private list except for people who can see it', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const outsider = await makeUser(tx, { name: 'Outsider' })
			const list = await makeList(tx, { ownerId: owner.id, isPrivate: true })
			const item = await makeItem(tx, { listId: list.id })

			// Only the owner can see a private list; they can't mention an outsider into it.
			const result = await createItemCommentImpl({
				userId: owner.id,
				input: { itemId: item.id, comment: `fyi ${mention(outsider)}` },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
			if (result.kind === 'ok') expect(result.comment.comment).toBe('fyi @Outsider')
		})
	})
})

describe('createItemComment - notification emails', () => {
	it('sends nothing when enableCommentEmails is off, even with mentions', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const friend = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })

			await createItemCommentImpl({ userId: author.id, input: { itemId: item.id, comment: `hi ${mention(friend)}` }, dbx: tx })
			expect(sendNewCommentEmail).not.toHaveBeenCalled()
		})
	})

	it('emails the owner (owner wording) and each mentioned user (mention wording)', async () => {
		await withRollback(async tx => {
			await enableCommentEmails(tx)
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const friend = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })

			await createItemCommentImpl({ userId: author.id, input: { itemId: item.id, comment: `hi ${mention(friend)}` }, dbx: tx })

			expect(sends()).toEqual(
				[
					[owner.email, false],
					[friend.email, true],
				].sort((a, b) => (a[0] as string).localeCompare(b[0] as string))
			)
		})
	})

	it('sends the comment body with mentions flattened to plain @Name', async () => {
		await withRollback(async tx => {
			await enableCommentEmails(tx)
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const friend = await makeUser(tx, { name: 'Pat' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })

			await createItemCommentImpl({ userId: author.id, input: { itemId: item.id, comment: `ask ${mention(friend)}` }, dbx: tx })
			for (const call of vi.mocked(sendNewCommentEmail).mock.calls) expect(call[3]).toBe('ask @Pat')
		})
	})

	it('notifies mentioned users when the owner comments on their own list, but not the owner', async () => {
		await withRollback(async tx => {
			await enableCommentEmails(tx)
			const owner = await makeUser(tx)
			const friend = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })

			await createItemCommentImpl({ userId: owner.id, input: { itemId: item.id, comment: `${mention(friend)} what size?` }, dbx: tx })
			expect(sends()).toEqual([[friend.email, true]])
		})
	})

	it("does not email the owner's guardians about the owner's own comment", async () => {
		await withRollback(async tx => {
			await enableCommentEmails(tx)
			const child = await makeUser(tx, { role: 'child' })
			const parent = await makeUser(tx)
			await makeGuardianship(tx, { parentUserId: parent.id, childUserId: child.id })
			const list = await makeList(tx, { ownerId: child.id })
			const item = await makeItem(tx, { listId: list.id })

			await createItemCommentImpl({ userId: child.id, input: { itemId: item.id, comment: 'my own note' }, dbx: tx })
			expect(sendNewCommentEmail).not.toHaveBeenCalled()
		})
	})

	it('sends one email to an owner who is also mentioned, using the mention wording', async () => {
		await withRollback(async tx => {
			await enableCommentEmails(tx)
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })

			await createItemCommentImpl({
				userId: author.id,
				input: { itemId: item.id, comment: `${mention(owner)} ${mention(owner)} is this right?` },
				dbx: tx,
			})
			expect(sends()).toEqual([[owner.email, true]])
		})
	})

	it('never emails the commenter, even when they mention themselves', async () => {
		await withRollback(async tx => {
			await enableCommentEmails(tx)
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })

			await createItemCommentImpl({ userId: author.id, input: { itemId: item.id, comment: `note to ${mention(author)}` }, dbx: tx })
			expect(sends()).toEqual([[owner.email, false]])
		})
	})

	it("fans a child's mention out to their guardians who can see the list", async () => {
		await withRollback(async tx => {
			await enableCommentEmails(tx)
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const child = await makeUser(tx, { role: 'child' })
			const parentA = await makeUser(tx)
			const parentB = await makeUser(tx)
			await makeGuardianship(tx, { parentUserId: parentA.id, childUserId: child.id })
			await makeGuardianship(tx, { parentUserId: parentB.id, childUserId: child.id })
			// parentB has been denied on this owner's lists: the mention must
			// not leak the comment to them.
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: parentB.id, accessLevel: 'none' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })

			await createItemCommentImpl({ userId: author.id, input: { itemId: item.id, comment: `${mention(child)} ideas?` }, dbx: tx })

			const got = sends()
			expect(got).toContainEqual([child.email, true])
			expect(got).toContainEqual([parentA.email, true])
			expect(got.map(([e]) => e)).not.toContain(parentB.email)
			// Guardian copies greet the mentioned child by name, like the
			// existing owner-guardian fan-out greets the owner.
			const parentCall = vi.mocked(sendNewCommentEmail).mock.calls.find(c => c[1] === parentA.email)!
			expect(parentCall[0]).toBe(child.name)
		})
	})

	it('does not email a mentioned user who cannot see the list', async () => {
		await withRollback(async tx => {
			await enableCommentEmails(tx)
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const denied = await makeUser(tx)
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: denied.id, accessLevel: 'none' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })

			await createItemCommentImpl({ userId: author.id, input: { itemId: item.id, comment: `${mention(denied)} hi` }, dbx: tx })
			expect(sends()).toEqual([[owner.email, false]])
		})
	})
})

describe('updateItemComment - mentions', () => {
	it('emails only people newly mentioned by the edit, never the owner', async () => {
		await withRollback(async tx => {
			await enableCommentEmails(tx)
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const first = await makeUser(tx)
			const second = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const comment = await makeItemComment(tx, { itemId: item.id, userId: author.id, comment: `hi ${mention(first)}` })

			const result = await updateItemCommentImpl({
				userId: author.id,
				input: { commentId: comment.id, comment: `hi ${mention(first)} and ${mention(second)}` },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
			expect(sends()).toEqual([[second.email, true]])
		})
	})

	it('sanitizes mentions on edit the same way as on create', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const denied = await makeUser(tx, { name: 'Denied' })
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: denied.id, accessLevel: 'none' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const comment = await makeItemComment(tx, { itemId: item.id, userId: author.id, comment: 'hi' })

			await updateItemCommentImpl({ userId: author.id, input: { commentId: comment.id, comment: `hi ${mention(denied)}` }, dbx: tx })
			const [row] = await tx.select().from(itemComments).where(eq(itemComments.id, comment.id))
			expect(row.comment).toBe('hi @Denied')
		})
	})

	it('still saves an edit after the author loses access, with every mention demoted and no email', async () => {
		await withRollback(async tx => {
			await enableCommentEmails(tx)
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const friend = await makeUser(tx, { name: 'Friend' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const comment = await makeItemComment(tx, { itemId: item.id, userId: author.id, comment: 'hi' })
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: author.id, accessLevel: 'none' })

			const result = await updateItemCommentImpl({
				userId: author.id,
				input: { commentId: comment.id, comment: `hi ${mention(friend)}` },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
			const [row] = await tx.select().from(itemComments).where(eq(itemComments.id, comment.id))
			expect(row.comment).toBe('hi @Friend')
			expect(sendNewCommentEmail).not.toHaveBeenCalled()
		})
	})
})

describe('getCommentsForItem - mention names', () => {
	it("refreshes mention tokens to the user's current name", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const friend = await makeUser(tx, { name: 'Before' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			await makeItemComment(tx, { itemId: item.id, userId: owner.id, comment: `hi ${mention(friend)}` })
			await tx.update(users).set({ name: 'After' }).where(eq(users.id, friend.id))

			const rows = await getCommentsForItemImpl({ userId: owner.id, itemId: item.id, dbx: tx })
			expect(rows[0].comment).toBe(`hi @[After](${friend.id})`)
		})
	})
})

describe('getMentionableUsersForItem', () => {
	it('lists everyone who can see the list except the viewer, banned users, and denied users', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const viewer = await makeUser(tx, { name: 'Viewer' })
			const other = await makeUser(tx, { name: 'Other' })
			const denied = await makeUser(tx, { name: 'Denied' })
			const banned = await makeUser(tx, { name: 'Banned', banned: true })
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: denied.id, accessLevel: 'none' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })

			const people = await getMentionableUsersForItemImpl({ userId: viewer.id, itemId: item.id, dbx: tx })
			const ids = people.map(p => p.id)
			expect(ids).toContain(owner.id)
			expect(ids).toContain(other.id)
			expect(ids).not.toContain(viewer.id)
			expect(ids).not.toContain(denied.id)
			expect(ids).not.toContain(banned.id)
		})
	})

	it('sorts the owner and conversation participants first', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Zed Owner' })
			const viewer = await makeUser(tx, { name: 'Viewer' })
			const participant = await makeUser(tx, { name: 'Yolanda' })
			await makeUser(tx, { name: 'Aaron' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			await makeItemComment(tx, { itemId: item.id, userId: participant.id })

			const people = await getMentionableUsersForItemImpl({ userId: viewer.id, itemId: item.id, dbx: tx })
			expect(new Set(people.slice(0, 2).map(p => p.id))).toEqual(new Set([owner.id, participant.id]))
		})
	})

	it('returns [] to a viewer who cannot see the list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const outsider = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, isPrivate: true })
			const item = await makeItem(tx, { listId: list.id })

			expect(await getMentionableUsersForItemImpl({ userId: outsider.id, itemId: item.id, dbx: tx })).toEqual([])
		})
	})
})
