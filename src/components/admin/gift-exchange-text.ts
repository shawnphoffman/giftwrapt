// Text for the admin gift exchange screens. Every function renders at call
// time, never at module load (see messages/README.md).

import type { AdminExchangeDetail, AdminExchangeMember } from '@/api/_gift-exchanges-impl'
import type { DrawProblem } from '@/lib/gift-exchange/draw'
import { exchangeBudgetLabel, giftDateLabel } from '@/lib/gift-exchange/format'
import type { LockedReason } from '@/lib/gift-exchange/rules'
import { formatList } from '@/lib/i18n/format'
import { m } from '@/paraglide/messages.js'

export function memberName(member: Pick<AdminExchangeMember, 'name' | 'email'> | undefined): string {
	return member?.name || member?.email || m.admin_exchanges_deleted_user()
}

/**
 * The short name the Yes / No dialog's column headers and the table's column
 * headers show: the first word of the name, or the whole email when there is
 * no name. The locked-pair reasons use it too, so they read
 * "Maya can't gift to Nora, who is Maya's guardian".
 */
export function memberShortName(member: Pick<AdminExchangeMember, 'name' | 'email'> | undefined): string {
	return memberName(member).split(' ')[0]
}

/** "Dec 25, 2026, $50 budget, 8 people". */
export function exchangeMetaLine(
	exchange: { giftDate: string; budget: number | null; budgetCurrency: string | null },
	count: number
): string {
	const date = giftDateLabel(exchange.giftDate)
	if (exchange.budget === null) return m.admin_exchanges_meta({ date, count })
	const budget = exchangeBudgetLabel(exchange.budget, exchange.budgetCurrency)
	return m.admin_exchanges_meta_with_budget({ date, budget, count })
}

/** Pass short names (`memberShortName`), as the column headers show them. */
export function lockedReasonText(reason: LockedReason, giver: string, recipient: string): string {
	switch (reason) {
		case 'giver-is-child-of-recipient':
			return m.admin_exchanges_locked_guardian({ giver, recipient })
		case 'recipient-denies-giver':
			return m.admin_exchanges_locked_denied({ giver, recipient })
		case 'self':
			return m.admin_exchanges_tip_self()
	}
}

/**
 * The line beside the Drawn badge: "Emails not sent yet.", "Emails sent.",
 * "Priya hasn't been emailed yet." or "3 people haven't been emailed yet."
 */
export function emailStatusLine(
	exchange: Pick<AdminExchangeDetail, 'members' | 'notEmailedCount' | 'notEmailedMemberId'>,
	nameOf: (memberId: string) => string
): string {
	const { notEmailedCount: count, notEmailedMemberId: soleId } = exchange
	if (count === 0) return m.admin_exchanges_emails_status_all()
	const emailable = exchange.members.filter(x => x.userId !== null && !x.banned).length
	if (count >= emailable) return m.admin_exchanges_emails_status_none()
	if (count === 1 && soleId) return m.admin_exchanges_emails_status_one({ name: nameOf(soleId) })
	return m.admin_exchanges_emails_status_many({ count })
}

/** Why Send Emails is disabled, shown beside it. Null when it can send. */
export function emailBlockedReason(status: AdminExchangeDetail['emailStatus']): string | null {
	switch (status) {
		case 'ready':
			return null
		case 'not-configured':
			return m.admin_exchanges_emails_not_configured()
		case 'switched-off':
			return m.admin_exchanges_emails_switched_off()
	}
}

export type ProblemText = {
	title: string
	sentences: Array<string>
	/** Member ids the warning names, so each can open the Yes / No dialog. */
	memberIds: Array<string>
}

