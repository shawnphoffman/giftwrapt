import { createFileRoute } from '@tanstack/react-router'

import { auth } from '@/lib/auth'

// ===============================
// SSE endpoint for list-view real-time updates
// ===============================
// Lightweight SSE: clients connect, we keep a set of connected
// writers keyed by listId. When a mutation happens (claim, comment,
// item change), the server function calls `notifyListChange(listId)`
// which writes to all connected streams for that list.
//
// This is NOT a DB-level change listener (no Supabase Realtime).
// It's a simple "push invalidation" from our own server functions.

type Writer = WritableStreamDefaultWriter<Uint8Array>

// Global registry of active SSE connections per list.
const listWriters = new Map<number, Set<Writer>>()

export function notifyListChange(listId: number) {
	const writers = listWriters.get(listId)
	if (!writers || writers.size === 0) return

	const encoder = new TextEncoder()
	const message = encoder.encode(`data: ${JSON.stringify({ type: 'invalidate', listId, ts: Date.now() })}\n\n`)

	for (const writer of writers) {
		try {
			writer.write(message)
		} catch {
			// Writer closed — will be cleaned up on close.
			writers.delete(writer)
		}
	}
}

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

				const { readable, writable } = new TransformStream<Uint8Array>()
				const writer = writable.getWriter()

				// Register this writer.
				if (!listWriters.has(listId)) {
					listWriters.set(listId, new Set())
				}
				listWriters.get(listId)!.add(writer)

				// Send initial keepalive.
				const encoder = new TextEncoder()
				writer.write(encoder.encode(`: connected\n\n`))

				// Keepalive ping every 30s to prevent proxy timeouts.
				const keepalive = setInterval(() => {
					try {
						writer.write(encoder.encode(`: ping\n\n`))
					} catch {
						clearInterval(keepalive)
					}
				}, 30_000)

				// Cleanup on close.
				request.signal.addEventListener('abort', () => {
					clearInterval(keepalive)
					listWriters.get(listId)?.delete(writer)
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
