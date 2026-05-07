import { createFileRoute } from '@tanstack/react-router'

import { auth } from '@/lib/auth'
import { createLogger } from '@/lib/logger'

const sseLog = createLogger('sse:list')

// ===============================
// SSE endpoint for list-view real-time updates
// ===============================
// Lightweight SSE: clients connect, we keep a set of connected
// writers keyed by listId. When a mutation happens (claim, comment,
// item change), the server function calls `notifyListEvent(event)`
// which writes to all connected streams for that list.
//
// This is NOT a DB-level change listener (no Supabase Realtime).
// It's a simple "push invalidation" from our own server functions.

type Writer = WritableStreamDefaultWriter<Uint8Array>

// Typed event taxonomy. Clients switch on `kind` and invalidate only the
// affected query. Payload carries no row data, only ids — restricted-viewer
// filtering still applies on the resulting refetch.
export type ListEvent =
	| { kind: 'claim'; listId: number }
	| { kind: 'item'; listId: number; itemId: number; shape?: 'added' | 'removed' }
	| { kind: 'comment'; listId: number; itemId: number; shape?: 'added' | 'removed' }
	| { kind: 'addon'; listId: number; addonId: number; shape?: 'added' | 'removed' }
	| { kind: 'list'; listId: number; shape?: 'added' | 'removed' | 'archived' }

// Per-list subscribers - used by viewers of a specific list-detail page.
const listWriters = new Map<number, Set<Writer>>()
// Any-list subscribers - used by the home page, where a change to ANY list
// affects the "unclaimed / total" badges and needs to invalidate the grouped
// public-lists query. One stream is cheaper than N per-list streams when a
// page renders many users' lists.
const anyListWriters = new Set<Writer>()

function writeAll(writers: Iterable<Writer>, message: Uint8Array, onFailed: (w: Writer) => void) {
	for (const writer of writers) {
		try {
			writer.write(message)
		} catch {
			onFailed(writer)
		}
	}
}

export function notifyListEvent(event: ListEvent) {
	const { listId } = event
	const perList = listWriters.get(listId)
	if ((!perList || perList.size === 0) && anyListWriters.size === 0) return

	const encoder = new TextEncoder()
	const message = encoder.encode(`data: ${JSON.stringify(event)}\n\n`)

	sseLog.debug({ kind: event.kind, listId, perListSubs: perList?.size ?? 0, anyListSubs: anyListWriters.size }, 'broadcasting list event')

	if (perList) writeAll(perList, message, w => perList.delete(w))
	writeAll(anyListWriters, message, w => anyListWriters.delete(w))
}

// Backwards-compat shim for the scrape-queue runner, which still emits a
// generic "list changed" signal post-scrape. PR 2 replaces this caller with
// a typed `notifyListEvent({ kind: 'item', ... })` once items mutation
// instrumentation lands. Until then, treat the scrape completion as an item
// update so the per-list hook can do the right thing in PR 2 without a
// further server change.
export function notifyListChange(listId: number) {
	notifyListEvent({ kind: 'item', listId, itemId: -1 })
}

export function registerAnyListWriter(writer: Writer) {
	anyListWriters.add(writer)
}

export function unregisterAnyListWriter(writer: Writer) {
	anyListWriters.delete(writer)
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
