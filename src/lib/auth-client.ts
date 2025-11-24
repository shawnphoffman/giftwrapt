import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_BETTER_AUTH_URL || import.meta.env.VITE_SERVER_URL || 'http://localhost:3000',
})

export const { useSession, signIn, signUp, signOut } = authClient
