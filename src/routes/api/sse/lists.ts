import { createFileRoute } from '@tanstack/react-router'

import { auth } from '@/lib/auth'
import { createLogger } from '@/lib/logger'

import { registerAnyListWriter, unregisterAnyListWriter } from './list.$listId'

const sseLog = createLogger('sse:any-list')

// ===============================
// SSE endpoint — any list changed
// ===============================
// Fires whenever notifyListChange is called for any listId. The home page
// ("lists for everyone else") subscribes here so the unclaimed/total badges
// stay live when anyone claims or unclaims anywhere, without needing one
// EventSource per visible list.

export const Route = createFileRoute('/api/sse/lists')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers })
				if (!session?.user.id) {
					return new Response('Unauthorized', { status: 401 })
				}

				const { readable, writable } = new TransformStream<Uint8Array>()
				const writer = writable.getWriter()
				registerAnyListWriter(writer)

				sseLog.debug({ userId: session.user.id }, 'sse any-list client connected')

				const encoder = new TextEncoder()
				writer.write(encoder.encode(`: connected\n\n`))

				const keepalive = setInterval(() => {
					try {
						writer.write(encoder.encode(`: ping\n\n`))
					} catch (err) {
						sseLog.debug({ err }, 'keepalive write failed, clearing interval')
						clearInterval(keepalive)
					}
				}, 30_000)

				request.signal.addEventListener('abort', () => {
					sseLog.debug({ userId: session.user.id }, 'sse any-list client disconnected')
					clearInterval(keepalive)
					unregisterAnyListWriter(writer)
					writer.close().catch(() => {})
				})

				return new Response(readable, {
					headers: {
						'Content-Type': 'text/event-stream',
						'Cache-Control': 'no-cache',
						Connection: 'keep-alive',
					},
				})
			},
		},
	},
})
