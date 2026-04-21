import { createEnv } from '@t3-oss/env-core'
import { config } from 'dotenv'
import { z } from 'zod'

// Load .env files (same approach as db/index.ts)
// This loads .env, .env.local, etc. in order of precedence
// Only load dotenv on the server side (where process.cwd exists)
if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
	config()
}

export const env = createEnv({
	server: {
		SERVER_URL: z.url().optional(),
		// PORT: z.number().optional(),
		DATABASE_URL: z.url(),
		BETTER_AUTH_SECRET: z.string().min(1),
		BETTER_AUTH_URL: z.url().optional(),
		// Comma-separated list of additional origins that auth requests are
		// allowed from (e.g. "http://192.168.1.137:3888,http://other.lan:3888").
		// BETTER_AUTH_URL is always trusted; this is for self-hosters who reach
		// the same instance via multiple hostnames.
		TRUSTED_ORIGINS: z.string().min(1).optional(),
		// Force-disable the Secure flag on auth cookies. Only set this if you
		// need plain-HTTP origins (LAN IPs, .local hostnames) to log in.
		// Browsers refuse to store Secure cookies set from an HTTP page, so
		// without this the HTTP origin can pass the CSRF check but never
		// receives a session cookie.
		INSECURE_COOKIES: z.stringbool().optional(),
		//
		RESEND_API_KEY: z.string().min(1).optional(),
		RESEND_FROM_EMAIL: z.email().optional(),
		RESEND_FROM_NAME: z.string().optional(),
		RESEND_BCC_ADDRESS: z.email().optional(),
		// Cron job authentication
		CRON_SECRET: z.string().min(1).optional(),
		// Logging. LOG_LEVEL can be changed at runtime (e.g. in docker-compose)
		// without a rebuild. LOG_PRETTY forces human-readable output even in
		// prod; otherwise it defaults to NODE_ENV !== 'production'.
		LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
		LOG_PRETTY: z.stringbool().optional(),
	},

	/**
	 * The prefix that client-side variables must have. This is enforced both at
	 * a type-level and at runtime.
	 */
	clientPrefix: 'VITE_',

	client: {
		VITE_APP_TITLE: z.string().min(1).default('Wish Lists'),
		VITE_SERVER_URL: z.url().optional(),
	},

	/**
	 * What object holds the environment variables at runtime.
	 * For server-side vars, use process.env (loaded by dotenv from .env.local)
	 * For client-side vars, use import.meta.env (loaded by Vite)
	 */
	runtimeEnv: {
		...process.env,
		...import.meta.env,
	},

	/**
	 * By default, this library will feed the environment variables directly to
	 * the Zod validator.
	 *
	 * This means that if you have an empty string for a value that is supposed
	 * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
	 * it as a type mismatch violation. Additionally, if you have an empty string
	 * for a value that is supposed to be a string with a default value (e.g.
	 * `DOMAIN=` in an ".env" file), the default value will never be applied.
	 *
	 * In order to solve these issues, we recommend that all new projects
	 * explicitly specify this option as true.
	 */
	emptyStringAsUndefined: true,
})
