// Guards the admin backup against silently losing data. Row schemas are
// plain z.object, which strips unknown keys, so a column the backup schema
// doesn't list is dropped on restore without any error. These checks fail
// the moment a column or table is added to `@/db/schema` without the backup
// being updated or the omission being recorded (with a reason) in
// BACKUP_OMITTED_COLUMNS / BACKUP_EXCLUDED_TABLES. Pure metadata, no DB, so
// it runs in the unit project on every `pnpm test`. The round-trip behavior
// is covered by src/api/__tests__/backup.round-trip.integration.test.ts.

import { getTableColumns, getTableName, is } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import * as schema from '@/db/schema'

import { BACKUP_ROW_SCHEMAS, BackupFileSchema } from '../schema'
import { BACKUP_EXCLUDED_TABLES, BACKUP_OMITTED_COLUMNS, BACKUP_TABLES, BACKUP_TABLES_DELETE_ORDER } from '../tables'

describe('backup coverage', () => {
	it('lists every Drizzle column in each backed-up table row schema, or records the omission', () => {
		const problems: Array<string> = []
		for (const { name, table } of BACKUP_TABLES) {
			const columns = Object.keys(getTableColumns(table))
			const schemaKeys = Object.keys(BACKUP_ROW_SCHEMAS[name].shape)
			const omitted = BACKUP_OMITTED_COLUMNS[name] ?? {}
			for (const column of columns) {
				if (!schemaKeys.includes(column) && !(column in omitted)) problems.push(`${name}.${column} is not in the backup row schema`)
				if (schemaKeys.includes(column) && column in omitted) problems.push(`${name}.${column} is both backed up and omitted`)
			}
			for (const key of [...schemaKeys, ...Object.keys(omitted)]) {
				if (!columns.includes(key)) problems.push(`${name}.${key} is not a column`)
			}
		}
		expect(problems).toEqual([])
	})

	it('has a row schema and a BackupFileSchema entry for every backed-up table', () => {
		const names = BACKUP_TABLES.map(t => t.name).sort()
		expect(Object.keys(BACKUP_ROW_SCHEMAS).sort()).toEqual(names)
		expect(Object.keys(BackupFileSchema.shape.tables.shape).sort()).toEqual(names)
	})

	it('backs up or explicitly excludes every table in the Drizzle schema', () => {
		const backedUp: Array<string> = BACKUP_TABLES.map(t => getTableName(t.table))
		const all = Object.values(schema as Record<string, unknown>)
			.filter((v): v is PgTable => is(v, PgTable))
			.map(t => getTableName(t))
		const unaccounted = all.filter(n => !backedUp.includes(n) && !(n in BACKUP_EXCLUDED_TABLES))
		const stale = Object.keys(BACKUP_EXCLUDED_TABLES).filter(n => !all.includes(n) || backedUp.includes(n))
		expect({ unaccounted, stale }).toEqual({ unaccounted: [], stale: [] })
	})

	it('clears every backed-up table on wipe except the conditionally-cleared custom holidays', () => {
		const deleted = BACKUP_TABLES_DELETE_ORDER.map(t => getTableName(t))
		// users is deleted last, separately, so its cascades clear auth state.
		const expected = BACKUP_TABLES.map(t => getTableName(t.table)).filter(
			n => !['users', 'custom_holidays', 'custom_holiday_reminder_logs'].includes(n)
		)
		expect(deleted.sort()).toEqual(expected.sort())
	})
})
