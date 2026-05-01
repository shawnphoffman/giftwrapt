import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { getPublicListsImpl } from '@/api/_lists-impl'
import { auth } from '@/lib/auth'

export const Route = createFileRoute('/api/lists/public')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers })
				if (!session?.user.id) {
					throw new Error('Unauthorized')
				}
				const users = await getPublicListsImpl(session.user.id)
				return json(users)
			},
		},
	},
})
