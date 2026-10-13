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

import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm'

import { getGiftIdeasForListImpl } from '@/api/_gift-ideas-impl'
import { getItemsForListViewImpl } from '@/api/_items-extra-impl'
import { getListForViewingImpl, getPublicDependentsImpl, getPublicListsImpl } from '@/api/_lists-impl'
import { getPurchaseSummaryImpl } from '@/api/_purchases-impl'
import { getUpcomingHolidaysImpl } from '@/api/_widgets-impl'
import { db, type SchemaDatabase } from '@/db'
import { type BirthMonth, itemAiAnalysis, itemGroups, items, listAddons, lists, users } from '@/db/schema'
import { loadAlreadyHasTitles } from '@/lib/gift-suggestions/feedback'
import { computeRemainingClaimableQuantity } from '@/lib/gifts'
import { visibleItemsWhere } from '@/lib/item-visibility'
import { getViewerAccessLevelForList } from '@/lib/permissions'
import { filterItemsForRestricted } from '@/lib/restricted-filter'

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
	// Things this person already has, as far as the app knows: gifts revealed
	// on lists the viewer can see within the last two years (items with a
	// claim, and off-list gifts), newest first, then titles any gifter marked
	// "They have it" on an AI idea. `when` is the month it was revealed.
	// Never who gave or marked anything (plans 29b, 29c).
	alreadyHas: Array<GiftContextOwned>
	// Things that were wanted but no longer are: items they marked
	// unavailable, and revealed items nobody gave (they hid it themselves).
	// The weakest evidence of taste; never a reason to suggest the same.
	noLongerListed: Array<GiftContextDropped>
}

export type GiftContextOwned = { title: string; source: 'received' | 'marked'; when: string | null }
export type GiftContextDropped = { title: string; reason: 'unavailable' | 'removed'; when: string | null }

const HISTORY_YEARS = 2
const MAX_ALREADY_HAS = 30
const MAX_NO_LONGER_LISTED = 15

function monthOf(d: Date | null): string | null {
	return d ? d.toISOString().slice(0, 7) : null
}

/**
 * What the viewer may know about this person's past on the given lists:
 * revealed gifts (received) and revealed items nobody gave (removed), both
 * within the history window, plus archived off-list gifts. Revealed items
 * pass through the restricted-viewer filter with their claim rows exactly
 * as visible items do, so a restricted viewer never learns of an
 * outsider's gift; a restricted viewer sees only their own addons, as on
 * the list. The claim rows are used only for that split and filter: nothing
 * about them leaves this function. Pending-deletion rows never appear
 * (the 'revealed' predicate excludes them).
 */
async function loadRevealedHistory(args: {
	userId: string
	listIds: Array<number>
	now: Date
	dbx: SchemaDatabase
}): Promise<{ received: Array<{ title: string; at: Date }>; removed: Array<{ title: string; at: Date }> }> {
	const { userId, listIds, now, dbx } = args
	if (listIds.length === 0) return { received: [], removed: [] }
	const cutoff = new Date(now.getTime() - HISTORY_YEARS * 365 * 86_400_000)
	const [listRows, revealed, groups, addons, viewer] = await Promise.all([
		dbx.query.lists.findMany({ where: inArray(lists.id, listIds), columns: { id: true, ownerId: true, subjectDependentId: true } }),
		dbx.query.items.findMany({
			where: and(
				inArray(items.listId, listIds),
				visibleItemsWhere('revealed'),
				// Rows revealed before archivedAt existed date by updatedAt, as on
				// the received-gifts page.
				or(gt(items.archivedAt, cutoff), and(isNull(items.archivedAt), gt(items.updatedAt, cutoff)))
			),
			columns: {
				id: true,
				listId: true,
				title: true,
				quantity: true,
				groupId: true,
				groupSortOrder: true,
				archivedAt: true,
				updatedAt: true,
			},
			with: { gifts: { columns: { gifterId: true, additionalGifterIds: true, quantity: true } } },
		}),
		dbx.query.itemGroups.findMany({ where: inArray(itemGroups.listId, listIds), columns: { id: true, listId: true, type: true } }),
		dbx
			.select({
				listId: listAddons.listId,
				userId: listAddons.userId,
				description: listAddons.description,
				createdAt: listAddons.createdAt,
			})
			.from(listAddons)
			.where(and(inArray(listAddons.listId, listIds), eq(listAddons.isArchived, true), gt(listAddons.createdAt, cutoff))),
		dbx.query.users.findFirst({ where: eq(users.id, userId), columns: { partnerId: true } }),
	])

	const received: Array<{ title: string; at: Date }> = []
	const removed: Array<{ title: string; at: Date }> = []
	for (const list of listRows) {
		const restricted = (await getViewerAccessLevelForList(userId, list, dbx)) === 'restricted'
		const own = revealed.filter(i => i.listId === list.id)
		const visible = restricted
			? filterItemsForRestricted(
					own,
					groups.filter(g => g.listId === list.id),
					userId,
					viewer?.partnerId ?? null
				)
			: own
		for (const i of visible) {
			;(i.gifts.length > 0 ? received : removed).push({ title: i.title, at: i.archivedAt ?? i.updatedAt })
		}
		for (const a of addons) {
			if (a.listId !== list.id) continue
			if (restricted && a.userId !== userId) continue
			received.push({ title: a.description, at: a.createdAt })
		}
	}
	const newestFirst = (a: { at: Date }, b: { at: Date }) => b.at.getTime() - a.at.getTime()
	return { received: received.sort(newestFirst), removed: removed.sort(newestFirst) }
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

	const [purchases, holidays, markedTitles, history] = await Promise.all([
		getPurchaseSummaryImpl(userId, dbx),
		getUpcomingHolidaysImpl({ userId, limit: 10, horizonDays: HOLIDAY_HORIZON_DAYS, now, dbx }),
		loadAlreadyHasTitles(dbx, { kind: person.kind, id: person.id }),
		loadRevealedHistory({ userId, listIds: lists.map(l => l.list.id), now, dbx }),
	])
	const alreadyHas: Array<GiftContextOwned> = [
		...history.received.slice(0, MAX_ALREADY_HAS).map(r => ({ title: r.title, source: 'received' as const, when: monthOf(r.at) })),
		...markedTitles.map(title => ({ title, source: 'marked' as const, when: null })),
	]
	// Unavailable items are still on the list, so they come first; then what
	// they hid without anyone giving it, newest first.
	const noLongerListed: Array<GiftContextDropped> = [
		...lists
			.flatMap(l => l.items)
			.filter(i => i.availability === 'unavailable')
			.map(i => ({ title: i.title, reason: 'unavailable' as const, when: null })),
		...history.removed.map(r => ({ title: r.title, reason: 'removed' as const, when: monthOf(r.at) })),
	].slice(0, MAX_NO_LONGER_LISTED)
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
		context: {
			person,
			lists,
			myGiftIdeas: [...ideasByList.values()],
			myPastGifts,
			spend,
			upcomingHolidays,
			interests,
			alreadyHas,
			noLongerListed,
		},
	}
}
