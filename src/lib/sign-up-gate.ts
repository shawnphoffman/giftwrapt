import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { users } from '@/db/schema'
import { getAppSettings } from '@/lib/settings-loader'

/**
 * Whether a visitor may create their own account. A deployment with no admin
 * is always open, so turning sign-ups off can't block first-admin setup or the
 * recovery path of signing up again after losing every admin.
 */
export async function isSignUpOpen(): Promise<boolean> {
	const settings = await getAppSettings(db)
	if (settings.enableSignUps) return true
	const rows = await db
		.select({ c: sql<number>`count(*)::int` })
		.from(users)
		.where(sql`role = 'admin'`)
	return (rows[0]?.c ?? 0) === 0
}
