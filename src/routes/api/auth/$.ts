import { createFileRoute } from '@tanstack/react-router'

import { auth } from '@/lib/auth'
import { createLogger } from '@/lib/logger'

const log = createLogger('api:auth')

export const Route = createFileRoute('/api/auth/$')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				log.debug({ method: 'GET', path: new URL(request.url).pathname }, 'auth passthrough')
				return auth.handler(request)
			},
			POST: async ({ request }) => {
				log.debug({ method: 'POST', path: new URL(request.url).pathname }, 'auth passthrough')
				return auth.handler(request)
			},
		},
	},
})
