/**
 * Break-glass admin creation.
 *
 * Creates a new user account with role='admin', bypassing the normal signup
 * flow that would only assign 'user' (or 'admin' via the first-admin bootstrap
 * hook in src/lib/auth.ts, which only fires when no admin exists).
 *
 * Intended for use inside a deployed container when you're locked out:
 *
 *   docker exec -it <container> pnpm admin:create \
 *     --email=you@example.com \
 *     --password='correct horse battery staple' \
 *     --name='Your Name'
 *
 * Deliberately has NO env guard (unlike db:seed) — the authentication barrier
 * is "you have shell access to the container." Using it from outside a
 * container is also fine; point DATABASE_URL at the target.
 *
 * Fails loudly if the email already exists; use admin:reset-password if you
 * just need to regain access to an existing account.
 */

import { parseArgs } from 'node:util'

import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { users } from '@/db/schema'
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
			name: { type: 'string' },
		},
		strict: true,
		allowPositionals: false,
	})

	const email = values.email?.trim()
	const password = values.password
	const name = values.name?.trim()

	if (!email) die('Missing --email')
	if (!password) die('Missing --password')
	if (password.length < 8) die('--password must be at least 8 characters')
	if (!name) die('Missing --name')

	// Reject duplicate before we burn a signup attempt.
	const existing = await db.query.users.findFirst({
		where: (u, { eq: eqFn }) => eqFn(u.email, email),
		columns: { id: true, email: true, role: true },
	})
	if (existing) {
		die(
			`User with email ${email} already exists (id=${existing.id}, role=${existing.role}). ` +
				`Use \`pnpm admin:reset-password --email=${email} --password=...\` to reset the password, ` +
				`or promote them by updating role directly.`
		)
	}

	console.log(`→ Creating user ${email}...`)
	const result = await auth.api.signUpEmail({
		body: {
			email,
			password,
			name,
			 
		} as any,
	})
	if (!result.user.id) {
		die('signUpEmail did not return a user id')
	}

	// Patch the role. The first-admin-bootstrap hook in src/lib/auth.ts may have
	// already set it to 'admin' (if the DB had no admins), but we unconditionally
	// set it here so this script always produces an admin regardless of state.
	await db.update(users).set({ role: 'admin' }).where(eq(users.id, result.user.id))

	console.log('')
	console.log(`✓ Admin user created.`)
	console.log(`    id:    ${result.user.id}`)
	console.log(`    email: ${email}`)
	console.log(`    role:  admin`)
}

main()
	.then(() => process.exit(0))
	.catch(err => {
		console.error(err)
		process.exit(1)
	})
