// Integration coverage for the cleanup-verification cron impl.
//
// The bearer-token check sits in `src/lib/cron-auth.ts` and is unit-tested
// by `src/lib/__tests__/cron-auth.test.ts`. This file focuses on what
// that can't see: that the impl actually deletes only expired rows.

import { describe, expect, it } from 'vitest'

import { verification } from '@/db/schema'

import { withRollback } from '../../../../../test/integration/setup'
import { cleanupVerificationImpl } from '../_cleanup-verification-impl'

const NOW = new Date('2026-04-30T12:00:00Z')

async function seedToken(tx: Parameters<Parameters<typeof withRollback>[0]>[0], opts: { id: string; expiresAt: Date }) {
	await tx.insert(verification).values({
		id: opts.id,
		identifier: `${opts.id}@test.local`,
		value: opts.id,
		expiresAt: opts.expiresAt,
	})
}

describe('cleanupVerificationImpl', () => {
	it('deletes only rows whose expiresAt is strictly before now', async () => {
		await withRollback(async tx => {
			await seedToken(tx, { id: 'expired-1', expiresAt: new Date('2026-04-29T12:00:00Z') })
			await seedToken(tx, { id: 'expired-2', expiresAt: new Date('2025-01-01T00:00:00Z') })
			await seedToken(tx, { id: 'fresh-1', expiresAt: new Date('2026-05-01T12:00:00Z') })
			await seedToken(tx, { id: 'fresh-2', expiresAt: new Date('2027-01-01T00:00:00Z') })

			const result = await cleanupVerificationImpl({ db: tx, now: NOW })
			expect(result.deleted).toBe(2)

			const remaining = await tx.select({ id: verification.id }).from(verification).orderBy(verification.id)
			expect(remaining.map(r => r.id)).toEqual(['fresh-1', 'fresh-2'])
		})
	})

	it('returns 0 when nothing has expired', async () => {
		await withRollback(async tx => {
			await seedToken(tx, { id: 'fresh', expiresAt: new Date('2027-01-01T00:00:00Z') })

			const result = await cleanupVerificationImpl({ db: tx, now: NOW })
			expect(result.deleted).toBe(0)

			const remaining = await tx.select({ id: verification.id }).from(verification)
			expect(remaining).toHaveLength(1)
		})
	})

	it('treats rows whose expiresAt equals now as still-fresh (lt, not lte)', async () => {
		await withRollback(async tx => {
			await seedToken(tx, { id: 'edge', expiresAt: NOW })
			const result = await cleanupVerificationImpl({ db: tx, now: NOW })
			// Equal-to-now is not "before now"; should remain.
			expect(result.deleted).toBe(0)
			const remaining = await tx.select({ id: verification.id }).from(verification)
			expect(remaining.map(r => r.id)).toEqual(['edge'])
		})
	})

	it('returns 0 on an empty table', async () => {
		await withRollback(async tx => {
			const result = await cleanupVerificationImpl({ db: tx, now: NOW })
			expect(result.deleted).toBe(0)
		})
	})
})
