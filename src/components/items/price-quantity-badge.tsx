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
			{showPrice && (
				<span className={cn('py-0.5 pl-2 text-foreground', showQty ? 'pr-1' : 'pr-2')}>${price}</span>
			)}
			{showPrice && showQty && <span className="w-px bg-border" aria-hidden />}
			{showQty && (
				<span className={cn('py-0.5 pr-2 text-foreground', showPrice ? 'pl-1' : 'pl-2')}>x{quantity}</span>
			)}
		</span>
	)
}
