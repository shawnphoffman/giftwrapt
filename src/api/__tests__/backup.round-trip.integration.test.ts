// Backup round-trip. A fixture with every column of every backed-up table
// populated survives export -> JSON -> parse -> wipe-restore unchanged, and
// a merge-restore over rows whose every nullable / scalar column differs
// puts the original values back, so a column missing from an upsert `set`
// list fails. Column / table coverage (does the backup know about every
// column at all) is the unit test src/lib/backup/__tests__/coverage.test.ts.

import { withRollback } from '@test/integration/setup'
import { type Column, eq, getTableColumns } from 'drizzle-orm'
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { captureFullSnapshot, restoreBackupTablesImpl } from '@/api/_backup-impl'
import type { SchemaDatabase } from '@/db'
import {
	appSettings,
	customHolidayReminderLogs,
	customHolidays,
	dependentGuardianships,
	dependents,
	giftContributions,
	giftedItems,
	guardianships,
	itemComments,
	itemGroups,
	items,
	itemScrapeJobs,
	listAddons,
	listEditors,
	lists,
	purchaseAttachments,
	recommendations,
	recommendationSubItemDismissals,
	todoItems,
	userRelationLabels,
	userRelationships,
	users,
} from '@/db/schema'
import { type BackupFile, BackupFileSchema, type BackupFileTables } from '@/lib/backup/schema'
import { BACKUP_OMITTED_COLUMNS, BACKUP_TABLES } from '@/lib/backup/tables'

// ===============================
// Column metadata helpers
// ===============================

type ColumnInfo = { key: string; column: Column; isPrimary: boolean; isForeign: boolean }

// Matched by DB column name: the Column objects getTableConfig hands back
// for composite primary keys aren't the same instances getTableColumns does.
function columnInfo(table: PgTable): Array<ColumnInfo> {
	const config = getTableConfig(table)
	const pkNames = new Set(config.primaryKeys.flatMap(pk => pk.columns.map(c => c.name)))
	const fkNames = new Set(config.foreignKeys.flatMap(fk => fk.reference().columns.map(c => c.name)))
	return Object.entries(getTableColumns(table)).map(([key, column]) => ({
		key,
		column,
		isPrimary: column.primary || pkNames.has(column.name),
		isForeign: fkNames.has(column.name),
	}))
}

function primaryKeyOf(table: PgTable): Array<string> {
	return columnInfo(table)
		.filter(c => c.isPrimary)
		.map(c => c.key)
}

// Plain JSON, omitted columns dropped, rows sorted by primary key. Comparing
// raw snapshots (not parsed ones) means a column the row schema strips shows
// up as a diff here too, not only in the coverage test.
function normalize(snapshot: BackupFile): Record<string, Array<Record<string, unknown>>> {
	const json = JSON.parse(JSON.stringify(snapshot.tables)) as Record<string, Array<Record<string, unknown>> | undefined>
	const out: Record<string, Array<Record<string, unknown>>> = {}
	for (const { name, table } of BACKUP_TABLES) {
		const omitted = Object.keys(BACKUP_OMITTED_COLUMNS[name] ?? {})
		const pk = primaryKeyOf(table)
		const sortKey = (row: Record<string, unknown>) => pk.map(k => String(row[k])).join('|')
		out[name] = (json[name] ?? [])
			.map(row => Object.fromEntries(Object.entries(row).filter(([k]) => !omitted.includes(k))))
			.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
	}
	return out
}

function toFile(snapshot: BackupFile): BackupFile {
	return BackupFileSchema.parse(JSON.parse(JSON.stringify(snapshot)))
}

// A value that differs from `value` for a NOT NULL scalar column. Throws on
// an unknown column type so a new type forces this helper to be taught.
function perturbValue(column: Column, value: unknown): unknown {
	switch (column.columnType) {
		case 'PgBoolean':
			return !value
		case 'PgTimestamp':
			return new Date((value as Date).getTime() + 86_400_000)
		case 'PgEnumColumn':
			return (column.enumValues ?? []).find(v => v !== value)
		case 'PgNumeric':
			return String(Number(value) + 1)
		case 'PgSmallInt':
		case 'PgInteger':
			return (value as number) + 1
		case 'PgText':
			return `${String(value)}-perturbed`
		case 'PgUUID':
			return '00000000-0000-4000-8000-000000000000'
		case 'PgJsonb':
			return { perturbed: true }
		default:
			throw new Error(`perturbValue: unhandled column type ${column.columnType} (${column.name})`)
	}
}

