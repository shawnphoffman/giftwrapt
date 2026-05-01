import { lt } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { verification } from '@/db/schema'

export type CleanupVerificationResult = { deleted: number }

type Args = {
	db: SchemaDatabase
	now: Date
}

export async function cleanupVerificationImpl({ db, now }: Args): Promise<CleanupVerificationResult> {
	// Use `returning()` instead of relying on `result.rowCount`. Pglite's
	// drizzle adapter doesn't always populate rowCount for `delete`, and
	// returning() works on every driver we run in production.
	const deletedRows = await db.delete(verification).where(lt(verification.expiresAt, now)).returning({ id: verification.id })
	return { deleted: deletedRows.length }
}
