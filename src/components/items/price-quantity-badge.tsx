import { cn } from '@/lib/utils'

type Props = {
	price?: string | null
	quantity: number
	className?: string
}

export function PriceQuantityBadge({ price, quantity, className }: Props) {
	const showPrice = !!price
	const showQty = quantity > 1
	if (!showPrice && !showQty) return null

	return (
		<span
			className={cn(
				'inline-flex items-stretch shrink-0 rounded-full border overflow-hidden text-xs font-medium whitespace-nowrap tabular-nums',
				className
			)}
		>
			{showPrice && <span className="px-2 py-0.5 text-foreground">${price}</span>}
			{showPrice && showQty && <span className="w-px bg-border" aria-hidden />}
			{showQty && <span className="px-2 py-0.5 text-foreground">x{quantity}</span>}
		</span>
	)
}
