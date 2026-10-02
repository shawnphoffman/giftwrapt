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

// ─── Bounded results ────────────────────────────────────────────────────────
//
// No tool returns an unbounded list. Each takes `limit` / `offset` and
// reports what it left out, so the model knows to page or narrow. The
// transport is stateless, so paging is by offset, not a server cursor.

export const MAX_PAGE = 200

export function pageInput(defaultLimit: number) {
	return {
		limit: z.number().int().min(1).max(MAX_PAGE).optional().describe(`How many to return (default ${defaultLimit}, max ${MAX_PAGE})`),
		offset: z.number().int().min(0).optional().describe('Skip this many first, to page through a long result'),
	}
}

export const pageSchema = z.object({
	total: z.number().describe('How many there are in all'),
	returned: z.number(),
	offset: z.number(),
	truncated: z.boolean().describe('true when more remain; call again with a higher offset'),
})

export type Page = z.infer<typeof pageSchema>

export function paginate<T>(
	rows: Array<T>,
	args: { limit?: number; offset?: number },
	defaultLimit: number
): { rows: Array<T>; page: Page } {
	const offset = args.offset ?? 0
	const limit = args.limit ?? defaultLimit
	const slice = rows.slice(offset, offset + limit)
	return { rows: slice, page: { total: rows.length, returned: slice.length, offset, truncated: offset + slice.length < rows.length } }
}

/** The line that tells the model a result was cut short, or '' when it was not. */
export function pageLine(page: Page, noun: string): string {
	if (!page.truncated) return ''
	return `Showing ${page.returned} of ${page.total} ${noun} (from ${page.offset + 1}). Call again with offset ${page.offset + page.returned} for more.`
}

// `summary` (the default) keeps results small: long notes are clipped and
// image URLs dropped. `full` returns everything.
export const detailInput = {
	detail: z.enum(['summary', 'full']).optional().describe('summary (default): notes clipped, no image URLs. full: everything.'),
}

export function clipNotes(notes: string | null): string | null {
	if (!notes) return notes
	const flat = notes.replace(/\s+/gu, ' ').trim()
	return flat.length > NOTES_MAX ? `${flat.slice(0, NOTES_MAX)}…` : flat
}

/** Applies the `detail` level to anything shaped like an item. */
export function atDetail<T extends { notes: string | null; imageUrl: string | null }>(item: T, detail: 'summary' | 'full' | undefined): T {
	if (detail === 'full') return item
	return { ...item, notes: clipNotes(item.notes), imageUrl: null }
}
