import { afterEach, describe, expect, it } from 'vitest'

import {
	addListSubscriber,
	createInProcessTransport,
	type ListEventWriter,
	notifyListEvent,
	removeListSubscriber,
} from '@/lib/list-event-bus'

// The per-list path is synchronous and decided at subscribe time, so it can be
// driven with fake writers. The any-list path's per-event checks are covered
// against real rows in list-event-audience.integration.test.ts.

function fakeWriter() {
	const received: Array<unknown> = []
	const writer = {
		write: (chunk: Uint8Array) => {
			const text = new TextDecoder().decode(chunk)
			received.push(JSON.parse(text.replace(/^data: /, '').trim()))
			return Promise.resolve()
		},
	} as unknown as ListEventWriter
	return { writer, received }
}

const LIST_ID = 987_654
const cleanups: Array<() => void> = []

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup()
})

function subscribe(decision: { canSubscribe: boolean; isRecipient: boolean }) {
	const sub = fakeWriter()
	addListSubscriber(LIST_ID, sub.writer, decision)
	cleanups.push(() => removeListSubscriber(LIST_ID, sub.writer))
	return sub
}

describe('list-event bus, per-list delivery', () => {
	it('gives a gifter every event and keeps claims and addons from the recipient', () => {
		const gifter = subscribe({ canSubscribe: true, isRecipient: false })
		const recipient = subscribe({ canSubscribe: true, isRecipient: true })

		notifyListEvent({ kind: 'claim', listId: LIST_ID })
		notifyListEvent({ kind: 'addon', listId: LIST_ID, addonId: 1, shape: 'added' })
		notifyListEvent({ kind: 'item', listId: LIST_ID, itemId: 2, shape: 'added' })

		expect(gifter.received.map(e => (e as { kind: string }).kind)).toEqual(['claim', 'addon', 'item'])
		expect(recipient.received.map(e => (e as { kind: string }).kind)).toEqual(['item'])
	})

	it('ignores events for other lists', () => {
		const gifter = subscribe({ canSubscribe: true, isRecipient: false })
		notifyListEvent({ kind: 'claim', listId: LIST_ID + 1 })
		expect(gifter.received).toEqual([])
	})

	it('drops a writer that throws and keeps delivering to the rest', () => {
		const broken = {
			write: () => {
				throw new Error('stream closed')
			},
		} as unknown as ListEventWriter
		addListSubscriber(LIST_ID, broken, { canSubscribe: true, isRecipient: false })
		cleanups.push(() => removeListSubscriber(LIST_ID, broken))
		const gifter = subscribe({ canSubscribe: true, isRecipient: false })

		notifyListEvent({ kind: 'claim', listId: LIST_ID })
		notifyListEvent({ kind: 'claim', listId: LIST_ID })
		expect(gifter.received).toHaveLength(2)
	})
})

describe('createInProcessTransport', () => {
	it('fans a published event out to every handler until it unsubscribes', () => {
		const transport = createInProcessTransport()
		const seen: Array<string> = []
		const off = transport.subscribe(e => seen.push(e.kind))
		transport.publish({ kind: 'list', listId: 1 })
		off()
		transport.publish({ kind: 'list', listId: 1 })
		expect(seen).toEqual(['list'])
	})
})
