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
	return `#${i.id} ${i.title}${bits.length ? ` (${bits.join(', ')})` : ''}`
}
