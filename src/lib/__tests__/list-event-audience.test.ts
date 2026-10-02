import { describe, expect, it } from 'vitest'

import { isListRecipient, type ListEvent, shouldDeliverListEvent } from '../list-event-audience'

const events: Record<ListEvent['kind'], ListEvent> = {
	claim: { kind: 'claim', listId: 1 },
	addon: { kind: 'addon', listId: 1, addonId: 2, shape: 'added' },
	item: { kind: 'item', listId: 1, itemId: 3, shape: 'added' },
	comment: { kind: 'comment', listId: 1, itemId: 3 },
	list: { kind: 'list', listId: 1, shape: 'archived' },
}

describe('isListRecipient', () => {
	it('is the owner of a regular list', () => {
		expect(isListRecipient('u1', { ownerId: 'u1', subjectDependentId: null })).toBe(true)
	})

	it('is nobody signed in on a dependent list (the owner is a guardian who gifts)', () => {
		expect(isListRecipient('u1', { ownerId: 'u1', subjectDependentId: 'dep-1' })).toBe(false)
	})

	it('is never a non-owner', () => {
		expect(isListRecipient('u2', { ownerId: 'u1', subjectDependentId: null })).toBe(false)
	})
})

describe('shouldDeliverListEvent', () => {
	it('never delivers claim or addon events to the recipient', () => {
		const recipient = { canSubscribe: true, isRecipient: true }
		expect(shouldDeliverListEvent(events.claim, recipient)).toBe(false)
		expect(shouldDeliverListEvent(events.addon, recipient)).toBe(false)
	})

	it('delivers item, comment, and list events to the recipient', () => {
		const recipient = { canSubscribe: true, isRecipient: true }
		expect(shouldDeliverListEvent(events.item, recipient)).toBe(true)
		expect(shouldDeliverListEvent(events.comment, recipient)).toBe(true)
		expect(shouldDeliverListEvent(events.list, recipient)).toBe(true)
	})

	it('delivers every kind to a gifter who can see the list', () => {
		const gifter = { canSubscribe: true, isRecipient: false }
		for (const event of Object.values(events)) expect(shouldDeliverListEvent(event, gifter)).toBe(true)
	})

	it('delivers nothing to someone who cannot see or edit the list', () => {
		const outsider = { canSubscribe: false, isRecipient: false }
		for (const event of Object.values(events)) expect(shouldDeliverListEvent(event, outsider)).toBe(false)
	})
})
