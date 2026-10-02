// Everything a gifter needs to plan a gift for one person, composed from
// the existing gifter-side impls. Nothing here decides who can see what:
// list access, the restricted-viewer filter, and the owner redirect all
// come from `getListForViewingImpl` / `getItemsForListViewImpl`, and gift
// ideas from `getGiftIdeasForListImpl`. This file only gathers and shapes.
//
// Two entry points:
//   getWishlistViewImpl  one list in the gifter view (the MCP get_wishlist tool)
//   getGiftContextImpl   one person: every visible list, the viewer's own
//                        ideas and past gifts for them, and what is coming up
//                        (the MCP get_gift_context tool and the in-app
//                        gift suggester)
//
// Spoiler rule for consumers: `claims` carries other gifters' names because
// the web gifting view shows them, but another gifter's cost and notes are
// always null here. Gift ideas are the viewer's private notes; keep them
// separate from the person's own items wherever this is rendered.

import { eq, inArray } from 'drizzle-orm'

import { getGiftIdeasForListImpl } from '@/api/_gift-ideas-impl'
import { getItemsForListViewImpl } from '@/api/_items-extra-impl'
import { getListForViewingImpl, getPublicDependentsImpl, getPublicListsImpl } from '@/api/_lists-impl'
import { getPurchaseSummaryImpl } from '@/api/_purchases-impl'
import { getUpcomingHolidaysImpl } from '@/api/_widgets-impl'
import { db, type SchemaDatabase } from '@/db'
import { type BirthMonth, itemAiAnalysis, users } from '@/db/schema'
import { computeRemainingClaimableQuantity } from '@/lib/gifts'

export type WishlistClaim = {
	giftId: number
	itemId: number
	quantity: number
	// The viewer or their partner made this claim (as primary or co-gifter).
	byMe: boolean
	gifterNames: Array<string>
	coGifterIds: Array<string>
	// Only present on the viewer's own claims.
	totalCost: string | null
	notes: string | null
}

export type WishlistItem = {
	id: number
	title: string
	url: string | null
	price: string | null
	currency: string | null
	priority: string
	quantity: number
	remaining: number
	availability: string
	notes: string | null
	imageUrl: string | null
	groupId: number | null
	// Position inside an in-order group; null outside one.
	groupSortOrder: number | null
	commentCount: number
	claims: Array<WishlistClaim>
}

export type WishlistAddon = {
	id: number
	listId: number
	description: string
	byMe: boolean
	gifterName: string | null
	url: string | null
	totalCost: string | null
	notes: string | null
}

export type GiftIdeasSource = {
	listId: number
	listName: string
	ideas: Array<{ id: number; title: string; url: string | null; price: string | null; notes: string | null }>
}

export type RecipientRef = { kind: 'user' | 'dependent'; id: string; name: string | null }

export type WishlistView = {
	list: {
		id: number
		name: string
		type: string
		description: string | null
		recipient: RecipientRef
		canEdit: boolean
		revealDate: string | null
	}
	items: Array<WishlistItem>
	groups: Array<{ id: number; type: string; name: string | null; itemIds: Array<number> }>
	offListGifts: Array<WishlistAddon>
	myGiftIdeas: Array<GiftIdeasSource>
}

export type WishlistViewResult = { kind: 'ok'; view: WishlistView } | { kind: 'error'; reason: 'not-found' | 'is-owner' }

async function partnerIdOf(userId: string, dbx: SchemaDatabase): Promise<string | null> {
	const me = await dbx.query.users.findFirst({ where: eq(users.id, userId), columns: { partnerId: true } })
	return me?.partnerId ?? null
}

