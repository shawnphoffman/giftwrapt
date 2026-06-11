import { describe, expect, it } from 'vitest'

import { BackupFileSchema } from '../schema'

// A backup payload as it arrives on import: JSON, so every Date is an ISO
// string. Only the fields relevant to this test are populated; the rest of
// the tables are empty arrays (the schema requires the keys to be present
// except for the explicitly-defaulted ones).
function backupWith(tables: Partial<Record<string, Array<unknown>>>) {
	return {
		version: 1 as const,
		exportedAt: '2026-06-10T00:00:00.000Z',
		tables: {
			users: [],
			appSettings: [],
			userRelationships: [],
			guardianships: [],
			dependents: [],
			dependentGuardianships: [],
			lists: [],
			itemGroups: [],
			items: [],
			todoItems: [],
			giftedItems: [],
			itemComments: [],
			listAddons: [],
			listEditors: [],
			...tables,
		},
	}
}

describe('BackupFileSchema - giftContributions', () => {
	it('round-trips a gift_contributions row through JSON serialize and parse', () => {
		// Mirrors the export shape: numeric amount comes back as a string from
		// drizzle's numeric() column; dates are ISO strings over the wire.
		const exported = backupWith({
			giftContributions: [
				{
					id: 7,
					giftId: 42,
					userId: 'user_abc',
					amount: '12.50',
					updatedAt: '2026-06-10T01:02:03.000Z',
					createdAt: '2026-06-09T00:00:00.000Z',
				},
			],
		})

		// Simulate the network/JSON hop the real import goes through.
		const parsed = BackupFileSchema.parse(JSON.parse(JSON.stringify(exported)))

		expect(parsed.tables.giftContributions).toHaveLength(1)
		const row = parsed.tables.giftContributions[0]
		expect(row.id).toBe(7)
		expect(row.giftId).toBe(42)
		expect(row.userId).toBe('user_abc')
		// numeric() preserves the string form (no float coercion).
		expect(row.amount).toBe('12.50')
		// dateField coerces ISO strings back to Date for drizzle inserts.
		expect(row.updatedAt).toBeInstanceOf(Date)
		expect(row.createdAt).toBeInstanceOf(Date)
		expect(row.updatedAt.toISOString()).toBe('2026-06-10T01:02:03.000Z')
	})

	it('defaults giftContributions to [] for backups written before the table existed', () => {
		// `backupWith` omits the key, exactly as an old backup file would. The
		// schema default keeps it importable instead of failing validation.
		const parsed = BackupFileSchema.parse(backupWith({}))
		expect(parsed.tables.giftContributions).toEqual([])
	})
})
