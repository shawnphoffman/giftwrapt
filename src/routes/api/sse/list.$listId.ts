import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { lists } from '@/db/schema'
import { auth } from '@/lib/auth'
import {
	createListAudienceResolver,
	type ListAudienceDecision,
	type ListEvent,
	resolveListAudience,
	shouldDeliverListEvent,
} from '@/lib/list-event-audience'
import { createLogger } from '@/lib/logger'

export type { ListEvent } from '@/lib/list-event-audience'

const sseLog = createLogger('sse:list')

// ===============================
// SSE endpoint for list-view real-time updates
// ===============================
// Lightweight SSE: clients connect, we keep a set of connected
// writers keyed by listId. When a mutation happens (claim, comment,
// item change), the server function calls `notifyListEvent(event)`
// which writes to every connected stream allowed to see it.
//
// This is NOT a DB-level change listener (no Supabase Realtime).
// It's a simple "push invalidation" from our own server functions.
//
// Delivery is filtered per subscriber (see src/lib/list-event-audience.ts):
// a subscriber must be able to view or edit the list, and the list's
// recipient never receives `claim` or `addon` events.

type Writer = WritableStreamDefaultWriter<Uint8Array>

// Per-list subscribers - used by viewers of a specific list-detail page.
// The audience decision is taken once, at subscribe time.
const listWriters = new Map<number, Map<Writer, ListAudienceDecision>>()
// Any-list subscribers - used by the home page, where a change to ANY list
// affects the "unclaimed / total" badges and needs to invalidate the grouped
// public-lists query. One stream is cheaper than N per-list streams when a
// page renders many users' lists. Keyed to the viewer so each event can be
// checked against the list it is about.
const anyListWriters = new Map<Writer, { viewerId: string }>()
const anyListAudience = createListAudienceResolver()

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

	if (perList) {
		const allowed = [...perList].filter(([, decision]) => shouldDeliverListEvent(event, decision)).map(([w]) => w)
		writeAll(allowed, message, w => perList.delete(w))
	}
	if (anyListWriters.size > 0) {
		void deliverToAnyList(event, message).catch(err => sseLog.warn({ err, listId }, 'any-list delivery failed'))
	}
}

// Async because each subscriber is checked against the list; callers fire
// and forget, so a slow permission lookup never holds up a mutation.
async function deliverToAnyList(event: ListEvent, message: Uint8Array) {
	const byViewer = new Map<string, Array<Writer>>()
	for (const [writer, { viewerId }] of anyListWriters) {
		const group = byViewer.get(viewerId)
		if (group) group.push(writer)
		else byViewer.set(viewerId, [writer])
	}
	const decisions = await anyListAudience.resolveMany(byViewer.keys(), event.listId)
	for (const [viewerId, writers] of byViewer) {
		const decision = decisions.get(viewerId)
		if (!decision || !shouldDeliverListEvent(event, decision)) continue
		writeAll(writers, message, w => anyListWriters.delete(w))
	}
}

export function registerAnyListWriter(writer: Writer, viewerId: string) {
	anyListWriters.set(writer, { viewerId })
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

				// Register this writer.
				if (!listWriters.has(listId)) {
					listWriters.set(listId, new Map())
				}
				listWriters.get(listId)!.set(writer, decision)

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
