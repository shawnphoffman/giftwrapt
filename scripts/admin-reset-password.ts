/**
 * Break-glass password reset.
 *
 * Force-resets the password on an existing user's credential account. Use when
 * someone forgot their password and you (an operator with shell access) need
 * to let them back in without going through email flow.
 *
 *   docker exec -it <container> pnpm admin:reset-password \
 *     --email=you@example.com \
 *     --password='new password here'
 *
 * Uses Better-Auth's internal password hasher via auth.$context so the format
 * matches exactly what signIn expects — don't try to replicate the hashing
 * manually, it'll drift.
 *
 * No env guard: the authentication barrier is shell access. See comment in
 * admin-create.ts for rationale.
 *
 * Fails if the user doesn't exist, or exists but has no credential account
 * (e.g. they only signed in via a social provider — in that case they need
 * to reset through the provider, not here).
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
	if (!credential) {
		die(
			`User ${email} has no credential account (likely signed up via a social provider). ` +
				`Reset through that provider instead, or use admin:create to make a new credential account.`
		)
	}

	console.log(`→ Resetting password for ${email} (user id ${user.id})...`)
	const ctx = await auth.$context
	const newHash = await ctx.password.hash(password)

	await db
		.update(account)
		.set({ password: newHash })
		.where(and(eq(account.userId, user.id), eq(account.providerId, 'credential')))

	// Nuke existing sessions so the old password is immediately dead everywhere.
	// If they're still logged in on another device with a valid session cookie,
	// that's a problem — kill those too.
	const { session } = await import('@/db/schema')
	const killed = await db.delete(session).where(eq(session.userId, user.id)).returning({ id: session.id })

	console.log('')
	console.log(`✓ Password reset for ${email}.`)
	console.log(`    sessions revoked: ${killed.length}`)
}

main()
	.then(() => process.exit(0))
	.catch(err => {
		console.error(err)
		process.exit(1)
	})
