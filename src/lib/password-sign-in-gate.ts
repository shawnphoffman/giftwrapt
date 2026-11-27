import { and, eq, isNotNull, sql } from 'drizzle-orm'

import { db } from '@/db'
import { account, users } from '@/db/schema'
import type { AppSettings, OidcClientConfig } from '@/lib/settings'
import { getAppSettings } from '@/lib/settings-loader'

// The `passwordSignInAdminsOnly` setting (plan 41). While it is in effect,
// only admins may sign in with a password, on the web and the mobile API,
// email sign-up is closed, and the sign-in page hides the form unless it is
// opened as /sign-in?local=1.
//
// It is in effect only while OIDC actually works: configured in app settings
// AND loaded by the running server. better-auth's `genericOAuth` plugin reads
// its provider at boot, so an OIDC config saved since the last restart has no
// working button yet, and an OIDC config turned off brings passwords back at
// once.

let oidcLoadedAtBoot = false

/** Called once by src/lib/auth.ts after it loads the OIDC provider. */
export function setOidcLoadedAtBoot(loaded: boolean): void {
	oidcLoadedAtBoot = loaded
}

/** The same test auth.ts uses at boot to decide whether to register OIDC. */
export function isOidcConfigured(cfg: OidcClientConfig): boolean {
	if (!cfg.enabled || !cfg.clientId || !cfg.clientSecret) return false
	return cfg.issuerUrl.length > 0 || (cfg.authorizationUrl.length > 0 && cfg.tokenUrl.length > 0)
}

/**
 * OIDC is configured now and was loaded by this server at boot.
 *
 * Loads src/lib/auth.ts first if nothing has yet, so the boot flag is set
 * before it is read. A server function such as the sign-up check can run in a
 * process that hasn't imported auth; without this it would read `false`.
 */
export async function isOidcActive(settings: AppSettings): Promise<boolean> {
	if (!isOidcConfigured(settings.oidcClient)) return false
	await import('@/lib/auth')
	return oidcLoadedAtBoot
}

/** Whether password sign-in is limited to admins right now. */
export async function isPasswordSignInAdminsOnly(settings?: AppSettings): Promise<boolean> {
	const s = settings ?? (await getAppSettings(db))
	if (!s.passwordSignInAdminsOnly) return false
	return await isOidcActive(s)
}

/**
 * Whether the account with this email may sign in with a password. Callers
 * refuse with the same answer as a wrong password, so this never tells anyone
 * whether an email exists or belongs to an admin.
 */
export async function isPasswordSignInAllowedFor(email: string): Promise<boolean> {
	if (!(await isPasswordSignInAdminsOnly())) return true
	const rows = await db
		.select({ role: users.role })
		.from(users)
		.where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
		.limit(1)
	return rows[0]?.role === 'admin'
}

/**
 * Why this admin can't turn the setting on, or null when they can. Turning it
 * on needs working OIDC and a password on the admin doing it, so whoever
 * turns it on can always get back in at /sign-in?local=1. Only checked when
 * the setting goes from off to on, so a passwordless admin can still save
 * other settings while it is on.
 */
export async function passwordAdminsOnlyEnableBlocker(adminUserId: string): Promise<'needs-oidc' | 'needs-password' | null> {
	const current = await getAppSettings(db)
	if (current.passwordSignInAdminsOnly) return null
	if (!(await isOidcActive(current))) return 'needs-oidc'
	if (!(await userHasPassword(adminUserId))) return 'needs-password'
	return null
}

/** Whether this user has a password (a better-auth `credential` account). */
export async function userHasPassword(userId: string): Promise<boolean> {
	const rows = await db
		.select({ id: account.id })
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, 'credential'), isNotNull(account.password)))
		.limit(1)
	return rows.length > 0
}
