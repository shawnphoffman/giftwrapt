import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '@/db'
import { env } from '@/env'
import { admin } from 'better-auth/plugins'

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL || env.SERVER_URL || 'http://localhost:3000',
	secret: env.BETTER_AUTH_SECRET || '',
	database: drizzleAdapter(db, {
		provider: 'pg',
	}),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [tanstackStartCookies(), admin()],
})
