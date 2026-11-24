// Gift exchange emails (plan 39, slice 39c): who gets "your assignment is
// ready" and "your assignment has changed", and when.
//
// - Both are gated by `isEmailConfigured()` and the `enableGiftExchangeEmails`
//   setting, read at send time. Off stops the emails and nothing else.
// - Banned members are skipped. A `child` member's email is also sent to
//   their guardians (`fanOutToGuardians`), each in the guardian's language and
//   worded about the child.
// - Neither email names anyone but the reader. Nothing here reads
//   `givesToMemberId`; the templates take only the exchange's name, budget
//   and gift date (and, on a guardian's copy, the child's name).
// - A failed send never throws to the caller and never stops the other sends.
// - A member counts as told when their own copy was accepted by the provider.
//   Only then is `readyEmailSentAt` stamped.

import { and, eq, inArray, isNull } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { giftExchangeMembers, giftExchanges, users } from '@/db/schema'
import { fanOutToGuardians } from '@/lib/guardian-emails'
import { createLogger } from '@/lib/logger'
import { type GiftExchangeEmailArgs, isEmailConfigured, sendGiftExchangeChangedEmail, sendGiftExchangeReadyEmail } from '@/lib/resend'
import { getAppSettings } from '@/lib/settings-loader'

const exchangeEmailLog = createLogger('gift-exchange-emails')

/** Whether gift exchange emails can go out right now, and if not why. */
export type GiftExchangeEmailStatus = 'ready' | 'not-configured' | 'switched-off'

export async function giftExchangeEmailStatus(dbx: SchemaDatabase): Promise<GiftExchangeEmailStatus> {
	if (!(await isEmailConfigured(dbx))) return 'not-configured'
	const settings = await getAppSettings(dbx)
	return settings.enableGiftExchangeEmails ? 'ready' : 'switched-off'
}

export type GiftExchangeEmailKind = 'ready' | 'changed'

/** The exchange fields an email carries. Never a pairing. */
export type ExchangeForEmail = {
	name: string
	budget: string | null
	budgetCurrency: string | null
	giftDate: string
}

/** One member to email. `userId` is null only for a deleted account. */
export type MemberForEmail = {
	memberId: string
	userId: string | null
	email: string | null
	name: string | null
	locale: string | null
	role: string | null
	banned: boolean | null
}

export async function loadExchangeForEmail(
	dbx: SchemaDatabase,
	exchangeId: string
): Promise<(ExchangeForEmail & { drawn: boolean; archived: boolean }) | null> {
	const row = await dbx
		.select({
			name: giftExchanges.name,
			budget: giftExchanges.budget,
			budgetCurrency: giftExchanges.budgetCurrency,
			giftDate: giftExchanges.giftDate,
			drawnAt: giftExchanges.drawnAt,
			archivedAt: giftExchanges.archivedAt,
		})
		.from(giftExchanges)
		.where(eq(giftExchanges.id, exchangeId))
		.then(found => found.at(0))
	if (!row) return null
	return {
		name: row.name,
		budget: row.budget,
		budgetCurrency: row.budgetCurrency,
		giftDate: row.giftDate,
		drawn: row.drawnAt !== null,
		archived: row.archivedAt !== null,
	}
}

const memberColumns = {
	memberId: giftExchangeMembers.id,
	userId: giftExchangeMembers.userId,
	email: users.email,
	name: users.name,
	locale: users.locale,
	role: users.role,
	banned: users.banned,
}

export async function loadMembersForEmail(
	dbx: SchemaDatabase,
	exchangeId: string,
	memberIds: ReadonlyArray<string>
): Promise<Array<MemberForEmail>> {
	if (memberIds.length === 0) return []
	return dbx
		.select(memberColumns)
		.from(giftExchangeMembers)
		.leftJoin(users, eq(users.id, giftExchangeMembers.userId))
		.where(and(eq(giftExchangeMembers.exchangeId, exchangeId), inArray(giftExchangeMembers.id, [...memberIds])))
}

