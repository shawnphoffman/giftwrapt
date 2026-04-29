import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { createItemImpl, CreateItemInputSchema } from '@/api/_items-impl'
import { db } from '@/db'
import { jsonError, requireMobileSession } from '@/lib/mobile-api'

export const Route = createFileRoute('/api/mobile/items')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const auth = await requireMobileSession(request)
				if (!auth.ok) return auth.response

				let body: unknown
				try {
					body = await request.json()
				} catch {
					return jsonError('invalid-json', 400)
				}

				const parsed = CreateItemInputSchema.safeParse(body)
				if (!parsed.success) {
					return json({ error: 'invalid-input', issues: parsed.error.issues }, { status: 400 })
				}

				const result = await createItemImpl({
					db,
					actor: { id: auth.session.user.id },
					input: parsed.data,
				})

				if (result.kind === 'error') {
					const status = result.reason === 'list-not-found' ? 404 : 403
					return jsonError(result.reason, status)
				}
				return json({ item: result.item })
			},
		},
	},
})