export async function getWishlistViewImpl(args: { userId: string; listId: number; dbx?: SchemaDatabase }): Promise<WishlistViewResult> {
	const { userId, listId, dbx = db } = args

	const header = await getListForViewingImpl({ userId, listId: String(listId), dbx })
	if (!header) return { kind: 'error', reason: 'not-found' }
	if (header.kind === 'redirect') return { kind: 'error', reason: 'is-owner' }
	const list = header.list

	const viewed = await getItemsForListViewImpl({ userId, listId: String(listId), dbx })
	if (viewed.kind === 'error') return { kind: 'error', reason: 'not-found' }

	const partnerId = await partnerIdOf(userId, dbx)
	const mine = new Set([userId, ...(partnerId ? [partnerId] : [])])
	const isMine = (gifterId: string, coGifters: Array<string> | null): boolean =>
		mine.has(gifterId) || (coGifters ?? []).some(id => mine.has(id))

	const items: Array<WishlistItem> = viewed.items.map(i => ({
		id: i.id,
		title: i.title,
		url: i.url,
		price: i.price,
		currency: i.currency,
		priority: i.priority,
		quantity: i.quantity,
		remaining: computeRemainingClaimableQuantity(i.quantity, i.gifts),
		availability: i.availability,
		notes: i.notes,
		imageUrl: i.imageUrl,
		groupId: i.groupId,
		groupSortOrder: i.groupSortOrder,
		commentCount: i.commentCount,
		claims: i.gifts.map(g => {
			const byMe = isMine(g.gifterId, g.additionalGifterIds)
			return {
				giftId: g.id,
				itemId: g.itemId,
				quantity: g.quantity,
				byMe,
				gifterNames: g.units.map(u => u.label),
				coGifterIds: g.additionalGifterIds ?? [],
				totalCost: byMe ? g.totalCost : null,
				notes: byMe ? g.notes : null,
			}
		}),
	}))

	const ideas = await getGiftIdeasForListImpl({ userId, listId, dbx })
	const myGiftIdeas: Array<GiftIdeasSource> = ideas.sources.map(s => ({
		listId: s.list.id,
		listName: s.list.name,
		ideas: s.items.map(i => ({ id: i.id, title: i.title, url: i.url, price: i.price, notes: i.notes })),
	}))

	const recipient: RecipientRef = list.subjectDependent
		? { kind: 'dependent', id: list.subjectDependent.id, name: list.subjectDependent.name }
		: { kind: 'user', id: list.owner.id, name: list.owner.name ?? list.owner.email }

	return {
		kind: 'ok',
		view: {
			list: {
				id: list.id,
				name: list.name,
				type: list.type,
				description: list.description,
				recipient,
				canEdit: list.canEdit,
				revealDate: list.archiveInfo.effectiveArchiveDate,
			},
			items,
			groups: list.groups.map(g => ({
				id: g.id,
				type: g.type,
				name: g.name,
				itemIds: items.filter(i => i.groupId === g.id).map(i => i.id),
			})),
			offListGifts: list.addons.map(a => ({
				id: a.id,
				listId: a.listId,
				description: a.description,
				byMe: a.userId === userId,
				gifterName: a.user.name ?? a.user.email,
				url: a.url,
				// The list impl has already blanked other gifters' costs.
				totalCost: a.totalCost,
				notes: a.notes,
			})),
			myGiftIdeas,
		},
	}
}

export type GiftContextPastGift = {
	kind: 'claim' | 'addon'
	id: number
	title: string
	listName: string
	cost: number | null
	byPartner: boolean
	asCoGifter: boolean
	createdAt: string
}

export type GiftContextOccasion = {
	kind: 'birthday' | 'christmas' | 'holiday' | 'mothers-day' | 'fathers-day' | 'valentines' | 'anniversary'
	title: string
	// YYYY-MM-DD. Null for a birthday (the tool layer formats month/day).
	date: string | null
	daysUntil: number | null
}

export type GiftContext = {
	person: RecipientRef & { birthMonth: BirthMonth | null; birthDay: number | null }
	// Every list of theirs the viewer can see, in the gifter view.
	lists: Array<Omit<WishlistView, 'myGiftIdeas'>>
	// The viewer's own private ideas for this person, deduplicated across lists.
	myGiftIdeas: Array<GiftIdeasSource>
	// What the viewer (or their partner) already gave or is giving them.
	myPastGifts: Array<GiftContextPastGift>
	spend: { giftCount: number; allTime: number; last12Months: number }
	// Deployment and personal holidays coming up for the viewer. The
	// person's birthday is on `person`.
	upcomingHolidays: Array<GiftContextOccasion>
	// What their visible items are mostly about, from stored enrichment
	// facets. Empty when Intelligence enrichment has not run.
	interests: Array<{ category: string; count: number }>
}

