import { useMoney } from '@/hooks/use-money'
import { cn } from '@/lib/utils'

type Props = {
	price?: string | null
	/** The currency stored with the price, if any. A plain amount with none uses the deployment's. */
	currency?: string | null
	quantity: number
	/**
	 * When true, suppress the quantity half even for qty > 1. Used by
	 * views that surface quantity via a separate indicator (e.g. the
	 * gifter view's QuantityRemainingBadge).
	 */
	hideQuantity?: boolean
	className?: string
}

export function PriceQuantityBadge({ price, currency, quantity, hideQuantity = false, className }: Props) {
	const money = useMoney()
	const showPrice = !!price
	const showQty = !hideQuantity && quantity > 1
	if (!showPrice && !showQty) return null

	// Free text: a plain amount is shown as money, anything else as typed.
	const displayPrice = price ? money.itemPrice(price, currency) : ''

	return (
		<span
			className={cn(
				'inline-flex items-stretch shrink-0 rounded-full border overflow-hidden text-xs font-medium whitespace-nowrap',
				className
			)}
		>
			{showPrice && <span className={cn('py-0.5 pl-2 text-foreground', showQty ? 'pr-1' : 'pr-2')}>{displayPrice}</span>}
			{showPrice && showQty && <span className="w-px bg-border" aria-hidden />}
			{/* eslint-disable-next-line i18next/no-literal-string -- multiplier sign, not a word */}
			{showQty && <span className={cn('py-0.5 pr-2 text-foreground', showPrice ? 'pl-1' : 'pl-2')}>x{quantity}</span>}
		</span>
	)
}
