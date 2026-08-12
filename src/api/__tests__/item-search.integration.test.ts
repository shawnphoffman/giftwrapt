// Coverage for `searchMyItemsImpl` (the My Lists item-search dialog data
// source). Two contracts:
//
// 1. Scope: items on the signed-in user's own active, non-dependent-subject
//    lists, filtered to the viewer-facing `'visible'` item-visibility mode.
//    Other users' items, archived / pending-deletion items, inactive lists,
//    dependent-subject lists, and todo lists are all excluded.
// 2. Search: per-token matching over title / list name / notes, ranked
//    title-prefix -> title -> list name -> notes, capped at
//    `MAX_ITEM_SEARCH_RESULTS` with the true match count reported alongside.

import { makeDependent, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { searchMyItemsImpl } from '@/api/_item-search-impl'
import { MAX_ITEM_SEARCH_RESULTS, MIN_ITEM_SEARCH_QUERY_LENGTH } from '@/lib/item-search'

// Most scope assertions search for a token every fixture title shares, so the
// filter is a no-op and only the scope predicate decides what comes back.
const ALL = 'zzz'

describe('searchMyItemsImpl', () => {
	describe('scope', () => {
		it('returns matching items on the user’s own active, non-dependent lists with list context', async () => {
			await withRollback(async tx => {
				const me = await makeUser(tx)
				const listA = await makeList(tx, { ownerId: me.id, name: 'Books', type: 'wishlist', isPrivate: false })
				const listB = await makeList(tx, { ownerId: me.id, name: 'Secret Ideas', type: 'giftideas', isPrivate: true })
				await makeItem(tx, { listId: listA.id, title: 'Dune zzz', price: '$19.99', currency: 'USD', notes: 'sci-fi' })
				await makeItem(tx, { listId: listB.id, title: 'Headphones zzz' })

				const result = await searchMyItemsImpl({ userId: me.id, query: ALL }, tx)

				expect(result.kind).toBe('ok')
				if (result.kind !== 'ok') return
				expect(result.items).toHaveLength(2)
				expect(result.totalMatches).toBe(2)
				expect(result.hasAnyItems).toBe(true)
				expect(result.items.find(i => i.title === 'Dune zzz')).toMatchObject({
					listId: listA.id,
					listName: 'Books',
					listType: 'wishlist',
					listIsPrivate: false,
					price: '$19.99',
					currency: 'USD',
					notes: 'sci-fi',
				})
				// Same rank, so the list-name / title tiebreak decides: "Books" first.
				expect(result.items.map(i => i.title)).toEqual(['Dune zzz', 'Headphones zzz'])
			})
		})

		it('excludes items on other users’ lists', async () => {
			await withRollback(async tx => {
				const me = await makeUser(tx)
				const other = await makeUser(tx)
				const mine = await makeList(tx, { ownerId: me.id })
				const theirs = await makeList(tx, { ownerId: other.id })
				await makeItem(tx, { listId: mine.id, title: 'Mine zzz' })
				await makeItem(tx, { listId: theirs.id, title: 'Theirs zzz' })

				const result = await searchMyItemsImpl({ userId: me.id, query: ALL }, tx)

				expect(result.kind === 'ok' && result.items.map(i => i.title)).toEqual(['Mine zzz'])
			})
		})

		it('excludes archived and pending-deletion items (visible mode)', async () => {
			await withRollback(async tx => {
				const me = await makeUser(tx)
				const list = await makeList(tx, { ownerId: me.id })
				await makeItem(tx, { listId: list.id, title: 'Active zzz' })
				await makeItem(tx, { listId: list.id, title: 'Revealed zzz', isArchived: true })
				await makeItem(tx, { listId: list.id, title: 'Orphaned zzz', pendingDeletionAt: new Date() })

				const result = await searchMyItemsImpl({ userId: me.id, query: ALL }, tx)

				expect(result.kind === 'ok' && result.items.map(i => i.title)).toEqual(['Active zzz'])
			})
		})

		it('excludes items on inactive (archived) lists', async () => {
			await withRollback(async tx => {
				const me = await makeUser(tx)
				const active = await makeList(tx, { ownerId: me.id, name: 'Active list' })
				const inactive = await makeList(tx, { ownerId: me.id, name: 'Archived list', isActive: false })
				await makeItem(tx, { listId: active.id, title: 'Keeps zzz' })
				await makeItem(tx, { listId: inactive.id, title: 'Hidden zzz' })

				const result = await searchMyItemsImpl({ userId: me.id, query: ALL }, tx)

				expect(result.kind === 'ok' && result.items.map(i => i.title)).toEqual(['Keeps zzz'])
			})
		})

		it('excludes items on dependent-subject lists (those belong to the dependents section)', async () => {
			await withRollback(async tx => {
				const me = await makeUser(tx)
				const dep = await makeDependent(tx, { createdByUserId: me.id })
				const own = await makeList(tx, { ownerId: me.id, name: 'My list' })
				const depList = await makeList(tx, { ownerId: me.id, name: 'For dependent', subjectDependentId: dep.id })
				await makeItem(tx, { listId: own.id, title: 'Personal zzz' })
				await makeItem(tx, { listId: depList.id, title: 'Dependent gift zzz' })

				const result = await searchMyItemsImpl({ userId: me.id, query: ALL }, tx)

				expect(result.kind === 'ok' && result.items.map(i => i.title)).toEqual(['Personal zzz'])
			})
		})

		it('reports hasAnyItems=false only when the user has no searchable item at all', async () => {
			await withRollback(async tx => {
				const me = await makeUser(tx)
				const list = await makeList(tx, { ownerId: me.id })

				const empty = await searchMyItemsImpl({ userId: me.id, query: 'kettle' }, tx)
				expect(empty).toMatchObject({ kind: 'ok', totalMatches: 0, hasAnyItems: false })

				await makeItem(tx, { listId: list.id, title: 'Bass guitar' })

				const noMatch = await searchMyItemsImpl({ userId: me.id, query: 'kettle' }, tx)
				expect(noMatch).toMatchObject({ kind: 'ok', totalMatches: 0, hasAnyItems: true })
			})
		})
	})

	describe('search', () => {
		it('refuses a query below the minimum length without touching the DB', async () => {
			await withRollback(async tx => {
				const me = await makeUser(tx)
				const list = await makeList(tx, { ownerId: me.id })
				await makeItem(tx, { listId: list.id, title: 'Bass guitar' })

				expect(await searchMyItemsImpl({ userId: me.id, query: 'ba' }, tx)).toEqual({
					kind: 'query-too-short',
					minLength: MIN_ITEM_SEARCH_QUERY_LENGTH,
				})
				expect(await searchMyItemsImpl({ userId: me.id, query: '   ' }, tx)).toMatchObject({ kind: 'query-too-short' })
			})
		})

		it('matches on title, list name, and notes, case-insensitively', async () => {
			await withRollback(async tx => {
				const me = await makeUser(tx)
				const gear = await makeList(tx, { ownerId: me.id, name: 'Bass gear' })
				const kitchen = await makeList(tx, { ownerId: me.id, name: 'Kitchen' })
				await makeItem(tx, { listId: kitchen.id, title: 'BASS guitar' })
				await makeItem(tx, { listId: gear.id, title: 'Strap' })
				await makeItem(tx, { listId: kitchen.id, title: 'Skillet', notes: 'not the little Bass-sized one' })
				await makeItem(tx, { listId: kitchen.id, title: 'Kettle' })

				const result = await searchMyItemsImpl({ userId: me.id, query: 'bAsS' }, tx)

				expect(result.kind === 'ok' && result.items.map(i => i.title).sort()).toEqual(['BASS guitar', 'Skillet', 'Strap'])
			})
		})

		it('requires every token to match, but lets tokens land in different fields', async () => {
			await withRollback(async tx => {
				const me = await makeUser(tx)
				const gear = await makeList(tx, { ownerId: me.id, name: 'Bass gear' })
				const kitchen = await makeList(tx, { ownerId: me.id, name: 'Kitchen' })
				await makeItem(tx, { listId: gear.id, title: 'Strap' })
				await makeItem(tx, { listId: kitchen.id, title: 'Strap' })

				const result = await searchMyItemsImpl({ userId: me.id, query: 'strap bass' }, tx)

				expect(result.kind === 'ok' && result.items).toHaveLength(1)
				expect(result.kind === 'ok' && result.items[0]?.listName).toBe('Bass gear')
			})
		})

		it('ranks title prefix above title substring above list name above notes', async () => {
			await withRollback(async tx => {
				const me = await makeUser(tx)
				const kitchen = await makeList(tx, { ownerId: me.id, name: 'Kitchen' })
				const coneList = await makeList(tx, { ownerId: me.id, name: 'Cone collection' })
				await makeItem(tx, { listId: kitchen.id, title: 'Waffle maker', notes: 'the giant cone one' })
				await makeItem(tx, { listId: coneList.id, title: 'Salt' })
				await makeItem(tx, { listId: kitchen.id, title: 'Giant cone' })
				await makeItem(tx, { listId: kitchen.id, title: 'Cone, giant' })

				const result = await searchMyItemsImpl({ userId: me.id, query: 'cone' }, tx)

				expect(result.kind === 'ok' && result.items.map(i => i.title)).toEqual(['Cone, giant', 'Giant cone', 'Salt', 'Waffle maker'])
			})
		})

		it('caps the rows at MAX_ITEM_SEARCH_RESULTS but reports the true match count', async () => {
			await withRollback(async tx => {
				const me = await makeUser(tx)
				const list = await makeList(tx, { ownerId: me.id, name: 'Big list' })
				const total = MAX_ITEM_SEARCH_RESULTS + 7
				for (let i = 0; i < total; i++) {
					await makeItem(tx, { listId: list.id, title: `Bass number ${String(i).padStart(3, '0')}` })
				}

				const result = await searchMyItemsImpl({ userId: me.id, query: 'bass' }, tx)

				expect(result.kind === 'ok' && result.items).toHaveLength(MAX_ITEM_SEARCH_RESULTS)
				expect(result.kind === 'ok' && result.totalMatches).toBe(total)
			})
		})

		it('treats LIKE wildcards in the query as literal characters', async () => {
			await withRollback(async tx => {
				const me = await makeUser(tx)
				const list = await makeList(tx, { ownerId: me.id })
				await makeItem(tx, { listId: list.id, title: '100% cotton socks' })
				await makeItem(tx, { listId: list.id, title: 'Wool socks' })

				const percent = await searchMyItemsImpl({ userId: me.id, query: '100%' }, tx)
				expect(percent.kind === 'ok' && percent.items.map(i => i.title)).toEqual(['100% cotton socks'])

				// A bare wildcard must not turn into "match everything".
				const wildcard = await searchMyItemsImpl({ userId: me.id, query: '%%%' }, tx)
				expect(wildcard.kind === 'ok' && wildcard.items).toEqual([])
			})
		})
	})
})