export type GiftContextResult = { kind: 'ok'; context: GiftContext } | { kind: 'error'; reason: 'not-found' | 'is-owner' }

const YEAR_MS = 365 * 24 * 60 * 60 * 1000
const HOLIDAY_HORIZON_DAYS = 90

export async function getGiftContextImpl(args: {
	userId: string
	personId: string
	now: Date
	dbx?: SchemaDatabase
}): Promise<GiftContextResult> {
	const { userId, personId, now, dbx = db } = args
	if (personId === userId) return { kind: 'error', reason: 'is-owner' }

	const [publicUsers, publicDependents] = await Promise.all([getPublicListsImpl(userId), getPublicDependentsImpl(userId, dbx)])
	const asUser = publicUsers.find(u => u.id === personId)
	const asDependent = asUser ? undefined : publicDependents.find(d => d.id === personId)
	const found = asUser ?? asDependent
	if (!found) return { kind: 'error', reason: 'not-found' }

	const person: GiftContext['person'] = asUser
		? { kind: 'user', id: asUser.id, name: asUser.name ?? asUser.email, birthMonth: asUser.birthMonth, birthDay: asUser.birthDay }
		: { kind: 'dependent', id: found.id, name: found.name, birthMonth: found.birthMonth, birthDay: found.birthDay }

	// Primary list first, then the rest in the order the feed returns them.
	const listIds = [...found.lists].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map(l => l.id)

	const lists: GiftContext['lists'] = []
	const ideasByList = new Map<number, GiftIdeasSource>()
	for (const listId of listIds) {
		const result = await getWishlistViewImpl({ userId, listId, dbx })
		// A list the feed named but the view refuses (a race with a
		// permission change) is skipped rather than failing the whole call.
		if (result.kind === 'error') continue
		const { myGiftIdeas, ...view } = result.view
		lists.push(view)
		for (const source of myGiftIdeas) ideasByList.set(source.listId, source)
	}

	const [purchases, holidays] = await Promise.all([
		getPurchaseSummaryImpl(userId, dbx),
		getUpcomingHolidaysImpl({ userId, limit: 10, horizonDays: HOLIDAY_HORIZON_DAYS, now, dbx }),
	])
	const forPerson = purchases.items.filter(p => (p.recipientKind === 'dependent' ? p.subjectDependentId : p.ownerId) === personId)
	const myPastGifts: Array<GiftContextPastGift> = forPerson
		.map(p => ({
			kind: p.type,
			id: p.type === 'claim' ? (p.giftId ?? 0) : (p.addonId ?? 0),
			title: p.title,
			listName: p.listName,
			cost: p.cost,
			byPartner: p.isPartnerPurchase,
			asCoGifter: p.isCoGifter,
			createdAt: p.createdAt.toISOString(),
		}))
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
	const sum = (rows: typeof forPerson): number => Math.round(rows.reduce((s, p) => s + (p.cost ?? 0), 0) * 100) / 100
	const spend = {
		giftCount: forPerson.length,
		allTime: sum(forPerson),
		last12Months: sum(forPerson.filter(p => now.getTime() - p.createdAt.getTime() < YEAR_MS)),
	}

	const upcomingHolidays: Array<GiftContextOccasion> = holidays.map(h => ({
		kind: h.source === 'custom' ? 'holiday' : h.source,
		title: h.title,
		date: h.occurrenceStart.slice(0, 10),
		daysUntil: h.daysUntil,
	}))

	const itemIds = lists.flatMap(l => l.items.map(i => i.id))
	const facets = itemIds.length
		? await dbx.select({ category: itemAiAnalysis.category }).from(itemAiAnalysis).where(inArray(itemAiAnalysis.itemId, itemIds))
		: []
	const counts = new Map<string, number>()
	for (const f of facets) {
		if (!f.category || f.category === 'other') continue
		counts.set(f.category, (counts.get(f.category) ?? 0) + 1)
	}
	const interests = [...counts.entries()]
		.map(([category, count]) => ({ category, count }))
		.sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))

	return {
		kind: 'ok',
		context: { person, lists, myGiftIdeas: [...ideasByList.values()], myPastGifts, spend, upcomingHolidays, interests },
	}
}
