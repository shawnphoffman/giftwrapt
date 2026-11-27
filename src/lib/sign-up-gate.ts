import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { users } from '@/db/schema'
import { isPasswordSignInAdminsOnly } from '@/lib/password-sign-in-gate'
import { getAppSettings } from '@/lib/settings-loader'

/**
 * Whether a visitor may create their own account with email and password. A
 * deployment with no admin is always open, so turning sign-ups off can't block
 * first-admin setup or the recovery path of signing up again after losing
 * every admin. While password sign-in is limited to admins, email sign-up is
 * closed too: the account it made couldn't sign in. People sign up through
 * OIDC instead.
 */
export async function isSignUpOpen(): Promise<boolean> {
	const settings = await getAppSettings(db)
	const open = settings.enableSignUps && !(await isPasswordSignInAdminsOnly(settings))
	if (open) return true
	const rows = await db
		.select({ c: sql<number>`count(*)::int` })
		.from(users)
		.where(sql`role = 'admin'`)
	return (rows[0]?.c ?? 0) === 0
}