function emailArgs(exchange: ExchangeForEmail, locale: string | null, childName?: string | null): GiftExchangeEmailArgs {
	const budget = exchange.budget === null ? null : Number(exchange.budget)
	return {
		exchangeName: exchange.name,
		budget: budget !== null && Number.isFinite(budget) ? budget : null,
		budgetCurrency: exchange.budgetCurrency,
		giftDate: exchange.giftDate,
		childName: childName ?? null,
		locale,
	}
}

type SendResult = { error?: unknown } | null | undefined

// True when the provider accepted the email. A null result means email
// wasn't configured; an `error` means the provider refused it.
async function sendOne(kind: GiftExchangeEmailKind, to: string, args: GiftExchangeEmailArgs): Promise<boolean> {
	const send = kind === 'ready' ? sendGiftExchangeReadyEmail : sendGiftExchangeChangedEmail
	try {
		const res = (await send(to, args)) as SendResult
		return Boolean(res) && !res?.error
	} catch (err) {
		exchangeEmailLog.warn({ kind, err: err instanceof Error ? err.message : String(err) }, 'gift exchange email failed')
		return false
	}
}

/**
 * Sends one member's email, and for a child also each guardian's copy.
 * Returns true when the member's own copy was accepted, which is what
 * `readyEmailSentAt` records. Banned members and deleted accounts get nothing.
 * Never throws.
 */
export async function sendMemberEmail(
	dbx: SchemaDatabase,
	kind: GiftExchangeEmailKind,
	exchange: ExchangeForEmail,
	member: MemberForEmail
): Promise<boolean> {
	if (!member.userId || !member.email || member.banned) return false
	const sent = await sendOne(kind, member.email, emailArgs(exchange, member.locale))
	if (member.role === 'child') {
		const childName = member.name || member.email
		try {
			await fanOutToGuardians(dbx, member.userId, guardian =>
				sendOne(kind, guardian.email, emailArgs(exchange, guardian.locale, childName))
			)
		} catch (err) {
			exchangeEmailLog.warn({ kind, err: err instanceof Error ? err.message : String(err) }, 'gift exchange guardian copies failed')
		}
	}
	return sent
}

/**
 * "Your assignment has changed" to the given members of one exchange, then
 * `readyEmailSentAt` for each one told who didn't have it, so Send Emails
 * won't follow it with "your assignment is ready". Skips silently when email
 * is off or the exchange is archived. Never throws.
 */
export async function sendChangedEmails(dbx: SchemaDatabase, exchangeId: string, memberIds: ReadonlyArray<string>): Promise<number> {
	try {
		if (memberIds.length === 0) return 0
		const status = await giftExchangeEmailStatus(dbx)
		if (status !== 'ready') {
			exchangeEmailLog.debug({ exchangeId, status }, 'gift exchange changed emails skipped')
			return 0
		}
		const exchange = await loadExchangeForEmail(dbx, exchangeId)
		if (!exchange || exchange.archived) return 0
		const members = await loadMembersForEmail(dbx, exchangeId, memberIds)
		let sent = 0
		for (const member of members) {
			if (!(await sendMemberEmail(dbx, 'changed', exchange, member))) continue
			sent += 1
			try {
				await dbx
					.update(giftExchangeMembers)
					.set({ readyEmailSentAt: new Date() })
					.where(and(eq(giftExchangeMembers.id, member.memberId), isNull(giftExchangeMembers.readyEmailSentAt)))
			} catch (err) {
				exchangeEmailLog.warn({ exchangeId, err: err instanceof Error ? err.message : String(err) }, 'stamping readyEmailSentAt failed')
			}
		}
		return sent
	} catch (err) {
		exchangeEmailLog.error({ exchangeId, err: err instanceof Error ? err.message : String(err) }, 'gift exchange changed emails failed')
		return 0
	}
}
