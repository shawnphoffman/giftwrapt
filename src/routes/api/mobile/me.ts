import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { requireMobileSession } from '@/lib/mobile-api'

export const Route = createFileRoute('/api/mobile/me')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const auth = await requireMobileSession(request)
				if (!auth.ok) return auth.response

				const u = auth.session.user
				return json({
					id: u.id,
					name: u.name,
					email: u.email,
					image: u.image,
					role: u.role,
					isAdmin: u.isAdmin,
					isChild: u.isChild,
				})
			},
		},
	},
})
