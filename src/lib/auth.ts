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
})
