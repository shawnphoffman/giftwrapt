// Server-only impl for the admin gift exchange screens (plan 39, slice 39b).
// Thin server functions live in `gift-exchanges.ts`.
//
// Secrecy: no function here returns a pairing (`givesToMemberId` or anything
// derived from it) for an exchange that isn't archived. Results carry member
// ids, the rules, and yes/no facts (whether anyone has looked), never who
// gifts to whom. Only `getExchangeForAdminImpl` on an archived exchange
// returns pairings. `gift-exchanges.secrecy.integration.test.ts` checks it.
//
// Every write that touches pairings locks the exchange row first, so two
// admins pressing Redraw at once can't interleave.

import { and, asc, count, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { db as defaultDb } from '@/db'
import type { Role } from '@/db/schema'
import { giftExchangeBlocks, giftExchangeMembers, giftExchanges, users } from '@/db/schema'
import { checkDraw, drawAssignments, type DrawCheck, type DrawProblem, type MemberPair } from '@/lib/gift-exchange/draw'
import {
	type GiftExchangeEmailStatus,
	giftExchangeEmailStatus,
	loadExchangeForEmail,
	loadMembersForEmail,
	sendChangedEmails,
	sendMemberEmail,
} from '@/lib/gift-exchange/emails'
import { canGiftTo, loadExchangeGiftRules, type LockedPair } from '@/lib/gift-exchange/rules'
import { secureRandomInt } from '@/lib/gift-exchange/secure-random'
import { getAppSettings } from '@/lib/settings-loader'

import type {
	AddMembersInput,
	CreateExchangeInput,
	RemoveMemberInput,
	SaveMemberRulesInput,
	UpdateExchangeInput,
} from './_gift-exchanges-schemas'

// ===============================
// Types
// ===============================

/** Derived, never stored: not drawn (`drawnAt` null), drawn, archived (`archivedAt` set). */
export type ExchangeState = 'not-drawn' | 'drawn' | 'archived'

export type AdminExchangeSummary = {
	id: string
	name: string
	budget: number | null
	budgetCurrency: string | null
	giftDate: string
	state: ExchangeState
	memberCount: number
}

export type AdminExchangeMember = {
	/** The member id (not the user id). Rules and pairings use it. */
	id: string
	/** Null only in an archived exchange, after the account was deleted. */
	userId: string | null
	name: string | null
	email: string | null
	image: string | null
	role: Role | null
	banned: boolean
}

export type AdminExchangeDetail = {
	id: string
	name: string
	budget: number | null
	budgetCurrency: string | null
	giftDate: string
	state: ExchangeState
	drawnAt: Date | null
	archivedAt: Date | null
	members: Array<AdminExchangeMember>
	/** Every direction an admin set to No. */
	blocked: Array<MemberPair>
	/** Every pair a fixed limit forbids, with the reason. Self pairs are left out. */
	locked: Array<LockedPair>
	/** Whether names can be drawn under the current rules, and if not who is stuck. Null once archived. */
	drawCheck: DrawCheck | null
	/** True when any member has looked at their current assignment. Never says who. */
	anyoneHasLooked: boolean
	/**
	 * Members who haven't had the "your assignment is ready" email. Banned
	 * members and deleted accounts are left out: Send Emails skips them, so
	 * counting them would keep the button up for good.
	 */
	notEmailedCount: number
	/**
	 * When exactly one member hasn't been emailed, their member id, so the page
	 * can name them. A single id rather than a list: a list of member ids in
	 * some order could put a giver next to their recipient, and the secrecy
	 * test treats that as a leak.
	 */
	notEmailedMemberId: string | null
	/** Whether Send Emails can send right now, and if not why. */
	emailStatus: GiftExchangeEmailStatus
	/** Who gifted to whom. Only for an archived exchange; null otherwise. */
	pairings: Array<MemberPair> | null
}

type NotFound = { kind: 'error'; reason: 'not-found' }
type Archived = { kind: 'error'; reason: 'archived' }
type NoValidDraw = { kind: 'error'; reason: 'no-valid-draw'; problem: DrawProblem }

// ===============================
// Email hook
// ===============================

/**
 * What a write did to people's assignments, for the "your assignment has
 * changed" email, which `afterPairingsChanged` sends.
 *
 * - `redrawn-after-look`: a redraw (Redraw, Save and Redraw, a removal that
 *   needed a full redraw, or an account deletion that did) replaced every
 *   pairing while at least one member had looked. `memberIds` is every
 *   member; each has `changedAt` set and `seenAt` cleared. A redraw nobody
 *   had looked at produces no event, and `readyEmailSentAt` is kept.
 * - `assignment-changed`: a removal patched the leaver's giver onto the
 *   leaver's recipient, or a late add slotted a newcomer in after someone.
 *   `memberIds` are the members whose pairing was replaced (`changedAt` set,
 *   `seenAt` cleared). Newcomers are never in it; they have
 *   `readyEmailSentAt` null, so Send Emails covers them.
 *
 * Ids are member ids of `exchangeId`. Pairings are never included. Read the
 * exchange (name, budget, gift date) and each member's user and locale from
 * the database when sending.
 */
export type PairingChangeEvent =
	| { kind: 'redrawn-after-look'; exchangeId: string; memberIds: Array<string> }
	| { kind: 'assignment-changed'; exchangeId: string; memberIds: Array<string> }

/**
 * Called once after every write that replaced pairings, after its transaction
 * has committed (never inside it, so an email can't go out for a write that
 * rolled back). Sends "your assignment has changed" to each member named in
 * the events, once per member even when several events name them, and stamps
 * `readyEmailSentAt` for anyone told who didn't have it. Skipped silently
 * when email isn't configured or `enableGiftExchangeEmails` is off. Never
 * throws: a failed send can't fail the admin's action.
 */
export async function afterPairingsChanged(events: ReadonlyArray<PairingChangeEvent>, dbx: SchemaDatabase = defaultDb): Promise<void> {
	if (events.length === 0) return
	const byExchange = new Map<string, Set<string>>()
	for (const event of events) {
		const ids = byExchange.get(event.exchangeId) ?? new Set<string>()
		for (const id of event.memberIds) ids.add(id)
		byExchange.set(event.exchangeId, ids)
	}
	for (const [exchangeId, memberIds] of byExchange) {
		await sendChangedEmails(dbx, exchangeId, [...memberIds])
	}
}

// ===============================
// Helpers
// ===============================

// A refusal discovered after writes began. Thrown inside the transaction so
// it rolls back, then caught outside and returned as the typed result.
class Refusal<T> extends Error {
	constructor(readonly result: T) {
		super('gift exchange refusal')
	}
}

async function inTransaction<T>(dbx: SchemaDatabase, fn: (tx: SchemaDatabase) => Promise<T>): Promise<T> {
	try {
		return await dbx.transaction(async tx => fn(tx as unknown as SchemaDatabase))
	} catch (err) {
		if (err instanceof Refusal) return err.result as T
		throw err
	}
}

function stateOf(row: { drawnAt: Date | null; archivedAt: Date | null }): ExchangeState {
	if (row.archivedAt) return 'archived'
	if (row.drawnAt) return 'drawn'
	return 'not-drawn'
}

function budgetNumber(budget: string | null): number | null {
	if (budget === null) return null
	const n = Number(budget)
	return Number.isFinite(n) ? n : null
}

const random = (maxExclusive: number) => secureRandomInt(maxExclusive)

type LockedExchange = { id: string; drawnAt: Date | null; archivedAt: Date | null }

async function lockExchange(tx: SchemaDatabase, exchangeId: string): Promise<LockedExchange | null> {
	const row = await tx
		.select({ id: giftExchanges.id, drawnAt: giftExchanges.drawnAt, archivedAt: giftExchanges.archivedAt })
		.from(giftExchanges)
		.where(eq(giftExchanges.id, exchangeId))
		.for('update')
		.then(found => found.at(0))
	return row ?? null
}

async function anyoneHasLooked(tx: SchemaDatabase, exchangeId: string): Promise<boolean> {
	const rows = await tx
		.select({ id: giftExchangeMembers.id })
		.from(giftExchangeMembers)
		.where(and(eq(giftExchangeMembers.exchangeId, exchangeId), isNotNull(giftExchangeMembers.seenAt)))
		.limit(1)
	return rows.length > 0
}

type UserCheck = { kind: 'ok' } | { kind: 'error'; reason: 'user-not-found' | 'user-banned' }

// Banned users can't be added (a member banned later stays until removed).
async function checkAddableUsers(tx: SchemaDatabase, userIds: ReadonlyArray<string>): Promise<UserCheck> {
	if (userIds.length === 0) return { kind: 'ok' }
	const rows = await tx
		.select({ id: users.id, banned: users.banned })
		.from(users)
		.where(inArray(users.id, [...userIds]))
	if (rows.length !== new Set(userIds).size) return { kind: 'error', reason: 'user-not-found' }
	if (rows.some(r => r.banned)) return { kind: 'error', reason: 'user-banned' }
	return { kind: 'ok' }
}

// The draw, written in the caller's transaction. Shared by Draw Names,
// Redraw, Save and Redraw, and a removal that needs a full redraw. Clears
// `seenAt` on everyone; when anyone had looked, every member gets `changedAt`
// and a `redrawn-after-look` event, otherwise `changedAt` is cleared too.
async function drawInTx(
	tx: SchemaDatabase,
	exchangeId: string,
	now: Date
): Promise<{ ok: true; events: Array<PairingChangeEvent> } | { ok: false; problem: DrawProblem }> {
	const rules = await loadExchangeGiftRules(exchangeId, tx)
	const result = drawAssignments(rules.memberIds, rules.allowed, { randomInt: random })
	if (!result.ok) {
		const { ok: _ok, ...problem } = result
		return { ok: false, problem }
	}
	const looked = await anyoneHasLooked(tx, exchangeId)
	for (const [giver, recipient] of result.assignments) {
		await tx
			.update(giftExchangeMembers)
			.set({ givesToMemberId: recipient, seenAt: null, changedAt: looked ? now : null })
			.where(eq(giftExchangeMembers.id, giver))
	}
	await tx.update(giftExchanges).set({ drawnAt: now }).where(eq(giftExchanges.id, exchangeId))
	return { ok: true, events: looked ? [{ kind: 'redrawn-after-look', exchangeId, memberIds: rules.memberIds }] : [] }
}

// ===============================
// Reads
// ===============================

export async function listExchangesImpl(args: { dbx?: SchemaDatabase } = {}): Promise<Array<AdminExchangeSummary>> {
	const dbx = args.dbx ?? defaultDb
	const rows = await dbx
		.select({
			id: giftExchanges.id,
			name: giftExchanges.name,
			budget: giftExchanges.budget,
			budgetCurrency: giftExchanges.budgetCurrency,
			giftDate: giftExchanges.giftDate,
			drawnAt: giftExchanges.drawnAt,
			archivedAt: giftExchanges.archivedAt,
			memberCount: count(giftExchangeMembers.id),
		})
		.from(giftExchanges)
		.leftJoin(giftExchangeMembers, eq(giftExchangeMembers.exchangeId, giftExchanges.id))
		.groupBy(giftExchanges.id)
		// Running exchanges first, then archived; newest gift date first in each.
		.orderBy(sql`${giftExchanges.archivedAt} is not null`, desc(giftExchanges.giftDate), desc(giftExchanges.createdAt))
	return rows.map(r => ({
		id: r.id,
		name: r.name,
		budget: budgetNumber(r.budget),
		budgetCurrency: r.budgetCurrency,
		giftDate: r.giftDate,
		state: stateOf(r),
		memberCount: Number(r.memberCount),
	}))
}

export type GetExchangeResult = { kind: 'ok'; exchange: AdminExchangeDetail } | NotFound

/** The admin exchange page. Pairings only when archived; see the secrecy note at the top. */
export async function getExchangeForAdminImpl(args: { exchangeId: string; dbx?: SchemaDatabase }): Promise<GetExchangeResult> {
	const dbx = args.dbx ?? defaultDb
	const exchange = await dbx
		.select()
		.from(giftExchanges)
		.where(eq(giftExchanges.id, args.exchangeId))
		.then(found => found.at(0))
	if (!exchange) return { kind: 'error', reason: 'not-found' }
	const state = stateOf(exchange)

	// Deliberately no `givesToMemberId` here.
	const memberRows = await dbx
		.select({
			id: giftExchangeMembers.id,
			userId: giftExchangeMembers.userId,
			seenAt: giftExchangeMembers.seenAt,
			readyEmailSentAt: giftExchangeMembers.readyEmailSentAt,
			name: users.name,
			email: users.email,
			image: users.image,
			role: users.role,
			banned: users.banned,
		})
		.from(giftExchangeMembers)
		.leftJoin(users, eq(users.id, giftExchangeMembers.userId))
		.where(eq(giftExchangeMembers.exchangeId, exchange.id))
		.orderBy(sql`${users.name} is null`, asc(sql`lower(${users.name})`), asc(users.email), asc(giftExchangeMembers.id))

	const rules = await loadExchangeGiftRules(exchange.id, dbx)
	const emailStatus = await giftExchangeEmailStatus(dbx)
	const notEmailedMemberIds = memberRows.filter(r => r.readyEmailSentAt === null && r.userId !== null && !r.banned).map(r => r.id)

	let pairings: Array<MemberPair> | null = null
	if (state === 'archived') {
		const rows = await dbx
			.select({ giverMemberId: giftExchangeMembers.id, recipientMemberId: giftExchangeMembers.givesToMemberId })
			.from(giftExchangeMembers)
			.where(and(eq(giftExchangeMembers.exchangeId, exchange.id), isNotNull(giftExchangeMembers.givesToMemberId)))
		pairings = rows.map(r => ({ giverMemberId: r.giverMemberId, recipientMemberId: r.recipientMemberId! }))
	}

	return {
		kind: 'ok',
		exchange: {
			id: exchange.id,
			name: exchange.name,
			budget: budgetNumber(exchange.budget),
			budgetCurrency: exchange.budgetCurrency,
			giftDate: exchange.giftDate,
			state,
			drawnAt: exchange.drawnAt,
			archivedAt: exchange.archivedAt,
			members: memberRows.map(r => ({
				id: r.id,
				userId: r.userId,
				name: r.name,
				email: r.email,
				image: r.image,
				role: r.role,
				banned: r.banned ?? false,
			})),
			blocked: rules.blocked,
			locked: rules.locked.filter(p => p.reason !== 'self'),
			drawCheck: state === 'archived' ? null : checkDraw(rules.memberIds, rules.allowed),
			anyoneHasLooked: memberRows.some(r => r.seenAt !== null),
			notEmailedCount: notEmailedMemberIds.length,
			notEmailedMemberId: notEmailedMemberIds.length === 1 ? notEmailedMemberIds[0] : null,
			emailStatus,
			pairings,
		},
	}
}

// ===============================
// Create, edit, delete, archive
// ===============================

export type CreateExchangeResult = { kind: 'ok'; id: string } | { kind: 'error'; reason: 'user-not-found' | 'user-banned' }

export async function createExchangeImpl(args: {
	actorId: string
	input: CreateExchangeInput
	dbx?: SchemaDatabase
}): Promise<CreateExchangeResult> {
	const dbx = args.dbx ?? defaultDb
	const { input } = args
	const memberUserIds = [...new Set(input.memberUserIds)]
	const budgetCurrency = input.budget === null ? null : (await getAppSettings(dbx)).defaultCurrency

	return inTransaction(dbx, async tx => {
		const check = await checkAddableUsers(tx, memberUserIds)
		if (check.kind === 'error') return check
		const [row] = await tx
			.insert(giftExchanges)
			.values({
				name: input.name,
				budget: input.budget === null ? null : input.budget.toFixed(2),
				budgetCurrency,
				giftDate: input.giftDate,
				createdByUserId: args.actorId,
			})
			.returning({ id: giftExchanges.id })
		if (memberUserIds.length > 0) {
			await tx.insert(giftExchangeMembers).values(memberUserIds.map(userId => ({ exchangeId: row.id, userId })))
		}
		return { kind: 'ok', id: row.id }
	})
}

export type UpdateExchangeResult = { kind: 'ok' } | NotFound | Archived

/** Name, budget and gift date. Allowed before and after the draw; not once archived. */
export async function updateExchangeImpl(args: { input: UpdateExchangeInput; dbx?: SchemaDatabase }): Promise<UpdateExchangeResult> {
	const dbx = args.dbx ?? defaultDb
	const { input } = args
	return inTransaction(dbx, async tx => {
		const current = await tx
			.select({ archivedAt: giftExchanges.archivedAt, budget: giftExchanges.budget, budgetCurrency: giftExchanges.budgetCurrency })
			.from(giftExchanges)
			.where(eq(giftExchanges.id, input.exchangeId))
			.for('update')
			.then(found => found.at(0))
		if (!current) return { kind: 'error', reason: 'not-found' }
		if (current.archivedAt) return { kind: 'error', reason: 'archived' }

		const budget = input.budget === null ? null : input.budget.toFixed(2)
		// The currency is copied when the budget is saved, so a later change
		// of the default doesn't relabel an amount that didn't change.
		let budgetCurrency = current.budgetCurrency
		if (budget === null) budgetCurrency = null
		else if (budget !== current.budget || budgetCurrency === null) budgetCurrency = (await getAppSettings(tx)).defaultCurrency

		await tx
			.update(giftExchanges)
			.set({ name: input.name, budget, budgetCurrency, giftDate: input.giftDate })
			.where(eq(giftExchanges.id, input.exchangeId))
		return { kind: 'ok' }
	})
}

export type DeleteExchangeResult = { kind: 'ok' } | NotFound | { kind: 'error'; reason: 'already-drawn' }

/** Only an exchange that was never drawn. A drawn one is archived instead. */
export async function deleteExchangeImpl(args: { exchangeId: string; dbx?: SchemaDatabase }): Promise<DeleteExchangeResult> {
	const dbx = args.dbx ?? defaultDb
	return inTransaction(dbx, async tx => {
		const exchange = await lockExchange(tx, args.exchangeId)
		if (!exchange) return { kind: 'error', reason: 'not-found' }
		if (exchange.drawnAt) return { kind: 'error', reason: 'already-drawn' }
		await tx.delete(giftExchanges).where(eq(giftExchanges.id, exchange.id))
		return { kind: 'ok' }
	})
}

export type ArchiveExchangeResult = { kind: 'ok' } | NotFound | Archived | { kind: 'error'; reason: 'not-drawn' }

/** Final: `archivedAt` is never cleared. Requires a draw. */
export async function archiveExchangeImpl(args: { exchangeId: string; dbx?: SchemaDatabase }): Promise<ArchiveExchangeResult> {
	const dbx = args.dbx ?? defaultDb
	return inTransaction(dbx, async tx => {
		const exchange = await lockExchange(tx, args.exchangeId)
		if (!exchange) return { kind: 'error', reason: 'not-found' }
		if (exchange.archivedAt) return { kind: 'error', reason: 'archived' }
		if (!exchange.drawnAt) return { kind: 'error', reason: 'not-drawn' }
		await tx.update(giftExchanges).set({ archivedAt: new Date() }).where(eq(giftExchanges.id, exchange.id))
		return { kind: 'ok' }
	})
}

// ===============================
// Send Emails
// ===============================

export type SendReadyEmailsResult =
	/** `sent` were accepted by the provider and stamped; `failed` stay unstamped so a second press retries them. */
	| { kind: 'ok'; sent: number; failed: number }
	| NotFound
	| Archived
	| { kind: 'error'; reason: 'not-drawn' | 'email-not-configured' | 'emails-off' }

/**
 * Send Emails: "your assignment is ready" to every member of a drawn,
 * unarchived exchange whose `readyEmailSentAt` is null, stamping it for each
 * one sent. Nothing sends this email automatically.
 *
 * Each member is claimed before the send (`readyEmailSentAt` set where it is
 * still null), so two admins pressing at once can't email anyone twice, and
 * the claim is released when the send fails so the next press retries it.
 * Banned members are skipped and stay unstamped. Sends happen outside any
 * transaction, so no row lock is held across the network.
 */
export async function sendReadyEmailsImpl(args: { exchangeId: string; dbx?: SchemaDatabase }): Promise<SendReadyEmailsResult> {
	const dbx = args.dbx ?? defaultDb
	const exchange = await loadExchangeForEmail(dbx, args.exchangeId)
	if (!exchange) return { kind: 'error', reason: 'not-found' }
	if (exchange.archived) return { kind: 'error', reason: 'archived' }
	if (!exchange.drawn) return { kind: 'error', reason: 'not-drawn' }

	const status = await giftExchangeEmailStatus(dbx)
	if (status === 'not-configured') return { kind: 'error', reason: 'email-not-configured' }
	if (status === 'switched-off') return { kind: 'error', reason: 'emails-off' }

	const pending = await dbx
		.select({ id: giftExchangeMembers.id })
		.from(giftExchangeMembers)
		.where(and(eq(giftExchangeMembers.exchangeId, args.exchangeId), isNull(giftExchangeMembers.readyEmailSentAt)))
	const members = await loadMembersForEmail(
		dbx,
		args.exchangeId,
		pending.map(r => r.id)
	)

	let sent = 0
	let failed = 0
	for (const member of members) {
		if (!member.userId || member.banned) continue
		const stamp = new Date()
		const claimed = await dbx
			.update(giftExchangeMembers)
			.set({ readyEmailSentAt: stamp })
			.where(and(eq(giftExchangeMembers.id, member.memberId), isNull(giftExchangeMembers.readyEmailSentAt)))
			.returning({ id: giftExchangeMembers.id })
		if (claimed.length === 0) continue
		if (await sendMemberEmail(dbx, 'ready', exchange, member)) {
			sent += 1
		} else {
			failed += 1
			await dbx
				.update(giftExchangeMembers)
				.set({ readyEmailSentAt: null })
				.where(and(eq(giftExchangeMembers.id, member.memberId), eq(giftExchangeMembers.readyEmailSentAt, stamp)))
		}
	}
	return { kind: 'ok', sent, failed }
}

// ===============================
// Draw and redraw
// ===============================

export type DrawExchangeResult = { kind: 'ok' } | NotFound | Archived | { kind: 'error'; reason: 'already-drawn' } | NoValidDraw

/**
 * Locks the exchange, reads members and the four rules, draws, writes every
 * `givesToMemberId`, clears `seenAt` and `changedAt`, and stamps `drawnAt`,
 * in one transaction.
 */
export async function drawExchangeImpl(args: { exchangeId: string; dbx?: SchemaDatabase }): Promise<DrawExchangeResult> {
	const dbx = args.dbx ?? defaultDb
	const result = await inTransaction(dbx, async (tx): Promise<{ result: DrawExchangeResult; events: Array<PairingChangeEvent> }> => {
		const exchange = await lockExchange(tx, args.exchangeId)
		if (!exchange) return { result: { kind: 'error', reason: 'not-found' }, events: [] }
		if (exchange.archivedAt) return { result: { kind: 'error', reason: 'archived' }, events: [] }
		if (exchange.drawnAt) return { result: { kind: 'error', reason: 'already-drawn' }, events: [] }
		const drawn = await drawInTx(tx, exchange.id, new Date())
		if (!drawn.ok) return { result: { kind: 'error', reason: 'no-valid-draw', problem: drawn.problem }, events: [] }
		return { result: { kind: 'ok' }, events: drawn.events }
	})
	await afterPairingsChanged(result.events, dbx)
	return result.result
}

export type RedrawExchangeResult = { kind: 'ok' } | NotFound | Archived | { kind: 'error'; reason: 'not-drawn' } | NoValidDraw

/** The draw again. When anyone had looked, every member is marked changed. */
export async function redrawExchangeImpl(args: { exchangeId: string; dbx?: SchemaDatabase }): Promise<RedrawExchangeResult> {
	const dbx = args.dbx ?? defaultDb
	const result = await inTransaction(dbx, async (tx): Promise<{ result: RedrawExchangeResult; events: Array<PairingChangeEvent> }> => {
		const exchange = await lockExchange(tx, args.exchangeId)
		if (!exchange) return { result: { kind: 'error', reason: 'not-found' }, events: [] }
		if (exchange.archivedAt) return { result: { kind: 'error', reason: 'archived' }, events: [] }
		if (!exchange.drawnAt) return { result: { kind: 'error', reason: 'not-drawn' }, events: [] }
		const drawn = await drawInTx(tx, exchange.id, new Date())
		if (!drawn.ok) return { result: { kind: 'error', reason: 'no-valid-draw', problem: drawn.problem }, events: [] }
		return { result: { kind: 'ok' }, events: drawn.events }
	})
	await afterPairingsChanged(result.events, dbx)
	return result.result
}

// ===============================
// Rules
// ===============================

export type SaveMemberRulesResult =
	| { kind: 'ok'; redrew: boolean }
	| NotFound
	| Archived
	| { kind: 'error'; reason: 'invalid-block' | 'confirm-redraw-required' }
	| NoValidDraw

/**
 * Replaces every block that involves one member. Before the draw it just
 * saves. After the draw it needs `confirmRedraw: true`, refuses with
 * `no-valid-draw` when the new rules allow no draw, and otherwise saves and
 * redraws in the same transaction. Blocks on a locked pair are dropped: the
 * fixed limits are never stored.
 */
export async function saveMemberRulesImpl(args: { input: SaveMemberRulesInput; dbx?: SchemaDatabase }): Promise<SaveMemberRulesResult> {
	const dbx = args.dbx ?? defaultDb
	const { input } = args
	const result = await inTransaction(dbx, async (tx): Promise<{ result: SaveMemberRulesResult; events: Array<PairingChangeEvent> }> => {
		const exchange = await lockExchange(tx, input.exchangeId)
		if (!exchange) return { result: { kind: 'error', reason: 'not-found' }, events: [] }
		if (exchange.archivedAt) return { result: { kind: 'error', reason: 'archived' }, events: [] }

		const rules = await loadExchangeGiftRules(exchange.id, tx)
		const memberIds = new Set(rules.memberIds)
		if (!memberIds.has(input.memberId)) return { result: { kind: 'error', reason: 'not-found' }, events: [] }

		// `gift_exchange_blocks` doesn't check that both members belong to its
		// exchange, so this does.
		const key = (p: MemberPair) => `${p.giverMemberId}:${p.recipientMemberId}`
		const locked = new Set(rules.locked.map(key))
		const blocks = new Map<string, MemberPair>()
		for (const p of input.blocks) {
			const valid =
				p.giverMemberId !== p.recipientMemberId &&
				(p.giverMemberId === input.memberId || p.recipientMemberId === input.memberId) &&
				memberIds.has(p.giverMemberId) &&
				memberIds.has(p.recipientMemberId)
			if (!valid) return { result: { kind: 'error', reason: 'invalid-block' }, events: [] }
			if (!locked.has(key(p))) blocks.set(key(p), p)
		}

		if (exchange.drawnAt && !input.confirmRedraw) {
			return { result: { kind: 'error', reason: 'confirm-redraw-required' }, events: [] }
		}

		await tx
			.delete(giftExchangeBlocks)
			.where(
				and(
					eq(giftExchangeBlocks.exchangeId, exchange.id),
					or(eq(giftExchangeBlocks.giverMemberId, input.memberId), eq(giftExchangeBlocks.recipientMemberId, input.memberId))
				)
			)
		if (blocks.size > 0) {
			await tx.insert(giftExchangeBlocks).values([...blocks.values()].map(p => ({ exchangeId: exchange.id, ...p })))
		}

		if (!exchange.drawnAt) return { result: { kind: 'ok', redrew: false }, events: [] }

		const drawn = await drawInTx(tx, exchange.id, new Date())
		if (!drawn.ok) throw new Refusal({ result: { kind: 'error', reason: 'no-valid-draw', problem: drawn.problem }, events: [] })
		return { result: { kind: 'ok', redrew: true }, events: drawn.events }
	})
	await afterPairingsChanged(result.events, dbx)
	return result.result
}

// ===============================
// Adding people
// ===============================

export type AddMembersResult =
	| { kind: 'ok'; added: number }
	| NotFound
	| Archived
	| { kind: 'error'; reason: 'user-not-found' | 'user-banned' }
	/** After the draw, this person can't be slotted in anywhere without a redraw. Nothing was added. */
	| { kind: 'error'; reason: 'needs-redraw'; userId: string }

/**
 * Adds one or many users (Add Person, Add Everybody). Already-members are
 * skipped. Before the draw that's all. After the draw each newcomer Z is
 * fitted in one at a time: a random pairing A to B where A can gift to Z and
 * Z can gift to B becomes A to Z to B, and A is marked changed. If any
 * newcomer can't be fitted, nothing is added.
 */
export async function addMembersImpl(args: { input: AddMembersInput; dbx?: SchemaDatabase }): Promise<AddMembersResult> {
	const dbx = args.dbx ?? defaultDb
	const { input } = args
	const result = await inTransaction(dbx, async (tx): Promise<{ result: AddMembersResult; events: Array<PairingChangeEvent> }> => {
		const exchange = await lockExchange(tx, input.exchangeId)
		if (!exchange) return { result: { kind: 'error', reason: 'not-found' }, events: [] }
		if (exchange.archivedAt) return { result: { kind: 'error', reason: 'archived' }, events: [] }

		const userIds = [...new Set(input.userIds)]
		const check = await checkAddableUsers(tx, userIds)
		if (check.kind === 'error') return { result: check, events: [] }

		const existing = await tx
			.select({ userId: giftExchangeMembers.userId })
			.from(giftExchangeMembers)
			.where(and(eq(giftExchangeMembers.exchangeId, exchange.id), inArray(giftExchangeMembers.userId, userIds)))
		const already = new Set(existing.map(r => r.userId))
		const toAdd = userIds.filter(id => !already.has(id))
		if (toAdd.length === 0) return { result: { kind: 'ok', added: 0 }, events: [] }

		const inserted = await tx
			.insert(giftExchangeMembers)
			.values(toAdd.map(userId => ({ exchangeId: exchange.id, userId })))
			.returning({ id: giftExchangeMembers.id, userId: giftExchangeMembers.userId })

		if (!exchange.drawnAt) return { result: { kind: 'ok', added: inserted.length }, events: [] }

		const now = new Date()
		const newcomerIds = new Set(inserted.map(r => r.id))
		const changed = new Set<string>()
		const placed = new Set<string>()
		for (const newcomer of inserted) {
			const rules = await loadExchangeGiftRules(exchange.id, tx)
			const pairings = await tx
				.select({ giver: giftExchangeMembers.id, recipient: giftExchangeMembers.givesToMemberId })
				.from(giftExchangeMembers)
				.where(and(eq(giftExchangeMembers.exchangeId, exchange.id), isNotNull(giftExchangeMembers.givesToMemberId)))
			const newcomerId = newcomer.id
			const candidates = pairings.filter(
				p =>
					p.giver !== newcomerId &&
					p.recipient !== newcomerId &&
					(!newcomerIds.has(p.giver) || placed.has(p.giver)) &&
					(rules.allowed.get(p.giver)?.has(newcomerId) ?? false) &&
					(rules.allowed.get(newcomerId)?.has(p.recipient!) ?? false)
			)
			if (candidates.length === 0) {
				throw new Refusal({ result: { kind: 'error', reason: 'needs-redraw', userId: newcomer.userId! }, events: [] })
			}
			const pick = candidates[random(candidates.length)]
			await tx.update(giftExchangeMembers).set({ givesToMemberId: pick.recipient }).where(eq(giftExchangeMembers.id, newcomerId))
			if (newcomerIds.has(pick.giver)) {
				// Another newcomer from this same call: nobody has told them anything yet.
				await tx.update(giftExchangeMembers).set({ givesToMemberId: newcomerId }).where(eq(giftExchangeMembers.id, pick.giver))
			} else {
				await tx
					.update(giftExchangeMembers)
					.set({ givesToMemberId: newcomerId, seenAt: null, changedAt: now })
					.where(eq(giftExchangeMembers.id, pick.giver))
				changed.add(pick.giver)
			}
			placed.add(newcomerId)
		}
		const events: Array<PairingChangeEvent> =
			changed.size > 0 ? [{ kind: 'assignment-changed', exchangeId: exchange.id, memberIds: [...changed] }] : []
		return { result: { kind: 'ok', added: inserted.length }, events }
	})
	await afterPairingsChanged(result.events, dbx)
	return result.result
}

// ===============================
// Removing people
// ===============================

type RemovalMode = { by: 'admin'; confirmRedraw: boolean } | { by: 'account-deletion' }

type RemovalOutcome =
	| { kind: 'removed'; events: Array<PairingChangeEvent> }
	| { kind: 'needs-redraw'; anyoneHasLooked: boolean }
	| { kind: 'no-valid-draw'; problem: DrawProblem }

// The removal, in the caller's transaction, on an exchange it has locked and
// checked isn't archived. Writes nothing unless it returns `removed`.
//
// Before the draw the row is deleted (blocks cascade). After the draw, with
// A gifting to the leaver P and P gifting to B: if A can gift to B, A now
// gifts to B and nobody else is touched. Otherwise the remaining members are
// redrawn: an admin confirms that first; an account deletion can't ask, and
// when no draw is possible it clears every pairing and `drawnAt` instead of
// refusing.
async function removeMemberInTx(
	tx: SchemaDatabase,
	exchange: LockedExchange,
	leaver: { id: string; givesToMemberId: string | null },
	mode: RemovalMode,
	now: Date
): Promise<RemovalOutcome> {
	const deleteLeaver = () => tx.delete(giftExchangeMembers).where(eq(giftExchangeMembers.id, leaver.id))

	if (!exchange.drawnAt) {
		await deleteLeaver()
		return { kind: 'removed', events: [] }
	}

	const giver = await tx
		.select({ id: giftExchangeMembers.id })
		.from(giftExchangeMembers)
		.where(and(eq(giftExchangeMembers.exchangeId, exchange.id), eq(giftExchangeMembers.givesToMemberId, leaver.id)))
		.limit(1)
		.then(found => found.at(0))
	const recipientId = leaver.givesToMemberId
	const patchable =
		giver !== undefined &&
		recipientId !== null &&
		giver.id !== leaver.id &&
		recipientId !== leaver.id &&
		giver.id !== recipientId &&
		(await canGiftTo({ exchangeId: exchange.id, giverMemberId: giver.id, recipientMemberId: recipientId }, tx))

	if (patchable) {
		await deleteLeaver()
		await tx
			.update(giftExchangeMembers)
			.set({ givesToMemberId: recipientId, seenAt: null, changedAt: now })
			.where(eq(giftExchangeMembers.id, giver.id))
		return { kind: 'removed', events: [{ kind: 'assignment-changed', exchangeId: exchange.id, memberIds: [giver.id] }] }
	}

	const rules = await loadExchangeGiftRules(exchange.id, tx)
	const check = checkDraw(
		rules.memberIds.filter(id => id !== leaver.id),
		rules.allowed
	)
	if (!check.ok) {
		if (mode.by === 'admin') {
			const { ok: _ok, ...problem } = check
			return { kind: 'no-valid-draw', problem }
		}
		await deleteLeaver()
		await tx
			.update(giftExchangeMembers)
			.set({ givesToMemberId: null, seenAt: null, changedAt: null })
			.where(eq(giftExchangeMembers.exchangeId, exchange.id))
		await tx.update(giftExchanges).set({ drawnAt: null }).where(eq(giftExchanges.id, exchange.id))
		return { kind: 'removed', events: [] }
	}

	if (mode.by === 'admin' && !mode.confirmRedraw) {
		return { kind: 'needs-redraw', anyoneHasLooked: await anyoneHasLooked(tx, exchange.id) }
	}

	await deleteLeaver()
	const drawn = await drawInTx(tx, exchange.id, now)
	// checkDraw passed on the same members and rules, and the last draw level
	// always succeeds when a matching exists.
	if (!drawn.ok) throw new Error('gift exchange redraw failed after a passing check')
	return { kind: 'removed', events: drawn.events }
}

export type RemoveMemberResult =
	| { kind: 'ok' }
	/** After the draw, the leaver's giver can't take over their recipient. Ask, then call again with `confirmRedraw: true`. */
	| { kind: 'needs-redraw'; anyoneHasLooked: boolean }
	| NotFound
	| Archived
	| NoValidDraw

export async function removeMemberImpl(args: { input: RemoveMemberInput; dbx?: SchemaDatabase }): Promise<RemoveMemberResult> {
	const dbx = args.dbx ?? defaultDb
	const { input } = args
	const result = await inTransaction(dbx, async (tx): Promise<{ result: RemoveMemberResult; events: Array<PairingChangeEvent> }> => {
		const exchange = await lockExchange(tx, input.exchangeId)
		if (!exchange) return { result: { kind: 'error', reason: 'not-found' }, events: [] }
		if (exchange.archivedAt) return { result: { kind: 'error', reason: 'archived' }, events: [] }
		const leaver = await tx
			.select({ id: giftExchangeMembers.id, givesToMemberId: giftExchangeMembers.givesToMemberId })
			.from(giftExchangeMembers)
			.where(and(eq(giftExchangeMembers.id, input.memberId), eq(giftExchangeMembers.exchangeId, exchange.id)))
			.then(found => found.at(0))
		if (!leaver) return { result: { kind: 'error', reason: 'not-found' }, events: [] }

		const outcome = await removeMemberInTx(tx, exchange, leaver, { by: 'admin', confirmRedraw: input.confirmRedraw === true }, new Date())
		switch (outcome.kind) {
			case 'removed':
				return { result: { kind: 'ok' }, events: outcome.events }
			case 'needs-redraw':
				return { result: { kind: 'needs-redraw', anyoneHasLooked: outcome.anyoneHasLooked }, events: [] }
			case 'no-valid-draw':
				return { result: { kind: 'error', reason: 'no-valid-draw', problem: outcome.problem }, events: [] }
		}
	})
	await afterPairingsChanged(result.events, dbx)
	return result.result
}

/**
 * Account deletion: removes the user from every exchange that isn't
 * archived, in the caller's transaction, before the user row goes. It can't
 * ask anyone, so when the patch isn't possible it redraws, and when no draw
 * is possible it puts the exchange back to not drawn. Archived exchanges keep
 * the member row; the FK nulls its `userId` ("Deleted user").
 *
 * Returns the events for `afterPairingsChanged`, which the caller runs after
 * its transaction commits.
 */
export async function removeUserFromOpenExchangesInTx(tx: SchemaDatabase, userId: string): Promise<Array<PairingChangeEvent>> {
	const rows = await tx
		.select({ id: giftExchangeMembers.id, exchangeId: giftExchangeMembers.exchangeId })
		.from(giftExchangeMembers)
		.innerJoin(giftExchanges, eq(giftExchanges.id, giftExchangeMembers.exchangeId))
		.where(and(eq(giftExchangeMembers.userId, userId), isNull(giftExchanges.archivedAt)))
		.orderBy(asc(giftExchangeMembers.exchangeId))
	const events: Array<PairingChangeEvent> = []
	const now = new Date()
	for (const row of rows) {
		const exchange = await lockExchange(tx, row.exchangeId)
		if (!exchange || exchange.archivedAt) continue
		const leaver = await tx
			.select({ id: giftExchangeMembers.id, givesToMemberId: giftExchangeMembers.givesToMemberId })
			.from(giftExchangeMembers)
			.where(eq(giftExchangeMembers.id, row.id))
			.then(found => found.at(0))
		if (!leaver) continue
		const outcome = await removeMemberInTx(tx, exchange, leaver, { by: 'account-deletion' }, now)
		if (outcome.kind === 'removed') events.push(...outcome.events)
	}
	return events
}
