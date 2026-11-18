import { useMemo } from 'react'

import { useAppSetting } from '@/hooks/use-app-settings'
import { currencySymbol, formatCurrency, formatItemPrice } from '@/lib/i18n/format'

// Money formatting for components (plan 36f). Amounts with no currency of
// their own (purchase totals, price filters, budgets) are shown in the
// deployment's `defaultCurrency`; an item's price uses the currency stored
// with it and falls back to the same default.
export function useMoney() {
	const defaultCurrency = useAppSetting('defaultCurrency')
	return useMemo(
		() => ({
			defaultCurrency,
			/** "$": what to print beside an amount field. */
			symbol: currencySymbol(defaultCurrency),
			/** "$12.50": an amount in the deployment's currency. */
			amount: (value: number) => formatCurrency(value, defaultCurrency),
			/** "$25": the same, without decimals when the amount is round. */
			roundAmount: (value: number) => formatCurrency(value, defaultCurrency, { wholeWhenRound: true }),
			/** An item's free-text price; see `formatItemPrice`. */
			itemPrice: (price: string, currency?: string | null) => formatItemPrice(price, currency, defaultCurrency),
		}),
		[defaultCurrency]
	)
}
