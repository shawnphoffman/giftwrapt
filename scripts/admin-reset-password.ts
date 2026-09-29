/**
 * Break-glass password reset.
 *
 * Force-resets an existing user's password. Use when someone forgot their
 * password and you (an operator with shell access) need to let them back in
 * without going through email flow.
 *
 * The runtime image ships the bundled CLI, not pnpm, so invoke the built
 * script directly (from a source checkout, `pnpm admin:reset-password`
 * with the same flags works):
 *
 *   docker exec -it <container> node .output/scripts/admin-reset-password.mjs \
 *     --email=you@example.com \
 *     --password='new password here'
 *
 * Uses Better-Auth's internal password hasher via auth.$context so the format
 * matches exactly what signIn expects - don't try to replicate the hashing
 * manually, it'll drift.
 *
 * No env guard: the authentication barrier is shell access. See comment in
 * admin-create.ts for rationale.
 *
 * Fails if the user doesn't exist. A user with no credential account gets
 * one, the same as better-auth's own reset flow does. That covers users who
 * only ever signed in through SSO, and every user after an admin
 * wipe-and-restore: credentials aren't in the backup and cascade away with
 * the users, so without this the deployment has no way back in when email
 * and SSO aren't configured.
 */

import { parseArgs } from 'node:util'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db'
import { account } from '@/db/schema'
import { auth } from '@/lib/auth'

function die(msg: string): never {
	console.error(`✗ ${msg}`)
	process.exit(1)
}

async function main() {
	const { values } = parseArgs({
		options: {
			email: { type: 'string' },
			password: { type: 'string' },
		},
		strict: true,
		allowPositionals: false,
	})

	const email = values.email?.trim()
	const password = values.password

	if (!email) die('Missing --email')
	if (!password) die('Missing --password')
	if (password.length < 8) die('--password must be at least 8 characters')

	const user = await db.query.users.findFirst({
		where: (u, { eq: eqFn }) => eqFn(u.email, email),
		columns: { id: true, email: true, role: true },
	})
	if (!user) {
		die(`No user found with email ${email}.`)
	}

	const credential = await db.query.account.findFirst({
		where: (a, { eq: eqFn, and: andFn }) => andFn(eqFn(a.userId, user.id), eqFn(a.providerId, 'credential')),
		columns: { id: true },
	})

	console.log(`→ ${credential ? 'Resetting' : 'Setting'} password for ${email} (user id ${user.id})...`)
	const ctx = await auth.$context
	const newHash = await ctx.password.hash(password)

	if (credential) {
		await db
			.update(account)
			.set({ password: newHash })
			.where(and(eq(account.userId, user.id), eq(account.providerId, 'credential')))
	} else {
		// Same shape better-auth's resetPassword writes when no credential
		// account exists, via its adapter so ids stay in better-auth's format.
		await ctx.internalAdapter.createAccount({ userId: user.id, providerId: 'credential', accountId: user.id, password: newHash })
	}

	// Nuke existing sessions so the old password is immediately dead everywhere.
	// If they're still logged in on another device with a valid session cookie,
	// that's a problem - kill those too.
	const { session } = await import('@/db/schema')
	const killed = await db.delete(session).where(eq(session.userId, user.id)).returning({ id: session.id })

	console.log('')
	console.log(`✓ Password ${credential ? 'reset' : 'set (new credential account)'} for ${email}.`)
	console.log(`    sessions revoked: ${killed.length}`)
}

main()
	.then(() => process.exit(0))
	.catch(err => {
		console.error(err)
		process.exit(1)
	})
