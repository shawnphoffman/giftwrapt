// Output shapes shared by several tool families, so an item looks the
// same whether it came from get_list, add_item, or update_item. Owner
// view only: nothing here ever carries claim data.

import { z } from 'zod'

import { availabilityEnumValues, type Item, priorityEnumValues } from '@/db/schema'

import { formatPrice } from './format'

export const itemSchema = z.object({
	id: z.number(),
	listId: z.number(),
	title: z.string(),
	url: z.string().nullable(),
	price: z.string().nullable(),
	priceFormatted: z.string().nullable(),
	currency: z.string().nullable(),
	priority: z.enum(priorityEnumValues),
	quantity: z.number(),
	availability: z.enum(availabilityEnumValues),
	notes: z.string().nullable(),
	imageUrl: z.string().nullable(),
	groupId: z.number().nullable(),
	isArchived: z.boolean().describe('true once the recipient has revealed (received) it'),
	commentCount: z.number(),
	createdAt: z.string(),
	updatedAt: z.string(),
})

export type ItemShape = z.infer<typeof itemSchema>

export function toItemShape(item: Item, commentCount = 0): ItemShape {
	return {
		id: item.id,
		listId: item.listId,
		title: item.title,
		url: item.url,
		price: item.price,
		priceFormatted: formatPrice(item.price, item.currency),
		currency: item.currency,
		priority: item.priority,
		quantity: item.quantity,
		availability: item.availability,
		notes: item.notes,
		imageUrl: item.imageUrl,
		groupId: item.groupId,
		isArchived: item.isArchived,
		commentCount,
		createdAt: item.createdAt.toISOString(),
		updatedAt: item.updatedAt.toISOString(),
	}
}

export function itemLine(i: ItemShape): string {
	const bits = [
		i.priceFormatted,
		i.priority !== 'normal' ? i.priority : '',
		i.quantity > 1 ? `qty ${i.quantity}` : '',
		i.availability === 'unavailable' ? 'unavailable' : '',
		i.groupId ? `group ${i.groupId}` : '',
		i.isArchived ? 'received' : '',
	].filter(Boolean)
	return `#${i.id} ${i.title}${bits.length ? ` (${bits.join(', ')})` : ''}${linkAndNotes(i.url, i.notes)}`
}

const NOTES_MAX = 200

/** The link and (clipped) notes suffix shared by owner-view and gifter-view item lines. */
export function linkAndNotes(url: string | null, notes: string | null): string {
	const note = notes?.replace(/\s+/gu, ' ').trim()
	const clipped = note && note.length > NOTES_MAX ? `${note.slice(0, NOTES_MAX)}…` : note
	return `${url ? ` ${url}` : ' [no link]'}${clipped ? ` Notes: ${clipped}` : ''}`
}

const GROUP_RULE: Record<string, string> = { or: 'pick one', order: 'buy in order' }

export function groupLine(g: { id: number; type: string; name: string | null; itemIds: Array<number> }): string {
	return `Group #${g.id}${g.name ? ` "${g.name}"` : ''} (${GROUP_RULE[g.type] ?? g.type}): ${g.itemIds.length ? g.itemIds.map(id => `#${id}`).join(', ') : 'empty'}`
}
