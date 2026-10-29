import { lt } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { barcodeLookupHistory } from '@/db/schema'

/** Daily cleanup: drop Lookup History rows older than the retention window. */
export async function sweepBarcodeLookupHistory(args: {
	db: SchemaDatabase
	now: Date
	retentionDays: number
}): Promise<{ deleted: number }> {
	const cutoff = new Date(args.now.getTime() - args.retentionDays * 86_400_000)
	const rows = await args.db
		.delete(barcodeLookupHistory)
		.where(lt(barcodeLookupHistory.createdAt, cutoff))
		.returning({ id: barcodeLookupHistory.id })
	return { deleted: rows.length }
}
