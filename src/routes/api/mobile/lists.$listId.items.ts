import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { getItemsForListEditImpl } from '@/api/items'
import { jsonError, requireMobileSession } from '@/lib/mobile-api'

export const Route = createFileRoute('/api/mobile/lists/$listId/items')({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const auth = await requireMobileSession(request)
				if (!auth.ok) return auth.response

				const url = new URL(request.url)
				const includeArchived = url.searchParams.get('includeArchived') === 'true'

				const result = await getItemsForListEditImpl({
					userId: auth.session.user.id,
					listId: params.listId,
					includeArchived,
				})

				if (result.kind === 'error') {
					const status = result.reason === 'not-found' ? 404 : 403
					return jsonError(result.reason, status)
				}
				return json({ items: result.items })
			},
		},
	},
})
