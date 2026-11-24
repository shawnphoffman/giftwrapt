// Text for everyone's Gift Exchange page. Every function renders at call
// time, never at module load (see messages/README.md).

import type { MyExchange } from '@/api/_my-gift-exchanges-impl'
import { exchangeBudgetLabel, giftDateLabel } from '@/lib/gift-exchange/format'
import { m } from '@/paraglide/messages.js'

/**
 * The exchange card's description: the budget (when there is one) and the
 * gift date, and once the person has looked, "You're gifting to:" above
 * their person's card.
 */
export function exchangeLine(exchange: Pick<MyExchange, 'giftDate' | 'budget' | 'budgetCurrency'>, seen: boolean): string {
	const date = giftDateLabel(exchange.giftDate)
	if (exchange.budget === null) return seen ? m.exchanges_seen_meta({ date }) : date
	const budget = exchangeBudgetLabel(exchange.budget, exchange.budgetCurrency)
	return seen ? m.exchanges_seen_meta_with_budget({ budget, date }) : m.exchanges_meta_with_budget({ budget, date })
}

/** A typed refusal from a reveal, for a toast. */
export function revealRefusalText(reason: string | undefined): string {
	switch (reason) {
		case 'not-member':
			return m.exchanges_error_not_member()
		case 'not-drawn':
			return m.exchanges_error_not_drawn()
		case 'archived':
			return m.exchanges_error_archived()
		case 'not-guardian':
			return m.exchanges_error_not_guardian()
		default:
			return m.exchanges_error_failed()
	}
}
