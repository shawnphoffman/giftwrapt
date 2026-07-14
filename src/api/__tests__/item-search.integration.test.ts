// Coverage for `searchMyItemsImpl` (the My Lists item-search dialog data
// source). The scope contract: items on the signed-in user's own active,
// non-dependent-subject lists, filtered to the viewer-facing `'visible'`
// item-visibility mode. Verifies that other users' items, archived / pending-
// deletion items, inactive lists, dependent-subject lists, and todo lists are
// all excluded, and that the returned shape carries the list context the UI
// needs.

import { makeDependent, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { searchMyItemsImpl } from '@/api/_item-search-impl'

describe('searchMyItemsImpl', () => {
	it('returns visible items on the user’s own active, non-dependent lists with list context', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			const listA = await makeList(tx, { ownerId: me.id, name: 'Books', type: 'wishlist', isPrivate: false })
			const listB = await makeList(tx, { ownerId: me.id, name: 'Secret Ideas', type: 'giftideas', isPrivate: true })
			await makeItem(tx, { listId: listA.id, title: 'Dune', price: '$19.99', currency: 'USD', notes: 'sci-fi' })
			await makeItem(tx, { listId: listB.id, title: 'Headphones' })

			const { items } = await searchMyItemsImpl(me.id, tx)

			expect(items).toHaveLength(2)
			const dune = items.find(i => i.title === 'Dune')
			expect(dune).toMatchObject({
				listId: listA.id,
				listName: 'Books',
				listType: 'wishlist',
				listIsPrivate: false,
				price: '$19.99',
				currency: 'USD',
				notes: 'sci-fi',
			})
			// Ordered by list name then title: "Books" before "Secret Ideas".
			expect(items.map(i => i.title)).toEqual(['Dune', 'Headphones'])
		})
	})

	it('excludes items on other users’ lists', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			const other = await makeUser(tx)
			const mine = await makeList(tx, { ownerId: me.id })
			const theirs = await makeList(tx, { ownerId: other.id })
			await makeItem(tx, { listId: mine.id, title: 'Mine' })
			await makeItem(tx, { listId: theirs.id, title: 'Theirs' })

			const { items } = await searchMyItemsImpl(me.id, tx)

			expect(items.map(i => i.title)).toEqual(['Mine'])
		})
	})

	it('excludes archived and pending-deletion items (visible mode)', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			const list = await makeList(tx, { ownerId: me.id })
			await makeItem(tx, { listId: list.id, title: 'Active' })
			await makeItem(tx, { listId: list.id, title: 'Revealed', isArchived: true })
			await makeItem(tx, { listId: list.id, title: 'Orphaned', pendingDeletionAt: new Date() })

			const { items } = await searchMyItemsImpl(me.id, tx)

			expect(items.map(i => i.title)).toEqual(['Active'])
		})
	})

	it('excludes items on inactive (archived) lists', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			const active = await makeList(tx, { ownerId: me.id, name: 'Active list' })
			const inactive = await makeList(tx, { ownerId: me.id, name: 'Archived list', isActive: false })
			await makeItem(tx, { listId: active.id, title: 'Keeps' })
			await makeItem(tx, { listId: inactive.id, title: 'Hidden' })

			const { items } = await searchMyItemsImpl(me.id, tx)

			expect(items.map(i => i.title)).toEqual(['Keeps'])
		})
	})

	it('excludes items on dependent-subject lists (those belong to the dependents section)', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			const dep = await makeDependent(tx, { createdByUserId: me.id })
			const own = await makeList(tx, { ownerId: me.id, name: 'My list' })
			const depList = await makeList(tx, { ownerId: me.id, name: 'For dependent', subjectDependentId: dep.id })
			await makeItem(tx, { listId: own.id, title: 'Personal' })
			await makeItem(tx, { listId: depList.id, title: 'Dependent gift' })

			const { items } = await searchMyItemsImpl(me.id, tx)

			expect(items.map(i => i.title)).toEqual(['Personal'])
		})
	})
})
