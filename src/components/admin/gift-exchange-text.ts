// Text for the admin gift exchange screens. Every function renders at call
// time, never at module load (see messages/README.md).

import type { AdminExchangeMember } from '@/api/_gift-exchanges-impl'
import type { DrawProblem } from '@/lib/gift-exchange/draw'
import type { LockedReason } from '@/lib/gift-exchange/rules'
import { formatCalendarDate, formatCurrency, formatList } from '@/lib/i18n/format'
import { m } from '@/paraglide/messages.js'

export function memberName(member: Pick<AdminExchangeMember, 'name' | 'email'> | undefined): string {
	return member?.name || member?.email || m.admin_exchanges_deleted_user()
}

export function giftDateLabel(giftDate: string): string {
	return formatCalendarDate(giftDate, { dateStyle: 'medium' })
}

/** "Dec 25, 2026, $50 budget, 8 people". */
export function exchangeMetaLine(
	exchange: { giftDate: string; budget: number | null; budgetCurrency: string | null },
	count: number
): string {
	const date = giftDateLabel(exchange.giftDate)
	if (exchange.budget === null) return m.admin_exchanges_meta({ date, count })
	const budget = formatCurrency(exchange.budget, exchange.budgetCurrency ?? undefined, { wholeWhenRound: true })
	return m.admin_exchanges_meta_with_budget({ date, budget, count })
}

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
