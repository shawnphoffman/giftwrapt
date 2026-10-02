import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { lists } from '@/db/schema'
import { auth } from '@/lib/auth'
import { resolveListAudience } from '@/lib/list-event-audience'
import { addListSubscriber, removeListSubscriber } from '@/lib/list-event-bus'
import { createLogger } from '@/lib/logger'

const sseLog = createLogger('sse:list')

// ===============================
// SSE endpoint for list-view real-time updates
// ===============================
// Opens a stream for one list and registers it on the list-event bus
// (src/lib/list-event-bus.ts), which delivers every event this subscriber is
// allowed to see. Mutations publish with `notifyListEvent` from the bus.

export const Route = createFileRoute('/api/sse/list/$listId')({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const session = await auth.api.getSession({ headers: request.headers })
				if (!session?.user.id) {
					return new Response('Unauthorized', { status: 401 })
				}

				const listId = Number(params.listId)
				if (!Number.isFinite(listId)) {
					return new Response('Invalid list ID', { status: 400 })
				}

				// Authorization, not just authentication: events carry only ids
				// and kinds, but a subscription on someone else's private list
				// would still leak activity timing (including claim activity on
				// a spoiler-protected surface). Same predicates as the list's
				// read paths (gifter view or edit view); 404 for both missing and
				// not-visible so ids can't be probed. See sec-review S3.
				const list = await db.query.lists.findFirst({
					where: eq(lists.id, listId),
					columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
				})
				if (!list) {
					return new Response('Not found', { status: 404 })
				}
				const decision = await resolveListAudience(session.user.id, list)
				if (!decision.canSubscribe) {
					return new Response('Not found', { status: 404 })
				}

				const { readable, writable } = new TransformStream<Uint8Array>()
				const writer = writable.getWriter()

				addListSubscriber(listId, writer, decision)

				sseLog.debug({ listId, userId: session.user.id }, 'sse client connected')

				// Send initial keepalive.
				const encoder = new TextEncoder()
				writer.write(encoder.encode(`: connected\n\n`))

				// Keepalive ping every 30s to prevent proxy timeouts.
				const keepalive = setInterval(() => {
					try {
						writer.write(encoder.encode(`: ping\n\n`))
					} catch (err) {
						sseLog.debug({ err, listId }, 'keepalive write failed, clearing interval')
						clearInterval(keepalive)
					}
				}, 30_000)

				// Cleanup on close.
				request.signal.addEventListener('abort', () => {
					sseLog.debug({ listId, userId: session.user.id }, 'sse client disconnected')
					clearInterval(keepalive)
					removeListSubscriber(listId, writer)
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
