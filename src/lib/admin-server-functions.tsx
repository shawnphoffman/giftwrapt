import { createServerFn, createMiddleware } from '@tanstack/react-start'
import { db } from '@/db'
import { auth } from '@/lib/auth'
import { asc } from 'drizzle-orm'
import { user } from '@/db/schema'
import { sendTestEmail } from '@/lib/resend'

// TODO Refactor all of this

/**
 * Gets the current admin user from the request context.
 * Throws appropriate errors if not authenticated or not admin.
 */
async function getAdminUser(request: Request) {
	// Get current session
	const session = await auth.api.getSession({
		headers: request.headers,
	})

	// Require authentication
	if (!session?.user?.id) {
		throw new Error('Unauthorized')
	}

	// Check if user is admin
	const currentUser = await db.query.user.findFirst({
		where: (users, { eq }) => eq(users.id, session.user.id),
	})

	if (!currentUser?.isAdmin) {
		throw new Error('Forbidden')
	}

	return currentUser
}

/**
 * Middleware that ensures the user is authenticated and is an admin.
 * Throws an error if not authenticated or not admin, preventing the handler from running.
 */
export const adminAuthMiddleware = createMiddleware().server(async ({ next, request }) => {
	// This will throw if not authenticated or not admin
	await getAdminUser(request)
	// If we get here, user is authenticated and is admin
	return next()
})

/**
 * Server function to get all users (admin only)
 */
export const getAdminUsers = createServerFn({
	method: 'GET',
})
	.middleware([adminAuthMiddleware])
	.handler(async ({}) => {
		// Fetch all users
		const users = await db.query.user.findMany({
			orderBy: [asc(user.name), asc(user.email)],
		})

		// Convert dates to ISO strings for JSON serialization
		return users.map(u => ({
			id: u.id,
			email: u.email,
			name: u.name,
			role: u.role,
			image: u.image,
			isAdmin: u.isAdmin,
			createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
			updatedAt: u.updatedAt instanceof Date ? u.updatedAt.toISOString() : u.updatedAt,
		}))
	})

/**
 * Server function to send a test email (admin only)
 */
export const sendAdminTestEmail = createServerFn({
	method: 'POST',
})
	.middleware([adminAuthMiddleware])
	.handler(async () => {
		const result = await sendTestEmail()
		return { status: 'success', data: result }
	})
