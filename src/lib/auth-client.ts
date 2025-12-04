import { createAuthClient } from 'better-auth/react'
import { adminClient, customSessionClient } from 'better-auth/client/plugins'
import { env } from '@/env'
import type { auth } from '@/lib/auth'

// const baseURL = env.VITE_BETTER_AUTH_URL || env.VITE_SERVER_URL || 'http://localhost:3000'
const baseURL = env.VITE_SERVER_URL || 'http://localhost:3000'
export const authClient = createAuthClient({
	baseURL,
	plugins: [adminClient(), customSessionClient<typeof auth>()],
})

export const { useSession, signIn, signUp, signOut, updateUser } = authClient
