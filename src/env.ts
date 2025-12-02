import { config } from 'dotenv'
import { createEnv } from '@t3-oss/env-core'
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
		//
		RESEND_API_KEY: z.string().min(1).optional(),
		RESEND_FROM_EMAIL: z.email().optional(),
		RESEND_FROM_NAME: z.string().optional(),
		RESEND_BCC_ADDRESS: z.email().optional(),
	},

	/**
	 * The prefix that client-side variables must have. This is enforced both at
	 * a type-level and at runtime.
	 */
	clientPrefix: 'VITE_',

	client: {
		VITE_APP_TITLE: z.string().min(1).optional(),
		// VITE_BETTER_AUTH_URL: z.url().optional(),
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
