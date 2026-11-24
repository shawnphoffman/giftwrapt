// Gift exchanges (Secret Santa, plan 39, slice 39e). One read tool: who the
// user drew in each exchange they are in.
//
// Calling it counts as looking, exactly like See Who You Have on the Gift
// Exchange page: each listed exchange goes through `revealMyAssignmentImpl`,
// which stamps `seenAt` once and clears `changedAt`. It is still marked
// read-only (settled in plan 39): recording that the person looked is
// bookkeeping, and read-only connections must be able to use it.
//
// Only the caller's own assignments. Never a child's (the guardian reveal is
// web only), never anyone else's.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { getMyExchangesImpl, revealMyAssignmentImpl } from '@/api/_my-gift-exchanges-impl'
import { calendarDayInZone } from '@/lib/calendar-day'

import type { ToolContext } from '../context'
import { toolOk } from '../errors'
import { formatPrice, lines, plural } from '../format'
import { defineTool } from '../server'
import { pageInput, pageLine, pageSchema, paginate } from '../shapes'

const EXCHANGES_PAGE = 100
const DAY_MS = 86_400_000

const exchangeSchema = z.object({
	id: z.string(),
	name: z.string(),
	budget: z.object({ amount: z.number(), currency: z.string() }).nullable().describe('Spending limit per person; null when none is set'),
	giftDate: z.string().describe('YYYY-MM-DD'),
	daysUntil: z.number().describe('Days from today until the gift date; negative once it has passed'),
	recipient: z
		.object({ kind: z.literal('user'), id: z.string(), name: z.string().nullable() })
		.describe('The person the user gives to. Pass id as person_id to get_gift_context to plan the gift.'),
})

type ExchangeRow = z.infer<typeof exchangeSchema>

function whenText(days: number): string {
	if (days === 0) return 'today'
	if (days > 0) return `in ${plural(days, 'day')}`
	return `${plural(-days, 'day')} ago`
}

export function registerExchangeTools(server: McpServer, ctx: ToolContext): void {
	defineTool(server, ctx, {
		name: 'list_my_gift_exchanges',
		title: 'My Gift Exchanges',
		description:
			'The gift exchanges (Secret Santa) the user is in where names have been drawn: each with its name, budget, gift date, and the person the user drew, soonest first. Calling this counts as the user having looked at who they drew, just like opening it in the app, so call it only when the user wants to know. Only the user’s own assignments are returned, never anyone else’s. Pass the person’s id to get_gift_context to plan the gift.',
		inputSchema: { ...pageInput(EXCHANGES_PAGE) },
		outputSchema: { exchanges: z.array(exchangeSchema), page: pageSchema },
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
		handler: async (args, { actor, dbx, now, settings }) => {
			const { exchanges } = await getMyExchangesImpl({ userId: actor.userId, dbx })
			const { rows, page } = paginate(exchanges, args, EXCHANGES_PAGE)
			const today = calendarDayInZone(now, settings.timeZone).getTime()

			const out: Array<ExchangeRow> = []
			for (const x of rows) {
				// The reveal is the look. It only refuses when the exchange was
				// archived, undrawn or left between the read above and here; such
				// an exchange is no longer the user's to see, so it is dropped.
				const reveal = await revealMyAssignmentImpl({ userId: actor.userId, exchangeId: x.id, dbx })
				if (reveal.kind === 'error') continue
				out.push({
					id: x.id,
					name: x.name,
					budget: x.budget === null ? null : { amount: x.budget, currency: x.budgetCurrency ?? settings.defaultCurrency },
					giftDate: x.giftDate,
					daysUntil: Math.round((Date.parse(`${x.giftDate}T00:00:00Z`) - today) / DAY_MS),
					recipient: { kind: 'user', id: reveal.recipient.id, name: reveal.recipient.name ?? reveal.recipient.email },
				})
			}

			const text = out.length
				? lines(
						[
							...out.map(x => {
								const budget = x.budget ? `, budget ${formatPrice(String(x.budget.amount), x.budget.currency)}` : ''
								return `${x.name} [exchange id ${x.id}]: gift date ${x.giftDate} (${whenText(x.daysUntil)})${budget}. You give to ${x.recipient.name ?? 'someone'} [user id ${x.recipient.id}].`
							}),
							pageLine(page, 'exchanges'),
						].filter(Boolean)
					)
				: 'The user is not in any gift exchange with names drawn.'
			return toolOk(text, { exchanges: out, page })
		},
	})
}
