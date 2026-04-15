import type { BetterAuthOptions } from 'better-auth'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, customSession } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { account, session, users, verification } from '@/db/schema'
import { env } from '@/env'

const options = {
	baseURL: env.BETTER_AUTH_URL || env.SERVER_URL || 'http://localhost:3000',
	secret: env.BETTER_AUTH_SECRET || '',
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: {
			user: users,
			session: session,
			account: account,
			verificationToken: verification,
		},
	}),
	emailAndPassword: {
		enabled: true,
	},
	// First-admin bootstrap: if no admin exists yet, the next signup becomes one.
	// Covers the fresh-deploy case (empty DB) and also the recovery case where
	// an operator intentionally demotes/deletes every admin to rebootstrap.
	// There's a theoretical race if two users sign up simultaneously on a
	// zero-admin DB; not worth an advisory lock for this.
	databaseHooks: {
		user: {
			create: {
				before: async user => {
					const rows = await db
						.select({ c: sql<number>`count(*)::int` })
						.from(users)
						.where(sql`role = 'admin'`)
					const adminCount = rows[0]?.c ?? 0
					if (adminCount === 0) {
						return { data: { ...user, role: 'admin' } }
					}
					return { data: user }
				},
			},
		},
	},
	plugins: [tanstackStartCookies(), admin()],
	user: {
		modelName: 'user',
		fields: {
			// name: 'displayName',
		},
		additionalFields: {
			role: {
				type: 'string',
				required: true,
				input: true,
			},
			birthMonth: {
				type: 'string',
				required: false,
				input: true,
			},
			birthDay: {
				type: 'number',
				required: false,
				input: true,
			},
			image: {
				type: 'string',
				required: false,
				input: true,
			},
			partnerId: {
				type: 'string',
				required: false,
				input: true,
			},
		},
	},
	session: {
		cookieCache: {
			enabled: true,
			maxAge: 60 * 60 * 24 * 7, // 7 days
			refreshCache: {
				updateAge: 60 * 60 * 24, // Refresh when 1 day remains (refresh at 6 days)
			},
		},
	},
} satisfies BetterAuthOptions

export const auth = betterAuth({
	...options,
	plugins: [
		...options.plugins,
		// eslint-disable-next-line @typescript-eslint/require-await
		customSession(async ({ user, session: localSession }) => {
			return {
				user: {
					...user,
					isAdmin: user.role === 'admin',
					isChild: user.role === 'child',
				},
				session: localSession,
			}
		}, options),
	],
	user: {
		modelName: 'user',
		fields: {
			// name: 'displayName',
		},
		additionalFields: {
			role: {
				type: 'string',
				required: true,
				input: true,
			},
			birthMonth: {
				type: 'string',
				required: false,
				input: true,
			},
			birthDay: {
				type: 'number',
				required: false,
				input: true,
			},
			image: {
				type: 'string',
				required: false,
				input: true,
			},
			partnerId: {
				type: 'string',
				required: false,
				input: true,
			},
		},
	},
	session: {
		freshAge: 0,
		cookieCache: {
			enabled: true,
			maxAge: 60 * 60 * 24 * 7, // 7 days
			refreshCache: {
				updateAge: 60 * 60 * 24, // Refresh when 1 day remains (refresh at 6 days)
			},
		},
	},
})
