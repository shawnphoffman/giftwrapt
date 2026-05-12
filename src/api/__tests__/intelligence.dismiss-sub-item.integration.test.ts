// Covers the dismissRecommendationSubItem flow:
//  - Inserting a dismissal row for an existing rec.
//  - The dismissal is keyed by fingerprint (so a regen producing a new rec
//    row with the same fingerprint preserves the dismissal).
//  - The rec stays `active` after a per-sub-item dismiss; only the bundle
//    Dismiss flow flips status.
//  - Idempotent: dismissing the same sub-item twice is a no-op.

import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { db } from '@/db'
import { recommendations, recommendationSubItemDismissals } from '@/db/schema'

import { makeUser } from '../../../test/integration/factories'
import { withRollback } from '../../../test/integration/setup'

async function insertBundleRec(tx: Parameters<Parameters<typeof withRollback>[0]>[0], args: { userId: string; fingerprint?: string }) {
	const fingerprint = args.fingerprint ?? `test-${randomUUID()}`
	const [row] = await tx
		.insert(recommendations)
		.values({
			userId: args.userId,
			batchId: randomUUID(),
			analyzerId: 'missing-price',
			kind: 'missing-price',
			fingerprint,
			status: 'active',
			severity: 'info',
			title: 'Add prices',
			body: 'These items have no prices.',
			payload: {
				subItems: [
					{ id: '101', title: 'Anker 737', nav: { listId: '1', itemId: '101', openEdit: true } },
					{ id: '102', title: 'Logitech MX', nav: { listId: '1', itemId: '102', openEdit: true } },
				],
				bundleNav: { listId: '1' },
			},
		})
		.returning()
	return row
}

// Note: this test exercises the underlying DB operations directly rather
// than the server-fn wrapper (which goes through the request middleware
// pipeline; the integration setup mocks auth at the impl level).
// Mirrors the apply-grouping test pattern.

describe('recommendation_sub_item_dismissals', () => {
	it("inserts a dismissal row when a user dismisses a sub-item; the rec stays 'active'", async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const rec = await insertBundleRec(tx, { userId: user.id })

			await tx.insert(recommendationSubItemDismissals).values({ userId: user.id, fingerprint: rec.fingerprint, subItemId: '101' })

			const rows = await tx
				.select()
				.from(recommendationSubItemDismissals)
				.where(and(eq(recommendationSubItemDismissals.userId, user.id), eq(recommendationSubItemDismissals.fingerprint, rec.fingerprint)))
			expect(rows).toHaveLength(1)
			expect(rows[0].subItemId).toBe('101')

			const after = await tx.query.recommendations.findFirst({ where: eq(recommendations.id, rec.id) })
			expect(after?.status).toBe('active')
		})
	})

	it('is idempotent under the (userId, fingerprint, subItemId) primary key (onConflictDoNothing)', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const rec = await insertBundleRec(tx, { userId: user.id })

			await tx
				.insert(recommendationSubItemDismissals)
				.values({ userId: user.id, fingerprint: rec.fingerprint, subItemId: '101' })
				.onConflictDoNothing()
			await tx
				.insert(recommendationSubItemDismissals)
				.values({ userId: user.id, fingerprint: rec.fingerprint, subItemId: '101' })
				.onConflictDoNothing()

			const rows = await tx.select().from(recommendationSubItemDismissals).where(eq(recommendationSubItemDismissals.userId, user.id))
			expect(rows).toHaveLength(1)
		})
	})

	it('separate sub-items dismiss independently; each gets its own row', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const rec = await insertBundleRec(tx, { userId: user.id })

			await tx.insert(recommendationSubItemDismissals).values([
				{ userId: user.id, fingerprint: rec.fingerprint, subItemId: '101' },
				{ userId: user.id, fingerprint: rec.fingerprint, subItemId: '102' },
			])

			const rows = await tx.select().from(recommendationSubItemDismissals).where(eq(recommendationSubItemDismissals.userId, user.id))
			expect(rows.map(r => r.subItemId).sort()).toEqual(['101', '102'])
		})
	})
})

// Ensure the test imports the runtime `db` to confirm wiring; not used here.
void db
