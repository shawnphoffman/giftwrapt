// Gifter-side tools: the one surface where claims are visible, because the
// user is shopping for someone else. Everything here goes through the same
// impls as the web gifting view, so the owner / restricted-viewer rules are
// enforced by core, not re-derived.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { copyGiftIdeaToAddonImpl, getGiftIdeasForListImpl } from '@/api/_gift-ideas-impl'
import {
	claimItemGiftImpl,
	setContributionSplitImpl,
	unclaimItemGiftImpl,
	updateCoGiftersImpl,
	updateItemGiftImpl,
} from '@/api/_gifts-impl'
import { getItemsForListViewImpl } from '@/api/_items-extra-impl'
import { createListAddonImpl, deleteListAddonImpl, updateListAddonImpl } from '@/api/_list-addons-impl'
import { getListForViewingImpl, getPublicDependentsImpl, getPublicListsImpl } from '@/api/_lists-impl'
import { getPurchaseSummaryImpl } from '@/api/_purchases-impl'
import { giftedItems, items, type ListAddon, users } from '@/db/schema'
import { computeRemainingClaimableQuantity } from '@/lib/gifts'

import type { ToolContext } from '../context'
import { toolError, toolOk } from '../errors'
import { formatPrice, lines, plural } from '../format'
import { defineTool } from '../server'

const money = z
	.string()
	.regex(/^\d+(\.\d{1,2})?$/u)
	.describe('Amount as text, e.g. "24.99"')

const claimSchema = z.object({
	giftId: z.number(),
	itemId: z.number(),
	quantity: z.number(),
	byMe: z.boolean().describe('The user or their partner made this claim'),
	gifterNames: z.array(z.string()).describe('Who is giving it (households are merged)'),
	coGifterIds: z.array(z.string()),
	totalCost: z.string().nullable().describe('Only present on the user’s own claims'),
	notes: z.string().nullable().describe('Only present on the user’s own claims'),
})

const wishlistItemSchema = z.object({
	id: z.number(),
	title: z.string(),
	url: z.string().nullable(),
	price: z.string().nullable(),
	priceFormatted: z.string().nullable(),
	currency: z.string().nullable(),
	priority: z.string(),
	quantity: z.number(),
	remaining: z.number().describe('How many can still be claimed'),
	availability: z.string(),
	notes: z.string().nullable(),
	imageUrl: z.string().nullable(),
	groupId: z.number().nullable(),
	commentCount: z.number(),
	claims: z.array(claimSchema),
})

const addonSchema = z.object({
	id: z.number(),
	listId: z.number(),
	description: z.string(),
	byMe: z.boolean(),
	gifterName: z.string().nullable(),
	url: z.string().nullable(),
	totalCost: z.string().nullable(),
	notes: z.string().nullable(),
})

const giftSchema = z.object({
	id: z.number(),
	itemId: z.number(),
	quantity: z.number(),
	totalCost: z.string().nullable(),
	notes: z.string().nullable(),
	trackingNumber: z.string().nullable(),
	coGifterIds: z.array(z.string()),
})

type AddonLike = Pick<ListAddon, 'id' | 'listId' | 'userId' | 'description' | 'totalCost' | 'notes' | 'url'>

function toAddonShape(a: AddonLike, viewerId: string, gifterName: string | null): z.infer<typeof addonSchema> {
	return {
		id: a.id,
		listId: a.listId,
		description: a.description,
		byMe: a.userId === viewerId,
		gifterName,
		url: a.url,
		totalCost: a.totalCost,
		notes: a.notes,
	}
}

async function partnerIdOf(userId: string, ctx: ToolContext): Promise<string | null> {
	const me = await ctx.dbx.query.users.findFirst({ where: eq(users.id, userId), columns: { partnerId: true } })
	return me?.partnerId ?? null
}

/** The list to shop from for a person: their primary list, else their first visible one. */
async function resolveListForPerson(personId: string, ctx: ToolContext): Promise<number | null> {
	const [usersList, dependents] = await Promise.all([
		getPublicListsImpl(ctx.actor.userId),
		getPublicDependentsImpl(ctx.actor.userId, ctx.dbx),
	])
	const person = usersList.find(u => u.id === personId) ?? dependents.find(d => d.id === personId)
	if (!person || person.lists.length === 0) return null
	return (person.lists.find(l => l.isPrimary) ?? person.lists[0]).id
}

