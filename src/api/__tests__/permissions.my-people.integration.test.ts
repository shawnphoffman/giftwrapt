import { makeUser, makeUserRelationship } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { getMyPeopleImpl } from '@/api/_permissions-impl'
import { users } from '@/db/schema'

describe('getMyPeopleImpl', () => {
	it('returns every other user with default open visibility flags', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx, { name: 'Me' })
			const alice = await makeUser(tx, { name: 'Alice' })
			const bob = await makeUser(tx, { name: 'Bob' })

			const people = await getMyPeopleImpl(tx, me.id)

			const ids = people.map(p => p.id)
			expect(ids).toContain(alice.id)
			expect(ids).toContain(bob.id)
			expect(ids).not.toContain(me.id)

			for (const p of people) {
				expect(p.canIViewTheirList).toBe(true)
				expect(p.canTheyViewMyList).toBe(true)
				expect(p.canIEditTheirList).toBe(false)
				expect(p.canTheyEditMyList).toBe(false)
				expect(p.isPartner).toBe(false)
			}
		})
	})

	it('classifies relationship as partner when partnerId points at user', async () => {
		await withRollback(async tx => {
			// Insert partner first so the FK on me.partnerId is satisfied at insert time.
			const partner = await makeUser(tx, { name: 'Partner' })
			const me = await makeUser(tx, { name: 'Me', partnerId: partner.id })

			const people = await getMyPeopleImpl(tx, me.id)
			const partnerRow = people.find(p => p.id === partner.id)

			expect(partnerRow).toBeDefined()
			expect(partnerRow?.isPartner).toBe(true)
			expect(partnerRow?.relationship).toBe('partner')
		})
	})

	it('flips canIViewTheirList off when an owner explicitly hides their list from me', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const me = await makeUser(tx, { name: 'Me' })
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: me.id, canView: false })

			const people = await getMyPeopleImpl(tx, me.id)
			const ownerRow = people.find(p => p.id === owner.id)

			expect(ownerRow?.canIViewTheirList).toBe(false)
			expect(ownerRow?.canTheyViewMyList).toBe(true)
			expect(ownerRow?.relationship).toBe('viewer')
		})
	})

	it('returns birthMonth/birthDay/birthYear so MCP get_user_profile can derive without a second fetch', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx, { name: 'Me' })
			const jason = await makeUser(tx, {
				name: 'Jason',
				birthMonth: 'march',
				birthDay: 17,
				birthYear: 1985,
			})

			const people = await getMyPeopleImpl(tx, me.id)
			const jasonRow = people.find(p => p.id === jason.id)

			expect(jasonRow?.birthMonth).toBe('march')
			expect(jasonRow?.birthDay).toBe(17)
			expect(jasonRow?.birthYear).toBe(1985)
		})
	})

	it('still returns a row even when both directions are explicitly hidden, classified as none', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx, { name: 'Me' })
			const stranger = await makeUser(tx, { name: 'Stranger' })
			await makeUserRelationship(tx, { ownerUserId: me.id, viewerUserId: stranger.id, canView: false })
			await makeUserRelationship(tx, { ownerUserId: stranger.id, viewerUserId: me.id, canView: false })

			const people = await getMyPeopleImpl(tx, me.id)
			const row = people.find(p => p.id === stranger.id)

			expect(row).toBeDefined()
			expect(row?.canIViewTheirList).toBe(false)
			expect(row?.canTheyViewMyList).toBe(false)
			expect(row?.relationship).toBe('none')
		})
	})

	it('does not error when there are no other users in the system', async () => {
		await withRollback(async tx => {
			// Wipe any rows that might have leaked from a prior test if isolation
			// ever loosens. withRollback should handle this; the delete is a belt
			// for the suspenders.
			await tx.delete(users)
			const me = await makeUser(tx, { name: 'Loner' })

			const people = await getMyPeopleImpl(tx, me.id)
			expect(people).toEqual([])
		})
	})
})