// Nullable columns (FKs included) go to null, the regression class this
// guards: new columns are almost always nullable. NOT NULL scalars change
// value. Primary keys and NOT NULL FKs stay put so rows still line up and
// FKs still resolve; those few columns are the merge test's blind spot.
// So are the columns below: a CHECK requires exactly one of them, so nulling
// both can never be restored over.
const KEPT_DURING_PERTURB: Partial<Record<string, ReadonlyArray<string>>> = {
	purchaseAttachments: ['giftId', 'addonId'],
}

function perturbTables(tables: BackupFileTables): BackupFileTables {
	const out: Record<string, unknown> = { ...tables }
	for (const { name, table } of BACKUP_TABLES) {
		const rows = tables[name] as Array<Record<string, unknown>> | undefined
		if (!rows) continue
		const info = columnInfo(table)
		out[name] = rows.map(row => {
			const next = { ...row }
			for (const { key, column, isPrimary, isForeign } of info) {
				if (isPrimary || !(key in row) || KEPT_DURING_PERTURB[name]?.includes(key)) continue
				if (!column.notNull) next[key] = null
				else if (!isForeign) next[key] = perturbValue(column, row[key])
			}
			return next
		})
	}
	return out as BackupFileTables
}

// ===============================
// Fixture: every column populated
// ===============================

const T1 = new Date('2026-01-02T03:04:05.678Z')
const T2 = new Date('2026-02-03T04:05:06.789Z')
const T3 = new Date('2026-03-04T05:06:07.891Z')
const stamps = { createdAt: T1, updatedAt: T2 }
const HOLIDAY_ID = '6f1c0f3e-8a5b-4c2d-9e7f-0a1b2c3d4e5f'

