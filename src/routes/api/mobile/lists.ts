import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { getMyListsImpl } from '@/api/lists'
import { requireMobileSession } from '@/lib/mobile-api'

export const Route = createFileRoute('/api/mobile/lists')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const auth = await requireMobileSession(request)
				if (!auth.ok) return auth.response

				const result = await getMyListsImpl(auth.session.user.id)
				return json(result)
			},
		},
	},
})
