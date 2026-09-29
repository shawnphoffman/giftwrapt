import { describe, expect, it } from 'vitest'

import { BackupFileSchema } from '../schema'

function backupWithAddon(addon: Record<string, unknown>) {
	return {
		version: 1 as const,
		exportedAt: '2026-09-29T00:00:00.000Z',
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
			listAddons: [addon],
			listEditors: [],
		},
	}
}

const baseAddon = {
	id: 3,
	listId: 9,
	userId: 'user_gifter',
	description: 'Olive wood salad servers',
	totalCost: '28.00',
	notes: null,
	isArchived: false,
	updatedAt: '2026-09-29T01:00:00.000Z',
	createdAt: '2026-09-29T00:00:00.000Z',
}

describe('BackupFileSchema - listAddons url/imageUrl', () => {
	it('round-trips url and imageUrl through JSON', () => {
		const exported = backupWithAddon({
			...baseAddon,
			url: 'https://www.etsy.com/listing/1/salad-servers',
			imageUrl: 'https://cdn.test/purchases/addon/3/abcdefghijkl.webp',
		})
		const parsed = BackupFileSchema.parse(JSON.parse(JSON.stringify(exported)))
		const row = parsed.tables.listAddons[0]
		expect(row.url).toBe('https://www.etsy.com/listing/1/salad-servers')
		expect(row.imageUrl).toBe('https://cdn.test/purchases/addon/3/abcdefghijkl.webp')
	})

	it('accepts backups written before the columns existed', () => {
		const parsed = BackupFileSchema.parse(backupWithAddon(baseAddon))
		const row = parsed.tables.listAddons[0]
		expect(row.description).toBe('Olive wood salad servers')
		expect(row.url ?? null).toBeNull()
		expect(row.imageUrl ?? null).toBeNull()
	})
})