async function seedEveryColumn(tx: SchemaDatabase) {
	await tx.insert(users).values([
		{
			id: 'bk_owner',
			email: 'owner@backup.test',
			name: 'Owner',
			role: 'admin',
			banned: true,
			banReason: 'testing',
			banExpires: T3,
			birthMonth: 'march',
			birthDay: 14,
			birthYear: 1985,
			image: 'https://cdn.test/owner.png',
			partnerId: 'bk_partner',
			partnerAnniversary: '2015-06-20',
			twoFactorEnabled: true,
			emailVerified: true,
			...stamps,
		},
		{ id: 'bk_partner', email: 'partner@backup.test', name: 'Partner', partnerId: 'bk_owner', ...stamps },
		{ id: 'bk_child', email: 'child@backup.test', name: 'Child', role: 'child', ...stamps },
	])
	await tx.insert(appSettings).values({ key: 'bk_setting', value: { nested: [1, 2], on: true }, ...stamps })
	await tx
		.insert(userRelationships)
		.values({ ownerUserId: 'bk_owner', viewerUserId: 'bk_partner', accessLevel: 'restricted', canEdit: true, ...stamps })
	await tx.insert(guardianships).values({ parentUserId: 'bk_owner', childUserId: 'bk_child', ...stamps })
	await tx.insert(dependents).values({
		id: 'bk_dep',
		name: 'Rex',
		image: 'https://cdn.test/rex.png',
		birthMonth: 'may',
		birthDay: 2,
		birthYear: 2020,
		createdByUserId: 'bk_owner',
		isArchived: true,
		...stamps,
	})
	await tx.insert(dependentGuardianships).values({ guardianUserId: 'bk_owner', dependentId: 'bk_dep', ...stamps })
	await tx.insert(userRelationLabels).values([
		{ id: 501, userId: 'bk_owner', label: 'mother', targetUserId: 'bk_partner', targetDependentId: null, ...stamps },
		{ id: 502, userId: 'bk_owner', label: 'father', targetUserId: null, targetDependentId: 'bk_dep', ...stamps },
	])
	await tx.insert(customHolidays).values({
		id: HOLIDAY_ID,
		title: 'Family Day',
		source: 'custom',
		catalogCountry: 'US',
		catalogKey: 'family-day',
		customMonth: 8,
		customDay: 9,
		customYear: 2027,
		recipientUserId: 'bk_partner',
		recipientDependentId: 'bk_dep',
		iconKey: 'star',
		...stamps,
	})
	await tx.insert(customHolidayReminderLogs).values({
		id: 'a1b2c3d4-0000-4000-8000-000000000001',
		customHolidayId: HOLIDAY_ID,
		occurrenceYear: 2026,
		...stamps,
	})
	await tx.insert(recommendations).values({
		id: 'a1b2c3d4-0000-4000-8000-000000000002',
		userId: 'bk_owner',
		dependentId: 'bk_dep',
		batchId: 'a1b2c3d4-0000-4000-8000-000000000003',
		analyzerId: 'stale-items',
		kind: 'old-items',
		fingerprint: 'fp-1',
		status: 'dismissed',
		severity: 'important',
		title: 'Old items',
		body: 'These are old',
		payload: { itemIds: [801] },
		createdAt: T1,
		dismissedAt: T2,
	})
	await tx.insert(recommendationSubItemDismissals).values({ userId: 'bk_owner', fingerprint: 'fp-1', subItemId: '801', dismissedAt: T3 })
	await tx.insert(lists).values({
		id: 601,
		name: 'Everything list',
		type: 'holiday',
		isActive: false,
		isPrivate: true,
		isPrimary: true,
		description: 'desc',
		ownerId: 'bk_owner',
		subjectDependentId: 'bk_dep',
		giftIdeasTargetUserId: 'bk_partner',
		giftIdeasTargetDependentId: 'bk_dep',
		lastHolidayArchiveAt: T1,
		archiveDeferUntil: T2,
		lastArchivedAt: T3,
		customHolidayId: HOLIDAY_ID,
		...stamps,
	})
	await tx.insert(itemGroups).values({ id: 701, listId: 601, type: 'order', priority: 'high', name: 'Set', sortOrder: 3, ...stamps })
	await tx.insert(items).values({
		id: 801,
		listId: 601,
		groupId: 701,
		title: 'Widget',
		status: 'complete',
		availability: 'unavailable',
		availabilityChangedAt: T1,
		url: 'https://shop.test/widget',
		vendorId: 'shop.test',
		vendorSource: 'manual',
		imageUrl: 'https://cdn.test/widget.png',
		price: '19.99',
		currency: 'USD',
		notes: 'blue',
		ratingValue: 0.75,
		ratingCount: 42,
		priority: 'very-high',
		isArchived: true,
		archivedAt: T3,
		pendingDeletionAt: T2,
		quantity: 3,
		groupSortOrder: 2,
		sortOrder: 5,
		modifiedAt: T3,
		...stamps,
	})
	await tx.insert(itemScrapeJobs).values({
		id: 851,
		itemId: 801,
		userId: 'bk_owner',
		url: 'https://shop.test/widget',
		status: 'failed',
		attempts: 4,
		lastError: 'timeout',
		nextAttemptAt: T1,
		enqueuedAt: T2,
		completedAt: T3,
	})
	await tx.insert(todoItems).values({
		id: 901,
		listId: 601,
		title: 'Wrap',
		notes: 'tape',
		priority: 'low',
		claimedByUserId: 'bk_partner',
		claimedAt: T1,
		sortOrder: 1,
		...stamps,
	})
	await tx.insert(giftedItems).values({
		id: 1001,
		itemId: 801,
		gifterId: 'bk_partner',
		additionalGifterIds: ['bk_child'],
		quantity: 2,
		totalCost: '42.50',
		notes: 'wrapped',
		attachmentUrls: ['https://cdn.test/receipt.pdf'],
		trackingNumber: '1Z999AA10123456784',
		orphanReminderSentAt: T3,
		...stamps,
	})
	await tx.insert(giftContributions).values({ id: 1101, giftId: 1001, userId: 'bk_child', amount: '12.50', ...stamps })
	await tx.insert(itemComments).values({ id: 1201, itemId: 801, userId: 'bk_partner', comment: 'nice', ...stamps })
	await tx.insert(listAddons).values({
		id: 1301,
		listId: 601,
		userId: 'bk_partner',
		description: 'Card',
		totalCost: '5.00',
		notes: 'signed',
		url: 'https://shop.test/card',
		imageUrl: 'https://cdn.test/card.png',
		attachmentUrls: ['https://cdn.test/card-receipt.png'],
		trackingNumber: '9400100000000000000000',
		isArchived: true,
		...stamps,
	})
	await tx.insert(listEditors).values({ id: 1401, listId: 601, userId: 'bk_partner', ownerId: 'bk_owner', ...stamps })
	// Two rows: a receipt belongs to exactly one of a claim or an addon.
	await tx.insert(purchaseAttachments).values([
		{
			id: 'bkReceiptClaim0000001',
			giftId: 1001,
			addonId: null,
			storageKey: 'purchases/receipts/claim/1001/aaaaaaaaaaaa.pdf',
			contentType: 'application/pdf',
			...stamps,
		},
		{
			id: 'bkReceiptAddon0000001',
			giftId: null,
			addonId: 1301,
			storageKey: 'purchases/receipts/addon/1301/bbbbbbbbbbbb.webp',
			contentType: 'image/webp',
			...stamps,
		},
	])
}

function expectEveryColumnPopulated(snapshot: BackupFile) {
	const missing: Array<string> = []
	for (const { name, table } of BACKUP_TABLES) {
		const rows = (snapshot.tables[name] ?? []) as Array<Record<string, unknown>>
		if (rows.length === 0) missing.push(`${name} (no rows)`)
		for (const key of Object.keys(getTableColumns(table))) {
			if (!rows.some(r => r[key] !== null && r[key] !== undefined)) missing.push(`${name}.${key}`)
		}
	}
	// A failure here means seedEveryColumn needs the new column / table.
	expect(missing).toEqual([])
}

