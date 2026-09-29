import { createServerFn } from '@tanstack/react-start'

import { db } from '@/db'
import type { BackupFile } from '@/lib/backup/schema'
import { BackupImportInputSchema, WIPE_CONFIRM_PHRASE } from '@/lib/backup/schema'
import { createLogger } from '@/lib/logger'
import { getStorage } from '@/lib/storage/adapter'
import { adminAuthMiddleware } from '@/middleware/auth'

import { captureFullSnapshot, countsFromTables, type ImportCounts, restoreBackupTablesImpl } from './_backup-impl'

export type { ImportCounts }

const backupLog = createLogger('backup')

// ===============================
// EXPORT
// ===============================

export const exportAppDataAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware])
	.handler(async (): Promise<BackupFile> => captureFullSnapshot())

// ===============================
// IMPORT
// ===============================

export type ImportBackupResult =
	| { kind: 'ok'; counts: ImportCounts; snapshotKey?: string }
	| {
			kind: 'error'
			reason: 'current-admin-missing' | 'import-failed' | 'wipe-confirm-required' | 'snapshot-required' | 'snapshot-failed'
			details?: string
	  }

export const importAppDataAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware])
	.inputValidator((input: unknown) => BackupImportInputSchema.parse(input))
	.handler(async ({ data: input, context }): Promise<ImportBackupResult> => {
		const { mode, data, confirmWipe, confirmSkipSnapshot } = input
		const { tables } = data
		const currentAdminId = context.session.user.id

		// === Wipe guardrails (sec-review H6) ===========================
		// All three checks fail-closed before we touch the database.
		let snapshotKey: string | undefined

		if (mode === 'wipe') {
			// 1. Server-side confirmation phrase. The UI prompts the admin
			//    to type this; we re-check so a forged or replayed call
			//    that skips the UI is refused.
			if (confirmWipe !== WIPE_CONFIRM_PHRASE) {
				backupLog.warn({ adminId: currentAdminId }, 'wipe attempt missing confirmation phrase')
				return {
					kind: 'error',
					reason: 'wipe-confirm-required',
					details: `The wipe-and-restore mode requires confirmWipe === "${WIPE_CONFIRM_PHRASE}".`,
				}
			}

			// 2. Don't lock the current admin out of their own deployment.
			if (!tables.users.some(u => u.id === currentAdminId)) {
				return {
					kind: 'error',
					reason: 'current-admin-missing',
					details:
						"Your own user account is not in the backup's users table. A wipe-and-restore would lock you out, so the import was aborted. Sign in as a different admin whose account is in the backup, or switch to Merge mode.",
				}
			}

			// 3. Pre-wipe snapshot to storage. If storage is configured,
			//    serialize the current DB state and write it to
			//    `backups/pre-wipe-{ISO}.json` so the operator has a
			//    rollback target. If storage isn't configured we refuse
			//    unless the admin explicitly opted out via
			//    confirmSkipSnapshot.
			const storage = getStorage()
			if (!storage) {
				if (!confirmSkipSnapshot) {
					backupLog.warn({ adminId: currentAdminId }, 'wipe refused: storage not configured and confirmSkipSnapshot=false')
					return {
						kind: 'error',
						reason: 'snapshot-required',
						details:
							'Storage is not configured, so no pre-wipe snapshot can be written. Re-run with confirmSkipSnapshot=true to proceed without one (you will have no rollback if the import is bad).',
					}
				}
				backupLog.warn({ adminId: currentAdminId }, 'wipe proceeding without pre-wipe snapshot (confirmSkipSnapshot=true)')
			} else {
				try {
					const snapshot = await captureFullSnapshot()
					const ts = new Date().toISOString().replace(/[:.]/g, '-')
					snapshotKey = `backups/pre-wipe-${ts}.json`
					await storage.upload(snapshotKey, Buffer.from(JSON.stringify(snapshot)), 'application/json')
					backupLog.info({ adminId: currentAdminId, snapshotKey }, 'pre-wipe snapshot written')
				} catch (err) {
					backupLog.error({ adminId: currentAdminId, err }, 'pre-wipe snapshot failed')
					return {
						kind: 'error',
						reason: 'snapshot-failed',
						details: err instanceof Error ? err.message : String(err),
					}
				}
			}

			backupLog.warn({ adminId: currentAdminId, snapshotKey, incomingCounts: countsFromTables(tables) }, 'WIPE-AND-RESTORE starting')
		}

		try {
			const counts = await db.transaction(tx => restoreBackupTablesImpl({ tx, mode, tables }))

			if (mode === 'wipe') {
				backupLog.warn({ adminId: currentAdminId, snapshotKey, counts }, 'WIPE-AND-RESTORE complete')
			} else {
				backupLog.info({ adminId: currentAdminId, counts }, 'merge import complete')
			}
			return { kind: 'ok', counts, snapshotKey }
		} catch (err) {
			backupLog.error({ adminId: currentAdminId, mode, snapshotKey, err }, 'import-failed')
			return {
				kind: 'error',
				reason: 'import-failed',
				details: err instanceof Error ? err.message : String(err),
			}
		}
	})
