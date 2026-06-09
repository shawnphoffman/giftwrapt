// Integration coverage for the reveal-timing server-fn impls: force-reveal,
// set/extend defer, cancel defer. Drives the impls with a transactional db
// and an injected `now` so the open-cycle window math is deterministic.

import { makeGiftedItem, makeItem, makeList, makeListAddon, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { cancelArchiveDeferImpl, forceArchiveListImpl, setArchiveDeferImpl } from '@/api/_archive-defer-impl'
import { items, lists } from '@/db/schema'

// Owner born March 1; "now" March 8 sits in the post-event, pre-reveal gap
// (default archive = March 1 + 14 = March 15).
const MARCH_8 = new Date('2026-03-08T12:00:00Z')
const FEB_20 = new Date('2026-02-20T12:00:00Z')

describe('forceArchiveListImpl', () => {
	it('reveals claimed items + addons and stamps lastArchivedAt in the gap', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const claimed = await makeItem(tx, { listId: list.id })
			const addon = await makeListAddon(tx, { listId: list.id, userId: gifter.id })
			await makeGiftedItem(tx, { itemId: claimed.id, gifterId: gifter.id })

			const res = await forceArchiveListImpl({ userId: owner.id, input: { listId: list.id }, dbx: tx, now: MARCH_8 })
			expect(res).toMatchObject({ kind: 'ok', updated: 1, addonsArchived: 1 })

			const [itemRow] = await tx.select({ isArchived: items.isArchived }).from(items).where(eq(items.id, claimed.id))
			expect(itemRow.isArchived).toBe(true)
			const [listRow] = await tx.select({ last: lists.lastArchivedAt }).from(lists).where(eq(lists.id, list.id))
			expect(listRow.last).not.toBeNull()
			void addon
		})
	})

	it('rejects before the event has passed', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const res = await forceArchiveListImpl({ userId: owner.id, input: { listId: list.id }, dbx: tx, now: FEB_20 })
			expect(res).toEqual({ kind: 'error', reason: 'too-early' })
		})
	})

	it('rejects while a defer is active (must cancel first)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday', archiveDeferUntil: new Date('2026-03-20T12:00:00Z') })
			const res = await forceArchiveListImpl({ userId: owner.id, input: { listId: list.id }, dbx: tx, now: MARCH_8 })
			expect(res).toEqual({ kind: 'error', reason: 'deferred' })
		})
	})

	it('rejects a non-editor', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const res = await forceArchiveListImpl({ userId: stranger.id, input: { listId: list.id }, dbx: tx, now: MARCH_8 })
			expect(res).toEqual({ kind: 'error', reason: 'not-authorized' })
		})
	})
})

describe('setArchiveDeferImpl', () => {
	it('sets a valid future defer (after default, within cap)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const target = new Date('2026-04-01T12:00:00Z') // after default Mar 15, before cap May 30
			const res = await setArchiveDeferImpl({ userId: owner.id, input: { listId: list.id, deferUntil: target }, dbx: tx, now: MARCH_8 })
			expect(res.kind).toBe('ok')
			const [row] = await tx.select({ defer: lists.archiveDeferUntil }).from(lists).where(eq(lists.id, list.id))
			expect(row.defer?.toISOString()).toBe(target.toISOString())
		})
	})

	it('rejects a target on or before the current effective reveal date', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const res = await setArchiveDeferImpl({
				userId: owner.id,
				input: { listId: list.id, deferUntil: new Date('2026-03-10T12:00:00Z') },
				dbx: tx,
				now: MARCH_8,
			})
			expect(res).toEqual({ kind: 'error', reason: 'must-be-later' })
		})
	})

	it('rejects a target beyond event + maxArchiveDeferDays', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const res = await setArchiveDeferImpl({
				userId: owner.id,
				input: { listId: list.id, deferUntil: new Date('2026-08-01T12:00:00Z') },
				dbx: tx,
				now: MARCH_8,
			})
			expect(res).toEqual({ kind: 'error', reason: 'exceeds-max' })
		})
	})

	it('rejects before the event has passed', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const res = await setArchiveDeferImpl({
				userId: owner.id,
				input: { listId: list.id, deferUntil: new Date('2026-04-01T12:00:00Z') },
				dbx: tx,
				now: FEB_20,
			})
			expect(res).toEqual({ kind: 'error', reason: 'too-early' })
		})
	})

	it('allows re-extending past an already-active defer', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday', archiveDeferUntil: new Date('2026-03-25T12:00:00Z') })
			// New target must be after the current defer (Mar 25), within cap.
			const target = new Date('2026-04-10T12:00:00Z')
			const ok = await setArchiveDeferImpl({ userId: owner.id, input: { listId: list.id, deferUntil: target }, dbx: tx, now: MARCH_8 })
			expect(ok.kind).toBe('ok')
			// A target between the event and the current defer is rejected.
			const tooSoon = await setArchiveDeferImpl({
				userId: owner.id,
				input: { listId: list.id, deferUntil: new Date('2026-03-30T12:00:00Z') },
				dbx: tx,
				now: MARCH_8,
			})
			expect(tooSoon).toEqual({ kind: 'error', reason: 'must-be-later' })
		})
	})
})

describe('cancelArchiveDeferImpl', () => {
	it('clears an active defer', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday', archiveDeferUntil: new Date('2026-03-25T12:00:00Z') })
			const res = await cancelArchiveDeferImpl({ userId: owner.id, input: { listId: list.id }, dbx: tx, now: MARCH_8 })
			expect(res).toEqual({ kind: 'ok' })
			const [row] = await tx.select({ defer: lists.archiveDeferUntil }).from(lists).where(eq(lists.id, list.id))
			expect(row.defer).toBeNull()
		})
	})

	it('rejects a non-editor', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday', archiveDeferUntil: new Date('2026-03-25T12:00:00Z') })
			const res = await cancelArchiveDeferImpl({ userId: stranger.id, input: { listId: list.id }, dbx: tx, now: MARCH_8 })
			expect(res).toEqual({ kind: 'error', reason: 'not-authorized' })
		})
	})
})
