import type { BetterAuthOptions } from 'better-auth'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, bearer, customSession } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { account, rateLimit, session, users, verification } from '@/db/schema'
import { env } from '@/env'
import { createLogger } from '@/lib/logger'

const trustedOrigins = env.TRUSTED_ORIGINS?.split(',')
	.map(o => o.trim())
	.filter(Boolean)

const authLog = createLogger('auth')

// Guard against accidentally booting an HTTPS deployment with the
// Secure-flag-disabled escape hatch on. INSECURE_COOKIES exists for
// HTTP-only LAN setups (browsers refuse to store Secure cookies on
// HTTP pages); it has no business being on once the server is reached
// via HTTPS, where it just makes session cookies stealable on a MITM.
// Refuse to start instead of silently shipping a misconfigured
// production. See sec-review M1.
const baseUrl = env.BETTER_AUTH_URL || env.SERVER_URL || ''
if (env.INSECURE_COOKIES && baseUrl.startsWith('https://')) {
	throw new Error(
		`INSECURE_COOKIES=true is set but ${env.BETTER_AUTH_URL ? 'BETTER_AUTH_URL' : 'SERVER_URL'} is HTTPS (${baseUrl}). Drop one of them; the Secure flag must be on for HTTPS deployments.`
	)
}
if (env.INSECURE_COOKIES) {
	authLog.warn('INSECURE_COOKIES=true: auth cookies will be sent without the Secure flag. Only safe for plain-HTTP dev / LAN deployments.')
}

// Map LOG_LEVEL to the narrower set better-auth accepts. 'fatal' collapses to
// 'error', 'trace' to 'debug', 'silent' disables entirely.
const betterAuthLevel: 'info' | 'warn' | 'error' | 'debug' | undefined =
	env.LOG_LEVEL === 'silent' ? undefined : env.LOG_LEVEL === 'fatal' ? 'error' : env.LOG_LEVEL === 'trace' ? 'debug' : env.LOG_LEVEL

const options = {
	baseURL: env.BETTER_AUTH_URL || env.SERVER_URL || 'http://localhost:3000',
	// Required by the env zod schema (`min(1)`); no `|| ''` fallback so a
	// future refactor that imports `auth` before env validation runs (or
	// strips the schema check) crashes loudly instead of silently booting
	// with an empty HMAC secret. See sec-review H7.
	secret: env.BETTER_AUTH_SECRET,
	// Pipe better-auth's internal logs into pino so auth warnings/errors show
	// up alongside the rest of the app output and honor LOG_LEVEL.
	logger: {
		disabled: env.LOG_LEVEL === 'silent',
		level: betterAuthLevel,
		log: (level: 'info' | 'warn' | 'error' | 'debug', message: string, ...args: Array<unknown>) => {
			authLog[level]({ args: args.length ? args : undefined }, message)
		},
	},
	...(trustedOrigins?.length ? { trustedOrigins } : {}),
	...(env.INSECURE_COOKIES ? { advanced: { useSecureCookies: false } } : {}),
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: {
			user: users,
			session: session,
			account: account,
			verificationToken: verification,
			rateLimit: rateLimit,
		},
	}),
	emailAndPassword: {
		enabled: true,
	},
	// CSRF posture (sec-review L6): better-auth defaults to
	// `sameSite: 'lax'`, `httpOnly: true`, `secure` (when HTTPS) on the
	// session cookie, and we don't override any of those. Cross-origin
	// POSTs strip the cookie -> the auth middleware refuses the call,
	// which is the entire CSRF defense for our server functions. Don't
	// enable `crossSubDomainCookies` or override cookie attributes
	// without revisiting the strategy in docs/contributing.md.
	//
	// Rate limit auth-related routes (sign-in, sign-up, password change,
	// session reads). Better-auth applies stricter caps to sensitive
	// endpoints automatically; this enables the framework's in-memory
	// limiter so that's effective. See sec-review H2.
	rateLimit: {
		enabled: true,
		// 'database' so the counter is shared across instances on
		// Vercel / Railway / Render. Memory storage was a footgun: the
		// per-instance counters mean a user gets a fresh budget on every
		// cold start, and on serverless that's effectively no limit at
		// all. The `rateLimit` table is provisioned in
		// `src/db/schema/auth.ts`.
		storage: 'database',
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
	// `bearer()` lets non-browser clients (e.g. the iOS companion app) hold
	// an `Authorization: Bearer <token>` instead of a session cookie. Web
	// flows continue to use the cookie set by `tanstackStartCookies()`;
	// both auth modes are accepted by `auth.api.getSession`.
	plugins: [tanstackStartCookies(), admin(), bearer()],
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
			birthYear: {
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
			// 24h upper bound on the encrypted session cookie. Combined
			// with `refreshCache.updateAge: 10m` (active users get
			// re-checked against the DB every 10 minutes anyway), this is
			// the worst-case staleness window for an idle user's role /
			// status. Was 7d before sec-review H8; shorter caps the
			// blast radius of a stolen-but-idle cookie and of a recently
			// demoted account that hasn't pinged the server yet.
			maxAge: 60 * 60 * 24, // 24 hours
			refreshCache: {
				updateAge: 60 * 10, // Refresh against DB every 10 minutes
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
			birthYear: {
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
		// freshAge is intentionally left at 0: better-auth's password-
		// change flow requires the current password as a parameter, and
		// profile edits (name / birthday / partner) go through
		// `auth.api.updateUser` which would fail with "session expired"
		// for any non-admin user logged in for >freshAge. See sec-review
		// H8 for the assessment.
		freshAge: 0,
		cookieCache: {
			enabled: true,
			// Mirrors `options.session.cookieCache.maxAge` above; see
			// the explanation there. Both copies are merged by
			// customSession.
			maxAge: 60 * 60 * 24, // 24 hours
			refreshCache: {
				updateAge: 60 * 10, // Refresh against DB every 10 minutes
			},
		},
	},
})
