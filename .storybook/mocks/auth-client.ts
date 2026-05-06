/**
 * Aliased in place of `@/lib/auth-client` for Storybook.
 *
 * The real client hits better-auth over HTTP and pulls in `@/env`, which
 * expects server-side env vars to exist. Stories set the signed-in user via
 * the `session` parameter (see `.storybook/preview.tsx`). Default is signed
 * out, which matches what a visitor seeing a public list would experience.
 */

type User = {
	id: string
	name: string | null
	email: string
	image: string | null
	// Optional fields the real session carries (better-auth `user` plugin
	// extensions). Stories opt in by setting them on the session passed
	// to `__setStorybookSession`.
	isChild?: boolean
	partnerId?: string | null
	role?: string
	isAdmin?: boolean
}

type Session = { user: User } | null

let currentSession: Session = null

export function __setStorybookSession(session: Session) {
	currentSession = session
}

export function useSession() {
	return {
		data: currentSession,
		isPending: false,
		error: null,
		refetch: async () => {},
	}
}

export const authClient = {
	useSession,
	signIn: async () => {},
	signUp: async () => {},
	signOut: async () => {},
	updateUser: async () => {},
}

export const signIn = authClient.signIn
export const signUp = authClient.signUp
export const signOut = authClient.signOut
export const updateUser = authClient.updateUser
