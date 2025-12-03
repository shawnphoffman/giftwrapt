import { redirect } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'
import { auth } from '../lib/auth'

export const authMiddleware = createMiddleware().server(async ({ next, request }) => {
	const session = await auth.api.getSession({ headers: request.headers })

	if (!session) {
		console.log('redirecting to sign-in')
		throw redirect({ to: '/sign-in' })
	}

	return await next()
})

export const adminAuthMiddleware = createMiddleware().server(async ({ next, request }) => {
	const session = await auth.api.getSession({ headers: request.headers })

	if (!session?.user?.isAdmin) {
		throw redirect({ to: '/' })
	}

	return await next()
})
