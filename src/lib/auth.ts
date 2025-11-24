import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '@/db'
import { env } from '@/env'

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: 'pg',
	}),
	emailAndPassword: {
		enabled: true,
	},
	baseURL: env.BETTER_AUTH_URL || env.SERVER_URL || 'http://localhost:3000',
	secret: env.BETTER_AUTH_SECRET || '',
	plugins: [tanstackStartCookies()],
})
