// Picks for reminder emails: up to three things still open on a person's
// lists, so a "Mother's Day is in 7 days" email says what to do, not
// only that a date is near. No model call; this is `rankPicks`.
//
// Everything is read as the email's reader through the gifter-view impl,
// so list access and the restricted-viewer filter apply. An email is a
// gifter-side surface, but only for the reader it was built for: never
// attach these picks to a copy sent to anyone else (a guardian copy can
// land on the very person the gift is for).

import { and, desc, eq, isNull, notInArray } from 'drizzle-orm'

import { getWishlistViewImpl } from '@/api/_gift-context-impl'
import type { SchemaDatabase } from '@/db'
import { lists } from '@/db/schema'
import { resolveEmailImages } from '@/lib/email-images'
import { type PickGroup, type PickItem, rankPicks } from '@/lib/gift-picks'

export type ReminderPerson = { kind: 'user' | 'dependent'; id: string; name: string }

export type ReminderPickItem = {
	title: string
	price: string | null
	// App-relative link to the item on its list.
	path: string
	// Mail-safe image URL, or null for the placeholder.
	imageUrl: string | null
}

export type ReminderPickGroup = { personName: string; items: Array<ReminderPickItem> }

const MAX_LISTS_PER_PERSON = 5
const PICKS_PER_PERSON = 3

async function picksForPerson(db: SchemaDatabase, viewerId: string, person: ReminderPerson): Promise<Array<PickItem & { listId: number }>> {
	const candidates = await db
		.select({ id: lists.id })
		.from(lists)
		.where(
			and(
				person.kind === 'dependent'
					? eq(lists.subjectDependentId, person.id)
					: and(eq(lists.ownerId, person.id), isNull(lists.subjectDependentId)),
				eq(lists.isActive, true),
				notInArray(lists.type, ['giftideas', 'todos'])
			)
		)
		.orderBy(desc(lists.isPrimary), lists.id)
		.limit(MAX_LISTS_PER_PERSON)

	const items: Array<PickItem & { listId: number }> = []
	const groups: Array<PickGroup> = []
	for (const { id } of candidates) {
		// The view impl is the permission check: a list the reader cannot
		// see comes back as an error and contributes nothing.
		const view = await getWishlistViewImpl({ userId: viewerId, listId: id, dbx: db })
		if (view.kind === 'error') continue
		for (const g of view.view.groups) if (g.type === 'or' || g.type === 'order') groups.push({ id: g.id, type: g.type })
		for (const i of view.view.items) {
			items.push({
				listId: id,
				id: i.id,
				title: i.title,
				price: i.price,
				currency: i.currency,
				priority: i.priority as PickItem['priority'],
				quantity: i.quantity,
				claimedQuantity: i.quantity - i.remaining,
				availability: i.availability as PickItem['availability'],
				groupId: i.groupId,
				groupSortOrder: i.groupSortOrder,
				url: i.url,
				imageUrl: i.imageUrl,
			})
		}
	}
	const listOf = new Map(items.map(i => [i.id, i.listId]))
	return rankPicks(items, groups, { limit: PICKS_PER_PERSON }).map(p => ({ ...p.item, listId: listOf.get(p.item.id) ?? 0 }))
}

/**
 * Picks for each person a reminder is about, as `viewerId` would see
 * them. People with nothing open (or nothing the reader can see) are
 * left out, so an empty result means "send the email as it was".
 */
export async function loadReminderPicks(args: {
	db: SchemaDatabase
	viewerId: string
	people: ReadonlyArray<ReminderPerson>
}): Promise<Array<ReminderPickGroup>> {
	const perPerson: Array<{ person: ReminderPerson; picks: Array<PickItem & { listId: number }> }> = []
	for (const person of args.people) {
		if (person.kind === 'user' && person.id === args.viewerId) continue
		const picks = await picksForPerson(args.db, args.viewerId, person)
		if (picks.length) perPerson.push({ person, picks })
	}
	if (perPerson.length === 0) return []

	const images = await resolveEmailImages(perPerson.flatMap(p => p.picks.map(i => i.imageUrl)))
	return perPerson.map(({ person, picks }) => ({
		personName: person.name,
		items: picks.map(i => ({
			title: i.title,
			price: i.price,
			path: `/lists/${i.listId}#item-${i.id}`,
			imageUrl: i.imageUrl ? (images.get(i.imageUrl) ?? null) : null,
		})),
	}))
}
