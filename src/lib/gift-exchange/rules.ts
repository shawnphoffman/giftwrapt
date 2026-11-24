// Who can gift to whom in a gift exchange (plan 39, "Rules > Who can gift to
// whom"). For giver G and recipient R in the same exchange, G can gift to R
// when all of these hold:
//
//   1. G is not R.
//   2. R has not set G to `none`: no `userRelationships` row with
//      ownerUserId = R, viewerUserId = G, accessLevel = 'none'. This is the
//      explicit-deny check of `canViewList`, read directly. `restricted` is
//      fine: a restricted viewer can open the lists and claim.
//   3. G is not a child of R: no `guardianships` row with parentUserId = R,
//      childUserId = G.
//   4. No `gift_exchange_blocks` row for (G, R).
//
// 1 to 3 are the fixed limits. They are never stored; they are read fresh at
// every check, so a `none` set after the draw affects the next draw and
// nothing before it.
//
// Do NOT use `getViewerAccessLevel` here: it short-circuits guardians and
// partners to `view` even when an explicit `none` row exists, while
// `canViewList` denies them.

import { and, eq, inArray } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { db as defaultDb } from '@/db'
import { giftExchangeBlocks, giftExchangeMembers, guardianships, userRelationships } from '@/db/schema'

import { type AllowedRelation, buildAllowedRelation, type MemberPair } from './draw'

/**
 * Why a pair is locked. Checked in this order and only the first that applies
 * is reported:
 * - `self`: a member can't gift to themselves.
 * - `giver-is-child-of-recipient`: a child never gifts to their own guardian.
 * - `recipient-denies-giver`: the recipient set the giver to `none`, so the
 *   giver can't see the recipient's lists.
 */
export type LockedReason = 'self' | 'giver-is-child-of-recipient' | 'recipient-denies-giver'

export type LockedPair = MemberPair & { reason: LockedReason }

/** The parts of a member row the rules need. `userId` is null only for a deleted user in an archived exchange. */
export type ExchangeMemberRef = { id: string; userId: string | null }

export type ExchangeGiftRules = {
	memberIds: Array<string>
	/** Every pair a fixed limit forbids, self pairs included. */
	locked: Array<LockedPair>
	/** Every pair an admin set to No. */
	blocked: Array<MemberPair>
	/** Everything the four rules allow, ready for `checkDraw` / `drawAssignments`. */
	allowed: AllowedRelation
}

/**
 * For a set of members, every ordered pair a fixed limit forbids, with the
 * reason. Self pairs are included. A member with no user (a deleted user in
 * an archived exchange) is only locked against themselves.
 */
export async function findLockedPairs(
	members: ReadonlyArray<ExchangeMemberRef>,
	dbx: SchemaDatabase = defaultDb
): Promise<Array<LockedPair>> {
	const userIds = [...new Set(members.map(m => m.userId).filter((id): id is string => id !== null))]

	const [denials, guardianRows] =
		userIds.length === 0
			? [[], []]
			: await Promise.all([
					dbx
						.select({ ownerUserId: userRelationships.ownerUserId, viewerUserId: userRelationships.viewerUserId })
						.from(userRelationships)
						.where(
							and(
								inArray(userRelationships.ownerUserId, userIds),
								inArray(userRelationships.viewerUserId, userIds),
								eq(userRelationships.accessLevel, 'none')
							)
						),
					dbx
						.select({ parentUserId: guardianships.parentUserId, childUserId: guardianships.childUserId })
						.from(guardianships)
						.where(and(inArray(guardianships.parentUserId, userIds), inArray(guardianships.childUserId, userIds))),
				])

	const key = (a: string, b: string) => `${a}\u0000${b}`
	// recipient (owner) denies giver (viewer)
	const denied = new Set(denials.map(r => key(r.ownerUserId, r.viewerUserId)))
	// giver (child) of recipient (parent)
	const childOf = new Set(guardianRows.map(r => key(r.childUserId, r.parentUserId)))

	const locked: Array<LockedPair> = []
	for (const giver of members) {
		for (const recipient of members) {
			const pair = { giverMemberId: giver.id, recipientMemberId: recipient.id }
			if (giver.id === recipient.id) {
				locked.push({ ...pair, reason: 'self' })
				continue
			}
			if (giver.userId === null || recipient.userId === null) continue
			if (childOf.has(key(giver.userId, recipient.userId))) {
				locked.push({ ...pair, reason: 'giver-is-child-of-recipient' })
			} else if (denied.has(key(recipient.userId, giver.userId))) {
				locked.push({ ...pair, reason: 'recipient-denies-giver' })
			}
		}
	}
	return locked
}

/**
 * Reads an exchange's members, fixed limits and admin blocks, and builds the
 * allowed relation the draw works on. Pass a transaction as `dbx` to read
 * inside it (the draw locks the exchange row first).
 */
export async function loadExchangeGiftRules(exchangeId: string, dbx: SchemaDatabase = defaultDb): Promise<ExchangeGiftRules> {
	const [members, blocked] = await Promise.all([
		dbx
			.select({ id: giftExchangeMembers.id, userId: giftExchangeMembers.userId })
			.from(giftExchangeMembers)
			.where(eq(giftExchangeMembers.exchangeId, exchangeId))
			.orderBy(giftExchangeMembers.id),
		dbx
			.select({ giverMemberId: giftExchangeBlocks.giverMemberId, recipientMemberId: giftExchangeBlocks.recipientMemberId })
			.from(giftExchangeBlocks)
			.where(eq(giftExchangeBlocks.exchangeId, exchangeId)),
	])
	const locked = await findLockedPairs(members, dbx)
	const memberIds = members.map(m => m.id)
	return { memberIds, locked, blocked, allowed: buildAllowedRelation(memberIds, [...locked, ...blocked]) }
}

/**
 * Whether one member can gift to another in their exchange, under all four
 * rules. False when either member isn't in the exchange.
 */
export async function canGiftTo(
	args: { exchangeId: string; giverMemberId: string; recipientMemberId: string },
	dbx: SchemaDatabase = defaultDb
): Promise<boolean> {
	const { exchangeId, giverMemberId, recipientMemberId } = args
	if (giverMemberId === recipientMemberId) return false

	const members = await dbx
		.select({ id: giftExchangeMembers.id, userId: giftExchangeMembers.userId })
		.from(giftExchangeMembers)
		.where(and(eq(giftExchangeMembers.exchangeId, exchangeId), inArray(giftExchangeMembers.id, [giverMemberId, recipientMemberId])))
	if (members.length !== 2) return false

	const block = await dbx
		.select({ exchangeId: giftExchangeBlocks.exchangeId })
		.from(giftExchangeBlocks)
		.where(
			and(
				eq(giftExchangeBlocks.exchangeId, exchangeId),
				eq(giftExchangeBlocks.giverMemberId, giverMemberId),
				eq(giftExchangeBlocks.recipientMemberId, recipientMemberId)
			)
		)
		.limit(1)
	if (block.length > 0) return false

	const locked = await findLockedPairs(members, dbx)
	return !locked.some(p => p.giverMemberId === giverMemberId && p.recipientMemberId === recipientMemberId)
}
