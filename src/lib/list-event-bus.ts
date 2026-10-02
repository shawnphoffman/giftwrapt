/**
 * The list-event bus: how a committed mutation reaches open SSE streams.
 *
 * Mutations call `notifyListEvent(event)` after their transaction commits.
 * The event goes through a transport, and every instance's transport handler
 * delivers it to the streams connected to that instance, filtered per
 * subscriber by src/lib/list-event-audience.ts.
 *
 * Two subscriber kinds:
 *   - per-list: a list-detail page (gifter, edit, or organize view). Its
 *     audience decision is taken once, when the stream opens.
 *   - any-list: pages that summarize many lists (home, /me, purchases,
 *     recent). Each event is checked against the viewer at send time.
 *
 * The only transport today is in-process, so an event reaches streams held
 * by the same server process: reliable on a long-running host, best-effort
 * on Vercel. The actor never depends on it (see `applyListEventLocally`).
 * `ListEventTransport` is the seam for a cross-instance transport later; the
 * candidates are tracked in the coordination repo's SCRATCHPAD.md.
 */

import { createListAudienceResolver, type ListAudienceDecision, type ListEvent, shouldDeliverListEvent } from '@/lib/list-event-audience'
import { createLogger } from '@/lib/logger'

export type { ListEvent } from '@/lib/list-event-audience'

export type ListEventWriter = WritableStreamDefaultWriter<Uint8Array>

export interface ListEventTransport {
	publish: (event: ListEvent) => void
	/** Registers the local delivery handler. Returns an unsubscribe function. */
	subscribe: (handler: (event: ListEvent) => void) => () => void
}

export function createInProcessTransport(): ListEventTransport {
	const handlers = new Set<(event: ListEvent) => void>()
	return {
		publish: event => {
			for (const handler of handlers) handler(event)
		},
		subscribe: handler => {
			handlers.add(handler)
			return () => handlers.delete(handler)
		},
	}
}

const busLog = createLogger('sse:bus')

const listWriters = new Map<number, Map<ListEventWriter, ListAudienceDecision>>()
const anyListWriters = new Map<ListEventWriter, { viewerId: string }>()
const anyListAudience = createListAudienceResolver()

const transport: ListEventTransport = createInProcessTransport()
transport.subscribe(deliverLocally)

export function notifyListEvent(event: ListEvent): void {
	transport.publish(event)
}

export function addListSubscriber(listId: number, writer: ListEventWriter, decision: ListAudienceDecision): void {
	let writers = listWriters.get(listId)
	if (!writers) {
		writers = new Map()
		listWriters.set(listId, writers)
	}
	writers.set(writer, decision)
}

export function removeListSubscriber(listId: number, writer: ListEventWriter): void {
	const writers = listWriters.get(listId)
	if (!writers) return
	writers.delete(writer)
	if (writers.size === 0) listWriters.delete(listId)
}

export function addAnyListSubscriber(writer: ListEventWriter, viewerId: string): void {
	anyListWriters.set(writer, { viewerId })
}

export function removeAnyListSubscriber(writer: ListEventWriter): void {
	anyListWriters.delete(writer)
}

function writeAll(writers: Iterable<ListEventWriter>, message: Uint8Array, onFailed: (w: ListEventWriter) => void) {
	for (const writer of writers) {
		try {
			writer.write(message)
		} catch {
			onFailed(writer)
		}
	}
}

function deliverLocally(event: ListEvent): void {
	const { listId } = event
	const perList = listWriters.get(listId)
	if ((!perList || perList.size === 0) && anyListWriters.size === 0) return

	const message = new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)

	busLog.debug({ kind: event.kind, listId, perListSubs: perList?.size ?? 0, anyListSubs: anyListWriters.size }, 'broadcasting list event')

	if (perList) {
		const allowed = [...perList].filter(([, decision]) => shouldDeliverListEvent(event, decision)).map(([w]) => w)
		writeAll(allowed, message, w => removeListSubscriber(listId, w))
	}
	if (anyListWriters.size > 0) {
		void deliverToAnyList(event, message).catch(err => busLog.warn({ err, listId }, 'any-list delivery failed'))
	}
}

// Async because each subscriber is checked against the list; publishers fire
// and forget, so a slow permission lookup never holds up a mutation.
async function deliverToAnyList(event: ListEvent, message: Uint8Array) {
	const byViewer = new Map<string, Array<ListEventWriter>>()
	for (const [writer, { viewerId }] of anyListWriters) {
		const group = byViewer.get(viewerId)
		if (group) group.push(writer)
		else byViewer.set(viewerId, [writer])
	}
	const decisions = await anyListAudience.resolveMany(byViewer.keys(), event.listId)
	for (const [viewerId, writers] of byViewer) {
		const decision = decisions.get(viewerId)
		if (!decision || !shouldDeliverListEvent(event, decision)) continue
		writeAll(writers, message, removeAnyListSubscriber)
	}
}