// ===============================
// Tests
// ===============================

describe('backup round-trip', () => {
	it('wipe-restores a row with every column populated unchanged', async () => {
		await withRollback(async tx => {
			await seedEveryColumn(tx)
			const original = await captureFullSnapshot(tx)
			expectEveryColumnPopulated(original)

			await restoreBackupTablesImpl({ tx, mode: 'wipe', tables: toFile(original).tables })

			const restored = await captureFullSnapshot(tx)
			expect(normalize(restored)).toEqual(normalize(original))
			// Never restored; see BACKUP_OMITTED_COLUMNS.
			expect(restored.tables.users.map(u => (u as unknown as { twoFactorEnabled: boolean }).twoFactorEnabled)).toEqual([
				false,
				false,
				false,
			])
		})
	})

	it('merge-restores every column over rows that differ', async () => {
		await withRollback(async tx => {
			await seedEveryColumn(tx)
			const original = await captureFullSnapshot(tx)
			const file = toFile(original)

			await restoreBackupTablesImpl({ tx, mode: 'wipe', tables: perturbTables(file.tables) })
			const perturbed = normalize(await captureFullSnapshot(tx))
			// Sanity: the perturbed state really does differ row by row.
			const want = normalize(original)
			for (const { name } of BACKUP_TABLES) {
				perturbed[name].forEach((row, i) => expect(row, name).not.toEqual(want[name][i]))
			}

			await restoreBackupTablesImpl({ tx, mode: 'merge', tables: file.tables })
			expect(normalize(await captureFullSnapshot(tx))).toEqual(want)
		})
	})

	it('merge leaves a live twoFactorEnabled alone', async () => {
		await withRollback(async tx => {
			await seedEveryColumn(tx)
			const file = toFile(await captureFullSnapshot(tx))
			await restoreBackupTablesImpl({ tx, mode: 'merge', tables: file.tables })
			const owner = await tx.query.users.findFirst({ where: eq(users.id, 'bk_owner') })
			expect(owner?.twoFactorEnabled).toBe(true)
		})
	})

	it('restores a scrape job exported mid-run as pending', async () => {
		await withRollback(async tx => {
			await seedEveryColumn(tx)
			await tx.update(itemScrapeJobs).set({ status: 'running' }).where(eq(itemScrapeJobs.id, 851))
			const file = toFile(await captureFullSnapshot(tx))

			await restoreBackupTablesImpl({ tx, mode: 'wipe', tables: file.tables })

			const job = await tx.query.itemScrapeJobs.findFirst({ where: eq(itemScrapeJobs.id, 851) })
			expect(job?.status).toBe('pending')
		})
	})

	it('restores a backup written before newer columns and tables existed', async () => {
		await withRollback(async tx => {
			await seedEveryColumn(tx)
			const legacy = JSON.parse(JSON.stringify(await captureFullSnapshot(tx))) as { tables: Record<string, unknown> }
			for (const name of [
				'customHolidays',
				'customHolidayReminderLogs',
				'userRelationLabels',
				'recommendations',
				'recommendationSubItemDismissals',
				'itemScrapeJobs',
			]) {
				delete legacy.tables[name]
			}
			for (const row of legacy.tables.listAddons as Array<Record<string, unknown>>) {
				delete row.attachmentUrls
				delete row.trackingNumber
			}

			await restoreBackupTablesImpl({ tx, mode: 'wipe', tables: BackupFileSchema.parse(legacy).tables })

			// Holidays aren't in the file, so the live row and the list's pin survive.
			const list = await tx.query.lists.findFirst({ where: eq(lists.id, 601) })
			expect(list?.customHolidayId).toBe(HOLIDAY_ID)
			const addon = await tx.query.listAddons.findFirst({ where: eq(listAddons.id, 1301) })
			expect(addon).toMatchObject({ description: 'Card', attachmentUrls: null, trackingNumber: null })
		})
	})

	it('nulls a list pin to a custom holiday the target deployment lacks', async () => {
		await withRollback(async tx => {
			await seedEveryColumn(tx)
			const legacy = JSON.parse(JSON.stringify(await captureFullSnapshot(tx))) as { tables: Record<string, unknown> }
			delete legacy.tables.customHolidays
			delete legacy.tables.customHolidayReminderLogs
			await tx.delete(customHolidays)

			await restoreBackupTablesImpl({ tx, mode: 'wipe', tables: BackupFileSchema.parse(legacy).tables })

			const list = await tx.query.lists.findFirst({ where: eq(lists.id, 601) })
			expect(list).toMatchObject({ name: 'Everything list', customHolidayId: null })
		})
	})
})
