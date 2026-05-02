import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { getPublicDependentsImpl } from '@/api/_lists-impl'
import { auth } from '@/lib/auth'

// Dependents (pets, babies, etc.) surfaced in the public feed alongside
// users. Returns one entry per dependent that has at least one public,
// non-giftideas, active list. Mirrors `/api/lists/public` for the user
// side; a separate route avoids growing the existing collection's row
// schema with a discriminator.
export const Route = createFileRoute('/api/lists/public-dependents')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers })
				if (!session?.user.id) {
					throw new Error('Unauthorized')
				}
				const dependents = await getPublicDependentsImpl(session.user.id)
				return json(dependents)
			},
		},
	},
})
