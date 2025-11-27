import { createAuthClient } from 'better-auth/react'
import { adminClient } from 'better-auth/client/plugins'
import { env } from '@/env'

const baseURL = env.VITE_BETTER_AUTH_URL || env.VITE_SERVER_URL || 'http://localhost:3000'
export const authClient = createAuthClient({
	baseURL,
	plugins: [adminClient()],
})

export const { useSession, signIn, signUp, signOut } = authClient
