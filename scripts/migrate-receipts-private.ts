/**
 * Moves receipts uploaded before private receipt storage into it.
 *
 * Usage (reads DATABASE_URL and the STORAGE_* env like the app):
 *
 *   pnpm receipts:migrate                      # dry run: list what would move
 *   pnpm receipts:migrate --apply              # copy + rewrite, keep the old objects
 *   pnpm receipts:migrate --apply --delete-old # also delete the old public objects
 *
 * Safe to re-run; anything already moved is skipped. See
 * src/lib/receipts-migration.ts for exactly what each step does.
 */

import { parseArgs } from 'node:util'

import { db } from '@/db'
import { env } from '@/env'
import { migrateLegacyReceipts } from '@/lib/receipts-migration'
import { getStorage } from '@/lib/storage/adapter'

async function main() {
	const { values } = parseArgs({ options: { apply: { type: 'boolean' }, 'delete-old': { type: 'boolean' } } })
	const apply = values.apply ?? false
	const deleteOld = values['delete-old'] ?? false
	if (deleteOld && !apply) {
		console.error('--delete-old only makes sense with --apply')
		process.exit(1)
	}

	const storage = getStorage()
	if (!storage) {
		console.error('Storage is not configured (STORAGE_* env); nothing to migrate.')
		process.exit(1)
	}

	const result = await migrateLegacyReceipts({ dbx: db, storage, publicBase: env.STORAGE_PUBLIC_URL, apply, deleteOld })

	console.log(`${result.planned.length} legacy receipt(s) found.`)
	for (const entry of result.planned) console.log(`  ${entry.purchaseKind} ${entry.purchaseId}: ${entry.oldKey}`)
	if (!apply) {
		console.log('Dry run. Re-run with --apply to move them.')
		process.exit(0)
	}
	console.log(`Moved ${result.moved}; old objects deleted: ${result.oldDeleted}.`)
	for (const { entry, reason } of result.skipped)
		console.log(`  skipped ${entry.purchaseKind} ${entry.purchaseId} (${entry.oldKey}): ${reason}`)
	process.exit(result.skipped.length > 0 ? 1 : 0)
}

main().catch(err => {
	console.error(err)
	process.exit(1)
})
