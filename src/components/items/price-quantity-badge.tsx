import { cn } from '@/lib/utils'

type Props = {
	price?: string | null
	quantity: number
	/**
	 * When true, suppress the quantity half even for qty > 1. Used by
	 * views that surface quantity via a separate indicator (e.g. the
	 * gifter view's QuantityRemainingBadge).
	 */
	hideQuantity?: boolean
	className?: string
}

export function PriceQuantityBadge({ price, quantity, hideQuantity = false, className }: Props) {
	const showPrice = !!price
	const showQty = !hideQuantity && quantity > 1
	if (!showPrice && !showQty) return null

	return (
		<span
			className={cn(
				'inline-flex items-stretch shrink-0 rounded-full border overflow-hidden text-xs font-medium whitespace-nowrap',
				className
			)}
		>
			{showPrice && <span className={cn('py-0.5 pl-2 text-foreground', showQty ? 'pr-1' : 'pr-2')}>${price}</span>}
			{showPrice && showQty && <span className="w-px bg-border" aria-hidden />}
			{showQty && <span className={cn('py-0.5 pr-2 text-foreground', showPrice ? 'pl-1' : 'pl-2')}>x{quantity}</span>}
		</span>
	)
}