/** The "names can't be drawn" warning, naming who is stuck. Null for too-few, which shows beside the buttons instead. */
export function problemText(problem: DrawProblem, nameOf: (memberId: string) => string): ProblemText | null {
	const names = (ids: Array<string>) => formatList(ids.map(nameOf))
	switch (problem.reason) {
		case 'too-few-members':
			return null
		case 'no-options': {
			if (problem.nobodyToGiftTo.length > 0) {
				const ids = problem.nobodyToGiftTo
				return {
					title:
						ids.length === 1
							? m.admin_exchanges_problem_nobody_to_gift_to_title({ name: nameOf(ids[0]) })
							: m.admin_exchanges_problem_nobody_to_gift_to_title_many({ names: names(ids) }),
					sentences: [m.admin_exchanges_problem_nobody_to_gift_to_body()],
					memberIds: ids,
				}
			}
			const ids = problem.nobodyCanGiftTo
			return {
				title:
					ids.length === 1
						? m.admin_exchanges_problem_nobody_can_gift_title({ name: nameOf(ids[0]) })
						: m.admin_exchanges_problem_nobody_can_gift_title_many({ names: names(ids) }),
				sentences: [m.admin_exchanges_problem_nobody_can_gift_body()],
				memberIds: ids,
			}
		}
		case 'stuck-group': {
			const { group } = problem
			const giverCount = group.givers.length
			const recipientCount = group.recipients.length
			if (group.side === 'givers') {
				return {
					title: m.admin_exchanges_problem_stuck_title(),
					sentences: [
						m.admin_exchanges_problem_stuck_givers({ givers: names(group.givers), recipients: names(group.recipients) }),
						m.admin_exchanges_problem_stuck_givers_count({ giverCount, recipientCount }),
						m.admin_exchanges_problem_stuck_givers_fix(),
					],
					memberIds: group.givers,
				}
			}
			return {
				title: m.admin_exchanges_problem_stuck_title(),
				sentences: [
					m.admin_exchanges_problem_stuck_recipients({ givers: names(group.givers), recipients: names(group.recipients) }),
					m.admin_exchanges_problem_stuck_recipients_count({ giverCount, recipientCount }),
					m.admin_exchanges_problem_stuck_recipients_fix(),
				],
				memberIds: group.recipients,
			}
		}
	}
}

type Refusal = { kind: 'error'; reason: string; problem?: DrawProblem; userId?: string }

export type RefusalMessage = { title: string; description?: string }

/** A typed refusal from a gift exchange server function, for a toast. */
export function refusalMessage(
	result: Refusal,
	nameOf: (memberId: string) => string,
	userName?: (userId: string) => string | undefined
): RefusalMessage {
	const text = refusalTitle(result, nameOf, userName)
	if (typeof text !== 'string') return text
	return { title: text }
}

function refusalTitle(
	result: Refusal,
	nameOf: (memberId: string) => string,
	userName?: (userId: string) => string | undefined
): string | RefusalMessage {
	switch (result.reason) {
		case 'not-found':
			return m.admin_exchanges_error_not_found()
		case 'archived':
			return m.admin_exchanges_error_archived()
		case 'user-banned':
			return m.admin_exchanges_error_user_banned()
		case 'user-not-found':
			return m.admin_exchanges_error_user_not_found()
		case 'already-drawn':
			return m.admin_exchanges_error_already_drawn()
		case 'not-drawn':
			return m.admin_exchanges_error_not_drawn()
		case 'email-not-configured':
			return m.admin_exchanges_emails_not_configured()
		case 'emails-off':
			return m.admin_exchanges_emails_switched_off()
		case 'invalid-block':
		case 'confirm-redraw-required':
			return m.admin_exchanges_error_invalid_block()
		case 'needs-redraw': {
			const name = result.userId ? userName?.(result.userId) : undefined
			return name ? m.admin_exchanges_error_needs_redraw({ name }) : m.admin_exchanges_error_needs_redraw_generic()
		}
		case 'no-valid-draw': {
			if (!result.problem) return m.admin_exchanges_action_failed()
			if (result.problem.reason === 'too-few-members') return m.admin_exchanges_too_few({ minimum: result.problem.minimum })
			const text = problemText(result.problem, nameOf)
			// Each sentence is a whole catalog sentence; the description lists them in order.
			return text ? { title: text.title, description: text.sentences.join(' ') } : m.admin_exchanges_action_failed()
		}
		default:
			return m.admin_exchanges_action_failed()
	}
}
