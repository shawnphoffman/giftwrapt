// Server-only impl for everyone's Gift Exchange page (plan 39, slice 39d).
// Thin server functions live in `my-gift-exchanges.ts`. Any signed-in user
// may call these; each one only ever reads the caller's own memberships, and
// the guardian reveal the caller's own children's.
//
// Secrecy:
// - `getMyExchangesImpl` returns the caller's recipient only once the caller
//   has looked (`seenAt` set) and only while their assignment hasn't changed
//   since (`changedAt` null). Before that the recipient's id, name and lists
//   are nowhere in the payload. It never returns a child's pairing.
// - Opening the page is not looking. Only `revealMyAssignmentImpl` (See Who
//   You Have) and `revealChildAssignmentImpl` (a guardian's Show) stamp
//   `seenAt`.
// - `revealChildAssignmentImpl` is the one way to read another person's
//   pairing, limited to the caller's own children (a `guardianships` row).
//
// Archived and never-drawn exchanges are invisible here: not on the page, not
// in the count, and both reveals refuse them.

import { and, asc, count, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import type { SchemaDatabase } from '@/db'
import { db as defaultDb } from '@/db'
import { giftExchangeMembers, giftExchanges, guardianships, users } from '@/db/schema'

import { getPublicListsImpl, type PublicList, type PublicUser } from './_lists-impl'

// ===============================
// Types
// ===============================

/**
 * Where the caller stands in one exchange:
 * - `ready`: names are drawn and they haven't looked yet.
 * - `seen`: they pressed See Who You Have (or a guardian pressed Show for
 *   them) and nothing has changed since.
 * - `changed`: their assignment was replaced after a redraw, a removal or a
 *   late add, and they haven't looked at the new one. Wins over `seenAt`,
 *   because a guardian's Show stamps `seenAt` without clearing `changedAt`.
 */
export type MyExchangeState = 'ready' | 'seen' | 'changed'

/**
 * The person the caller gifts to, in the same shape as an All Lists entry
 * (`PublicUser`), so the page renders it with the same person card. `lists`
 * comes from the All Lists feed as the caller (privacy, `none` and the
 * `restricted` filter apply unchanged), ordered `christmas` lists first, then
 * the primary list, then the rest. Empty when the caller can see none.
 */
export type MyExchangeRecipient = PublicUser

export type MyExchange = {
	id: string
	name: string
	budget: number | null
	budgetCurrency: string | null
	/** A calendar date, `YYYY-MM-DD`. */
	giftDate: string
	state: MyExchangeState
	/** Only when `state` is `seen`. Null otherwise; nothing about the recipient is sent before that. */
	recipient: MyExchangeRecipient | null
}

/** One of the caller's children in one drawn, unarchived exchange, for the Children card. Never their pairing. */
export type MyChildExchange = {
	exchangeId: string
	exchangeName: string
	child: { id: string; name: string | null; email: string; image: string | null }
}

export type MyExchangesPayload = {
	/** Drawn, unarchived exchanges the caller is a member of, soonest gift date first. */
	exchanges: Array<MyExchange>
	/** The caller's children in drawn, unarchived exchanges, whether or not the caller is in any. */
	children: Array<MyChildExchange>
}

/** Who someone gifts to, as returned by a reveal: the person reference `get_gift_context` takes (`id`). */
export type ExchangeRecipientRef = { id: string; name: string | null; email: string; image: string | null }

export type RevealRefusalReason = 'not-member' | 'not-drawn' | 'archived'

export type RevealMyAssignmentResult = { kind: 'ok'; recipient: ExchangeRecipientRef } | { kind: 'error'; reason: RevealRefusalReason }

export type RevealChildAssignmentResult =
	| { kind: 'ok'; recipient: ExchangeRecipientRef }
	| { kind: 'error'; reason: 'not-guardian' | RevealRefusalReason }

// ===============================
// Helpers
// ===============================

function budgetNumber(budget: string | null): number | null {
	if (budget === null) return null
	const n = Number(budget)
	return Number.isFinite(n) ? n : null
}

function stateOf(row: { seenAt: Date | null; changedAt: Date | null }): MyExchangeState {
	if (row.changedAt) return 'changed'
	if (row.seenAt) return 'seen'
	return 'ready'
}

function listRank(list: Pick<PublicList, 'type' | 'isPrimary'>): number {
	if (list.type === 'christmas') return 0
	if (list.isPrimary) return 1
	return 2
}

/** `christmas` lists first, then the primary list, then the rest, otherwise in the feed's own order. */
export function orderExchangeLists<T extends Pick<PublicList, 'type' | 'isPrimary'>>(lists: ReadonlyArray<T>): Array<T> {
	return lists
		.map((list, index) => ({ list, index }))
		.sort((a, b) => listRank(a.list) - listRank(b.list) || a.index - b.index)
		.map(x => x.list)
}

// A drawn exchange that isn't archived: the only kind anyone sees here.
const openExchange = and(isNotNull(giftExchanges.drawnAt), isNull(giftExchanges.archivedAt))

// ===============================
// Reads
// ===============================

/** The Gift Exchange page. Reading it never counts as looking. */
export async function getMyExchangesImpl(args: { userId: string; dbx?: SchemaDatabase }): Promise<MyExchangesPayload> {
	const dbx = args.dbx ?? defaultDb
	const { userId } = args

	const recipientMember = alias(giftExchangeMembers, 'recipient_member')
	const rows = await dbx
		.select({
			id: giftExchanges.id,
			name: giftExchanges.name,
			budget: giftExchanges.budget,
			budgetCurrency: giftExchanges.budgetCurrency,
			giftDate: giftExchanges.giftDate,
			seenAt: giftExchangeMembers.seenAt,
			changedAt: giftExchangeMembers.changedAt,
			recipientUserId: recipientMember.userId,
		})
		.from(giftExchangeMembers)
		.innerJoin(giftExchanges, eq(giftExchanges.id, giftExchangeMembers.exchangeId))
		.leftJoin(recipientMember, eq(recipientMember.id, giftExchangeMembers.givesToMemberId))
		.where(and(eq(giftExchangeMembers.userId, userId), openExchange))
		.orderBy(asc(giftExchanges.giftDate), asc(sql`lower(${giftExchanges.name})`), asc(giftExchanges.id))

	// The recipient's user id is read above so it can be looked up, and only
	// leaves this function for an exchange the caller has looked at.
	const seenRecipientIds = [...new Set(rows.filter(r => stateOf(r) === 'seen' && r.recipientUserId !== null).map(r => r.recipientUserId!))]
	const recipients = await loadRecipients(dbx, userId, seenRecipientIds)

	const exchanges: Array<MyExchange> = rows.map(r => {
		const state = stateOf(r)
		const recipient = state === 'seen' && r.recipientUserId ? (recipients.get(r.recipientUserId) ?? null) : null
		return {
			id: r.id,
			name: r.name,
			budget: budgetNumber(r.budget),
			budgetCurrency: r.budgetCurrency,
			giftDate: r.giftDate,
			state,
			recipient,
		}
	})

	const childRows = await dbx
		.select({
			exchangeId: giftExchanges.id,
			exchangeName: giftExchanges.name,
			childId: users.id,
			childName: users.name,
			childEmail: users.email,
			childImage: users.image,
		})
		.from(guardianships)
		.innerJoin(giftExchangeMembers, eq(giftExchangeMembers.userId, guardianships.childUserId))
		.innerJoin(giftExchanges, eq(giftExchanges.id, giftExchangeMembers.exchangeId))
		.innerJoin(users, eq(users.id, guardianships.childUserId))
		.where(and(eq(guardianships.parentUserId, userId), openExchange))
		.orderBy(
			asc(sql`lower(coalesce(${users.name}, ${users.email}))`),
			asc(users.id),
			asc(giftExchanges.giftDate),
			asc(sql`lower(${giftExchanges.name})`),
			asc(giftExchanges.id)
		)

	return {
		exchanges,
		children: childRows.map(r => ({
			exchangeId: r.exchangeId,
			exchangeName: r.exchangeName,
			child: { id: r.childId, name: r.childName, email: r.childEmail, image: r.childImage },
		})),
	}
}

// Each recipient as the caller sees them on All Lists. Someone who isn't in
// the caller's feed (they set the caller to `none` after the draw) still gets
// a card, with no lists.
async function loadRecipients(
	dbx: SchemaDatabase,
	viewerId: string,
	recipientIds: Array<string>
): Promise<Map<string, MyExchangeRecipient>> {
	const out = new Map<string, MyExchangeRecipient>()
	if (recipientIds.length === 0) return out
	const wanted = new Set(recipientIds)
	const feed = await getPublicListsImpl(viewerId, dbx)
	for (const person of feed) {
		if (wanted.has(person.id)) out.set(person.id, { ...person, lists: orderExchangeLists(person.lists) })
	}
	const missing = recipientIds.filter(id => !out.has(id))
	if (missing.length > 0) {
		const rows = await dbx
			.select({
				id: users.id,
				name: users.name,
				email: users.email,
				image: users.image,
				birthMonth: users.birthMonth,
				birthDay: users.birthDay,
				partnerId: users.partnerId,
			})
			.from(users)
			.where(inArray(users.id, missing))
		for (const r of rows) out.set(r.id, { ...r, partnerId: r.partnerId ?? null, lastGiftedAt: null, lists: [] })
	}
	return out
}

/**
 * How many entries the Gift Exchange page would show: the caller's drawn,
 * unarchived exchanges plus their children's rows. The sidebar shows the
 * link when it is above zero.
 */
export async function getMyExchangeCountImpl(args: { userId: string; dbx?: SchemaDatabase }): Promise<{ count: number }> {
	const dbx = args.dbx ?? defaultDb
	const [own] = await dbx
		.select({ n: count() })
		.from(giftExchangeMembers)
		.innerJoin(giftExchanges, eq(giftExchanges.id, giftExchangeMembers.exchangeId))
		.where(and(eq(giftExchangeMembers.userId, args.userId), openExchange))
	const [children] = await dbx
		.select({ n: count() })
		.from(guardianships)
		.innerJoin(giftExchangeMembers, eq(giftExchangeMembers.userId, guardianships.childUserId))
		.innerJoin(giftExchanges, eq(giftExchanges.id, giftExchangeMembers.exchangeId))
		.where(and(eq(guardianships.parentUserId, args.userId), openExchange))
	return { count: Number(own.n) + Number(children.n) }
}

// ===============================
// Looking
// ===============================

type RevealTarget = { kind: 'ok'; memberId: string; recipient: ExchangeRecipientRef } | { kind: 'error'; reason: RevealRefusalReason }

// Reads one member's assignment in a transaction that holds the exchange row
// FOR SHARE, so it can't interleave with a redraw, removal or late add (each
// locks the exchange FOR UPDATE first). Membership is checked before the
// exchange's state, so a non-member learns nothing about it.
async function readAssignment(tx: SchemaDatabase, exchangeId: string, memberUserId: string): Promise<RevealTarget> {
	const member = await tx
		.select({ id: giftExchangeMembers.id, givesToMemberId: giftExchangeMembers.givesToMemberId })
		.from(giftExchangeMembers)
		.where(and(eq(giftExchangeMembers.exchangeId, exchangeId), eq(giftExchangeMembers.userId, memberUserId)))
		.then(found => found.at(0))
	if (!member) return { kind: 'error', reason: 'not-member' }

	const exchange = await tx
		.select({ drawnAt: giftExchanges.drawnAt, archivedAt: giftExchanges.archivedAt })
		.from(giftExchanges)
		.where(eq(giftExchanges.id, exchangeId))
		.for('share')
		.then(found => found.at(0))
	if (!exchange) return { kind: 'error', reason: 'not-member' }
	if (exchange.archivedAt) return { kind: 'error', reason: 'archived' }
	if (!exchange.drawnAt) return { kind: 'error', reason: 'not-drawn' }

	// Re-read under the lock: a redraw that committed while this waited has replaced it.
	const current = await tx
		.select({ givesToMemberId: giftExchangeMembers.givesToMemberId })
		.from(giftExchangeMembers)
		.where(eq(giftExchangeMembers.id, member.id))
		.then(found => found.at(0))
	if (!current?.givesToMemberId) return { kind: 'error', reason: 'not-drawn' }

	const recipient = await tx
		.select({ id: users.id, name: users.name, email: users.email, image: users.image })
		.from(giftExchangeMembers)
		.innerJoin(users, eq(users.id, giftExchangeMembers.userId))
		.where(eq(giftExchangeMembers.id, current.givesToMemberId))
		.then(found => found.at(0))
	if (!recipient) return { kind: 'error', reason: 'not-drawn' }
	return { kind: 'ok', memberId: member.id, recipient }
}

// Sets `seenAt` only where it is still null, so the first look is kept.
async function stampSeen(tx: SchemaDatabase, memberId: string): Promise<void> {
	await tx
		.update(giftExchangeMembers)
		.set({ seenAt: new Date() })
		.where(and(eq(giftExchangeMembers.id, memberId), isNull(giftExchangeMembers.seenAt)))
}

/**
 * See Who You Have. Records that the caller looked: stamps `seenAt` once
 * (an earlier value is kept) and clears `changedAt`. Returns who they gift
 * to. This is the call that counts as looking for the caller themselves; the
 * MCP tool goes through it too.
 */
export async function revealMyAssignmentImpl(args: {
	userId: string
	exchangeId: string
	dbx?: SchemaDatabase
}): Promise<RevealMyAssignmentResult> {
	const dbx = args.dbx ?? defaultDb
	return dbx.transaction(async txRaw => {
		const tx = txRaw as unknown as SchemaDatabase
		const target = await readAssignment(tx, args.exchangeId, args.userId)
		if (target.kind === 'error') return target
		await stampSeen(tx, target.memberId)
		await tx.update(giftExchangeMembers).set({ changedAt: null }).where(eq(giftExchangeMembers.id, target.memberId))
		return { kind: 'ok', recipient: target.recipient }
	})
}

/**
 * A guardian's Show on the Children card. Requires a `guardianships` row
 * from the caller to the child. Stamps the child's `seenAt` if it is null
 * (looking, per the plan), and leaves `changedAt` alone: the child hasn't
 * seen a changed assignment themselves, so their own page still says it
 * changed. Returns who the child gifts to. Nothing tells the child.
 */
export async function revealChildAssignmentImpl(args: {
	userId: string
	exchangeId: string
	childUserId: string
	dbx?: SchemaDatabase
}): Promise<RevealChildAssignmentResult> {
	const dbx = args.dbx ?? defaultDb
	const guardian = await dbx
		.select({ childUserId: guardianships.childUserId })
		.from(guardianships)
		.where(and(eq(guardianships.parentUserId, args.userId), eq(guardianships.childUserId, args.childUserId)))
		.then(found => found.at(0))
	if (!guardian) return { kind: 'error', reason: 'not-guardian' }

	return dbx.transaction(async txRaw => {
		const tx = txRaw as unknown as SchemaDatabase
		const target = await readAssignment(tx, args.exchangeId, args.childUserId)
		if (target.kind === 'error') return target
		await stampSeen(tx, target.memberId)
		return { kind: 'ok', recipient: target.recipient }
	})
}
