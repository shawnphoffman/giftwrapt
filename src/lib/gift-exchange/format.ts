// Formatting shared by the admin exchange screens and everyone's Gift
// Exchange page. Renders in the current request's language at call time.

import { formatCalendarDate, formatCurrency } from '@/lib/i18n/format'

/** The gift date, a calendar date, as "Dec 25, 2026". */
export function giftDateLabel(giftDate: string): string {
	return formatCalendarDate(giftDate, { dateStyle: 'medium' })
}

/** The budget in its own currency, whole amounts without cents: "$50". */
export function exchangeBudgetLabel(budget: number, budgetCurrency: string | null): string {
	return formatCurrency(budget, budgetCurrency ?? undefined, { wholeWhenRound: true })
}
