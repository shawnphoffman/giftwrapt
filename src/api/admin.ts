import { createServerFn } from '@tanstack/react-start'

import { getAllUsersQuery, getUserDetailsQuery } from '@/db/queries/users'
import { sendTestEmail } from '@/lib/resend'
import { adminAuthMiddleware } from '@/middleware/auth'

//
export const getUsersAsAdmin = createServerFn({
	method: 'GET',
})
	.middleware([adminAuthMiddleware])
	.handler(async () => {
		return await getAllUsersQuery()
	})

//
export const getUserDetailsAsAdmin = createServerFn({
	method: 'GET',
})
	.middleware([adminAuthMiddleware])
	.inputValidator((data: { userId: string }) => data)
	.handler(async ({ data: { userId } }) => {
		return await getUserDetailsQuery(userId)
	})

//
export const sendTestEmailAsAdmin = createServerFn({
	method: 'POST',
})
	.middleware([adminAuthMiddleware])
	.handler(async () => {
		const result = await sendTestEmail()
		return { status: 'success', data: result }
	})