export function registerShoppingTools(server: McpServer, ctx: ToolContext): void {
	defineTool(server, ctx, {
		name: 'get_wishlist',
		title: 'Get Someone’s Wishlist',
		description:
			'Everything needed to shop for another person: their list items with what is already claimed and how many remain, pick-one / in-order group rules, off-list gifts other gifters are bringing, and the user’s own gift ideas for this person. Give list_id, or person_id to use that person’s primary list. Never works on the user’s own lists (use get_list).',
		inputSchema: {
			list_id: z.number().int().positive().optional(),
			person_id: z.string().optional().describe('A user or dependent id from list_people'),
		},
		outputSchema: {
			list: z.object({
				id: z.number(),
				name: z.string(),
				type: z.string(),
				description: z.string().nullable(),
				recipient: z.object({ kind: z.enum(['user', 'dependent']), id: z.string(), name: z.string().nullable() }),
				canEdit: z.boolean(),
				revealDate: z.string().nullable().describe('When the recipient gets to see who gave what'),
			}),
			items: z.array(wishlistItemSchema),
			groups: z.array(z.object({ id: z.number(), type: z.string(), name: z.string().nullable(), itemIds: z.array(z.number()) })),
			offListGifts: z.array(addonSchema),
			myGiftIdeas: z.array(
				z.object({
					listId: z.number(),
					listName: z.string(),
					ideas: z.array(
						z.object({
							id: z.number(),
							title: z.string(),
							url: z.string().nullable(),
							price: z.string().nullable(),
							notes: z.string().nullable(),
						})
					),
				})
			),
		},
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
		handler: async (args, toolCtx) => {
			let listId = args.list_id ?? null
			if (!listId && args.person_id) listId = await resolveListForPerson(args.person_id, toolCtx)
			if (!listId)
				return args.person_id
					? toolError('not-found', 'No visible list for that person.')
					: toolError('invalid-input', 'Give list_id or person_id.')

			const header = await getListForViewingImpl({ userId: toolCtx.actor.userId, listId: String(listId), dbx: toolCtx.dbx })
			if (!header) return toolError('not-found')
			if (header.kind === 'redirect') return toolError('is-owner')
			const list = header.list

			const viewed = await getItemsForListViewImpl({ userId: toolCtx.actor.userId, listId: String(listId), dbx: toolCtx.dbx })
			if (viewed.kind === 'error') return toolError(viewed.reason === 'not-visible' ? 'not-found' : viewed.reason)

			const partnerId = await partnerIdOf(toolCtx.actor.userId, toolCtx)
			const mine = new Set([toolCtx.actor.userId, ...(partnerId ? [partnerId] : [])])
			const isMine = (gifterId: string, coGifters: Array<string> | null): boolean =>
				mine.has(gifterId) || (coGifters ?? []).some(id => mine.has(id))

			const itemsOut = viewed.items.map(i => ({
				id: i.id,
				title: i.title,
				url: i.url,
				price: i.price,
				priceFormatted: formatPrice(i.price, i.currency),
				currency: i.currency,
				priority: i.priority,
				quantity: i.quantity,
				remaining: computeRemainingClaimableQuantity(i.quantity, i.gifts),
				availability: i.availability,
				notes: i.notes,
				imageUrl: i.imageUrl,
				groupId: i.groupId,
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

			const ideas = await getGiftIdeasForListImpl({ userId: toolCtx.actor.userId, listId, dbx: toolCtx.dbx })
			const myGiftIdeas = ideas.sources.map(s => ({
				listId: s.list.id,
				listName: s.list.name,
				ideas: s.items.map(i => ({ id: i.id, title: i.title, url: i.url, price: i.price, notes: i.notes })),
			}))

			const recipient = list.subjectDependent
				? { kind: 'dependent' as const, id: list.subjectDependent.id, name: list.subjectDependent.name }
				: { kind: 'user' as const, id: list.owner.id, name: list.owner.name ?? list.owner.email }

			const structured = {
				list: {
					id: list.id,
					name: list.name,
					type: list.type,
					description: list.description,
					recipient,
					canEdit: list.canEdit,
					revealDate: list.archiveInfo.effectiveArchiveDate,
				},
				items: itemsOut,
				groups: list.groups.map(g => ({
					id: g.id,
					type: g.type,
					name: g.name,
					itemIds: itemsOut.filter(i => i.groupId === g.id).map(i => i.id),
				})),
				offListGifts: list.addons.map(a => toAddonShape(a, toolCtx.actor.userId, a.user.name ?? a.user.email)),
				myGiftIdeas,
			}

			const text = lines(
				[
					`"${list.name}" for ${recipient.name} (list #${list.id}, ${list.type}): ${plural(itemsOut.length, 'item')}.`,
					...itemsOut.map(i => {
						const claimText = i.claims.length
							? i.remaining === 0
								? `fully claimed by ${i.claims.map(c => (c.byMe ? 'you' : c.gifterNames.join(' & '))).join(', ')}`
								: `${i.remaining} of ${i.quantity} left; claimed by ${i.claims.map(c => (c.byMe ? 'you' : c.gifterNames.join(' & '))).join(', ')}`
							: i.quantity > 1
								? `${i.quantity} wanted, none claimed`
								: 'unclaimed'
						const bits = [
							i.priceFormatted,
							i.priority !== 'normal' ? i.priority : '',
							i.availability === 'unavailable' ? 'unavailable' : '',
							i.groupId ? `group ${i.groupId}` : '',
						].filter(Boolean)
						return `#${i.id} ${i.title}${bits.length ? ` (${bits.join(', ')})` : ''}: ${claimText}`
					}),
					structured.offListGifts.length
						? `Off-list gifts: ${structured.offListGifts.map(a => `${a.description} (${a.byMe ? 'you' : (a.gifterName ?? 'someone')})`).join('; ')}.`
						: '',
					myGiftIdeas.length
						? `Your gift ideas for them: ${myGiftIdeas.flatMap(s => s.ideas.map(i => `#${i.id} ${i.title}`)).join('; ')}.`
						: '',
					structured.list.revealDate ? `They learn who gave what on ${structured.list.revealDate.slice(0, 10)}.` : '',
				].filter(Boolean)
			)
			return toolOk(text, structured)
		},
	})

	defineTool(server, ctx, {
		name: 'claim_item',
		title: 'Claim an Item',
		description:
			'Reserve an item on someone else’s list as a gift the user will give, so other gifters see it is taken. Optional cost and private notes; co_gifter_ids share the gift (and the credit) with other users. Respects pick-one and in-order groups and remaining quantity.',
		inputSchema: {
			item_id: z.number().int().positive(),
			quantity: z.number().int().positive().max(999).optional().describe('default 1'),
			total_cost: money.optional(),
			notes: z.string().max(2000).optional(),
			co_gifter_ids: z.array(z.string()).max(10).optional(),
		},
		outputSchema: { gift: giftSchema },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
		handler: async (args, { actor, dbx }) => {
			const result = await claimItemGiftImpl({
				gifterId: actor.userId,
				input: { itemId: args.item_id, quantity: args.quantity ?? 1, notes: args.notes, totalCost: args.total_cost },
				dbx,
			})
			if (result.kind === 'error') {
				if (result.reason === 'over-claim')
					return toolError('over-claim', `Only ${result.remaining} left to claim.`, { remaining: result.remaining })
				return toolError(result.reason, undefined, result.blockingItemTitle ? { blockingItemTitle: result.blockingItemTitle } : undefined)
			}
			let coGifterIds: Array<string> = []
			if (args.co_gifter_ids && args.co_gifter_ids.length > 0) {
				const co = await updateCoGiftersImpl({
					gifterId: actor.userId,
					input: { giftId: result.gift.id, additionalGifterIds: args.co_gifter_ids },
					dbx,
				})
				if (co.kind === 'error') return toolError(co.reason, 'The item was claimed, but the co-gifters could not be set.')
				coGifterIds = co.additionalGifterIds ?? []
			}
			const gift = {
				id: result.gift.id,
				itemId: result.gift.itemId,
				quantity: result.gift.quantity,
				totalCost: result.gift.totalCost,
				notes: result.gift.notes,
				trackingNumber: result.gift.trackingNumber,
				coGifterIds,
			}
			return toolOk(
				`Claimed item #${gift.itemId} (gift #${gift.id}${gift.quantity > 1 ? `, qty ${gift.quantity}` : ''}${gift.totalCost ? `, ${gift.totalCost}` : ''}).`,
				{ gift }
			)
		},
	})

	defineTool(server, ctx, {
		name: 'update_claim',
		title: 'Update a Claim',
		description:
			'Change the quantity, cost, notes, tracking number, or co-gifters on one of the user’s claims (their partner’s too). co_gifter_ids REPLACES the whole set; pass [] to clear. The partner is already credited automatically and need not be listed.',
		inputSchema: {
			gift_id: z.number().int().positive(),
			quantity: z.number().int().positive().max(999).optional(),
			total_cost: money.nullable().optional(),
			notes: z.string().max(2000).nullable().optional(),
			tracking_number: z.string().max(100).nullable().optional(),
			co_gifter_ids: z.array(z.string()).max(10).optional(),
		},
		outputSchema: { gift: giftSchema },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		handler: async (args, { actor, dbx }) => {
			const existing = await dbx.query.giftedItems.findFirst({
				where: eq(giftedItems.id, args.gift_id),
				columns: { quantity: true, additionalGifterIds: true },
			})
			if (!existing) return toolError('not-found')
			const result = await updateItemGiftImpl({
				gifterId: actor.userId,
				input: {
					giftId: args.gift_id,
					quantity: args.quantity ?? existing.quantity,
					notes: args.notes,
					totalCost: args.total_cost,
					trackingNumber: args.tracking_number,
				},
				dbx,
			})
			if (result.kind === 'error') {
				if (result.reason === 'over-claim')
					return toolError('over-claim', `Only ${result.remaining} can be claimed.`, { remaining: result.remaining })
				return toolError(result.reason)
			}
			let coGifterIds = result.gift.additionalGifterIds ?? []
			if (args.co_gifter_ids !== undefined) {
				const co = await updateCoGiftersImpl({
					gifterId: actor.userId,
					input: { giftId: args.gift_id, additionalGifterIds: args.co_gifter_ids },
					dbx,
				})
				if (co.kind === 'error') return toolError(co.reason, 'The claim was updated, but the co-gifters could not be changed.')
				coGifterIds = co.additionalGifterIds ?? []
			}
			const gift = {
				id: result.gift.id,
				itemId: result.gift.itemId,
				quantity: result.gift.quantity,
				totalCost: result.gift.totalCost,
				notes: result.gift.notes,
				trackingNumber: result.gift.trackingNumber,
				coGifterIds,
			}
			return toolOk(`Updated gift #${gift.id}.`, { gift })
		},
	})

	defineTool(server, ctx, {
		name: 'set_claim_split',
		title: 'Split a Claim’s Cost',
		description:
			'Set how much each co-gifter owes on one of the user’s claims; the user’s own share is the remainder. Pass an empty list to go back to an even split. The claim needs a total cost first.',
		inputSchema: {
			gift_id: z.number().int().positive(),
			co_gifters: z.array(z.object({ user_id: z.string(), amount: money })).max(20),
		},
		outputSchema: { ok: z.literal(true), giftId: z.number() },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		handler: async (args, { actor, dbx }) => {
			const result = await setContributionSplitImpl({
				actorId: actor.userId,
				input: { giftId: args.gift_id, coGifters: args.co_gifters.map(c => ({ userId: c.user_id, amount: c.amount })) },
				dbx,
			})
			if (result.kind === 'error') return toolError(result.reason)
			return toolOk(
				args.co_gifters.length ? `Set the split on gift #${args.gift_id}.` : `Gift #${args.gift_id} is back to an even split.`,
				{ ok: true as const, giftId: args.gift_id }
			)
		},
	})

	defineTool(server, ctx, {
		name: 'unclaim_item',
		title: 'Unclaim an Item',
		description:
			'Release one of the user’s claims so others can give the item. Permanent: the claim and its notes are deleted. Confirm with the user first.',
		inputSchema: { gift_id: z.number().int().positive() },
		outputSchema: { ok: z.literal(true), giftId: z.number() },
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		handler: async (args, { actor, dbx }) => {
			const result = await unclaimItemGiftImpl({ gifterId: actor.userId, input: { giftId: args.gift_id }, dbx })
			if (result.kind === 'error') return toolError(result.reason)
			return toolOk(`Released gift #${args.gift_id}.`, { ok: true as const, giftId: args.gift_id })
		},
	})

	defineTool(server, ctx, {
		name: 'add_off_list_gift',
		title: 'Add an Off-List Gift',
		description:
			'Record something the user is giving that is not on the recipient’s list, so other gifters see it and the recipient learns of it at reveal time. Only on other people’s lists.',
		inputSchema: {
			list_id: z.number().int().positive(),
			description: z.string().min(1).max(500),
			total_cost: money.optional(),
			notes: z.string().max(2000).optional(),
			url: z.string().max(2000).optional(),
		},
		outputSchema: { gift: addonSchema },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
		handler: async (args, { actor, dbx }) => {
			const result = await createListAddonImpl({
				userId: actor.userId,
				input: { listId: args.list_id, description: args.description, notes: args.notes, totalCost: args.total_cost, url: args.url },
				dbx,
			})
			if (result.kind === 'error') return toolError(result.reason === 'not-visible' ? 'not-found' : result.reason)
			return toolOk(`Added off-list gift "${args.description}" (#${result.addon.id}) to list #${args.list_id}.`, {
				gift: toAddonShape(result.addon, actor.userId, null),
			})
		},
	})

	defineTool(server, ctx, {
		name: 'update_off_list_gift',
		title: 'Update an Off-List Gift',
		description: 'Edit the description, cost, notes, tracking number, or URL of one of the user’s off-list gifts.',
		inputSchema: {
			addon_id: z.number().int().positive(),
			description: z.string().min(1).max(500).optional(),
			total_cost: money.nullable().optional(),
			notes: z.string().max(2000).nullable().optional(),
			tracking_number: z.string().max(100).nullable().optional(),
			url: z.string().max(2000).nullable().optional(),
		},
		outputSchema: { gift: addonSchema },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		handler: async (args, { actor, dbx }) => {
			const result = await updateListAddonImpl({
				userId: actor.userId,
				input: {
					addonId: args.addon_id,
					description: args.description,
					notes: args.notes,
					totalCost: args.total_cost,
					trackingNumber: args.tracking_number,
					url: args.url,
				},
				dbx,
			})
			if (result.kind === 'error') return toolError(result.reason)
			return toolOk(`Updated off-list gift #${args.addon_id}.`, { gift: toAddonShape(result.addon, actor.userId, null) })
		},
	})

	defineTool(server, ctx, {
		name: 'delete_off_list_gift',
		title: 'Delete an Off-List Gift',
		description: 'Remove one of the user’s off-list gifts.',
		inputSchema: { addon_id: z.number().int().positive() },
		outputSchema: { ok: z.literal(true), addonId: z.number() },
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		handler: async (args, { actor, dbx }) => {
			const result = await deleteListAddonImpl({ userId: actor.userId, input: { addonId: args.addon_id }, dbx })
			if (result.kind === 'error') return toolError(result.reason)
			return toolOk(`Deleted off-list gift #${args.addon_id}.`, { ok: true as const, addonId: args.addon_id })
		},
	})

	defineTool(server, ctx, {
		name: 'use_gift_idea',
		title: 'Use a Gift Idea',
		description:
			'Turn one of the user’s gift ideas for a person into an off-list gift on that person’s list (the idea is removed from the ideas list). Ideas come from get_wishlist’s myGiftIdeas.',
		inputSchema: {
			idea_item_id: z.number().int().positive(),
			list_id: z.number().int().positive().describe('The recipient’s list the gift goes on'),
			description: z.string().min(1).max(500).optional().describe('Defaults to the idea’s title'),
			total_cost: money.optional(),
			notes: z.string().max(2000).optional(),
		},
		outputSchema: { gift: addonSchema },
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		handler: async (args, { actor, dbx }) => {
			const idea = await dbx.query.items.findFirst({
				where: eq(items.id, args.idea_item_id),
				columns: { title: true, url: true, imageUrl: true, notes: true },
			})
			if (!idea) return toolError('idea-not-found')
			const result = await copyGiftIdeaToAddonImpl({
				userId: actor.userId,
				input: {
					ideaItemId: args.idea_item_id,
					listId: args.list_id,
					description: args.description ?? idea.title,
					notes: args.notes ?? idea.notes ?? undefined,
					totalCost: args.total_cost,
					url: idea.url ?? undefined,
					imageUrl: idea.imageUrl ?? undefined,
				},
				dbx,
			})
			if (result.kind === 'error') return toolError(result.reason === 'not-visible' ? 'not-found' : result.reason)
			return toolOk(`Used idea "${idea.title}": now off-list gift #${result.addon.id} on list #${args.list_id}.`, {
				gift: toAddonShape(result.addon, actor.userId, null),
			})
		},
	})

	defineTool(server, ctx, {
		name: 'list_my_gifts',
		title: 'My Gifts',
		description:
			'Everything the user (or their partner) is giving: claims and off-list gifts across every list, with costs and totals per recipient. Filter by recipient_id (user or dependent) or by list type. Costs are this household’s share.',
		inputSchema: {
			recipient_id: z.string().optional(),
			list_type: z.string().optional(),
		},
		outputSchema: {
			gifts: z.array(
				z.object({
					kind: z.enum(['claim', 'addon']),
					id: z.number(),
					title: z.string(),
					url: z.string().nullable(),
					listName: z.string(),
					recipient: z.object({ kind: z.enum(['user', 'dependent']), id: z.string(), name: z.string().nullable() }),
					quantity: z.number(),
					cost: z.number().nullable(),
					notes: z.string().nullable(),
					trackingNumber: z.string().nullable(),
					byPartner: z.boolean(),
					asCoGifter: z.boolean(),
					createdAt: z.string(),
				})
			),
			totals: z.object({
				count: z.number(),
				cost: z.number(),
				byRecipient: z.array(z.object({ id: z.string(), name: z.string().nullable(), count: z.number(), cost: z.number() })),
			}),
		},
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
		handler: async (args, { actor, dbx }) => {
			const summary = await getPurchaseSummaryImpl(actor.userId, dbx)
			let rows = summary.items
			if (args.recipient_id)
				rows = rows.filter(r => (r.recipientKind === 'dependent' ? r.subjectDependentId : r.ownerId) === args.recipient_id)

			const gifts = rows.map(r => ({
				kind: r.type,
				id: r.type === 'claim' ? (r.giftId ?? 0) : (r.addonId ?? 0),
				title: r.title,
				url: r.itemUrl,
				listName: r.listName,
				recipient: {
					kind: r.recipientKind,
					id: r.recipientKind === 'dependent' ? (r.subjectDependentId ?? r.ownerId) : r.ownerId,
					name: r.ownerName ?? r.ownerEmail,
				},
				quantity: r.quantity,
				cost: r.cost,
				notes: r.notes,
				trackingNumber: r.trackingNumber,
				byPartner: r.isPartnerPurchase,
				asCoGifter: r.isCoGifter,
				createdAt: r.createdAt.toISOString(),
			}))
			const byRecipient = new Map<string, { id: string; name: string | null; count: number; cost: number }>()
			for (const g of gifts) {
				const entry = byRecipient.get(g.recipient.id) ?? { id: g.recipient.id, name: g.recipient.name, count: 0, cost: 0 }
				entry.count += 1
				entry.cost += g.cost ?? 0
				byRecipient.set(g.recipient.id, entry)
			}
			const totals = {
				count: gifts.length,
				cost: Math.round(gifts.reduce((s, g) => s + (g.cost ?? 0), 0) * 100) / 100,
				byRecipient: [...byRecipient.values()].map(e => ({ ...e, cost: Math.round(e.cost * 100) / 100 })),
			}
			const text = gifts.length
				? lines([
						`${plural(gifts.length, 'gift')} totalling ${totals.cost.toFixed(2)}.`,
						...totals.byRecipient.map(r => `${r.name ?? r.id}: ${plural(r.count, 'gift')}, ${r.cost.toFixed(2)}`),
						...gifts.map(
							g =>
								`${g.kind === 'claim' ? 'gift' : 'off-list'} #${g.id} ${g.title} for ${g.recipient.name}${g.cost !== null ? ` (${g.cost.toFixed(2)})` : ''}${g.byPartner ? ' [partner]' : ''}${g.asCoGifter ? ' [co-gifter]' : ''}`
						),
					])
				: 'Nothing claimed yet.'
			return toolOk(text, { gifts, totals })
		},
	})
}
