import { makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { loadArchiveBannerInfo } from '@/lib/archive-schedule-loader'

describe('loadArchiveBannerInfo', () => {
	it('returns applicable, ISO-serialized info for a birthday list in the gap', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const info = await loadArchiveBannerInfo(list.id, tx, new Date('2026-03-08T12:00:00Z'))
			expect(info.applies).toBe(true)
			expect(info.eventHasPassed).toBe(true)
			expect(info.inForceWindow).toBe(true)
			// ISO strings, not Date objects.
			expect(typeof info.effectiveArchiveDate).toBe('string')
			expect(info.effectiveArchiveDate).toMatch(/^\d{4}-\d{2}-\d{2}T/)
		})
	})

	it('returns not-applicable for a giftideas list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const list = await makeList(tx, { ownerId: owner.id, type: 'giftideas', isPrivate: true })
			const info = await loadArchiveBannerInfo(list.id, tx, new Date('2026-03-08T12:00:00Z'))
			expect(info.applies).toBe(false)
			expect(info.effectiveArchiveDate).toBeNull()
			expect(info.notApplicableReason).toBeNull()
		})
	})

	it('flags a birthday or wishlist list whose owner has no birthday', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const now = new Date('2026-03-08T12:00:00Z')
			for (const type of ['birthday', 'wishlist'] as const) {
				const list = await makeList(tx, { ownerId: owner.id, type })
				const info = await loadArchiveBannerInfo(list.id, tx, now)
				expect(info.applies).toBe(false)
				expect(info.notApplicableReason).toBe('owner-no-birthday')
			}
			// Christmas lists don't depend on the owner's birthday.
			const christmas = await makeList(tx, { ownerId: owner.id, type: 'christmas' })
			expect((await loadArchiveBannerInfo(christmas.id, tx, now)).notApplicableReason).toBeNull()
			// An inactive list never auto-reveals, birthday or not.
			const inactive = await makeList(tx, { ownerId: owner.id, type: 'birthday', isActive: false })
			expect((await loadArchiveBannerInfo(inactive.id, tx, now)).notApplicableReason).toBeNull()
		})
	})
})
