import { cn } from '@/lib/utils'

type Variant = 'split' | 'inline' | 'inline-pill' | 'dots'

type Props = {
	quantity: number
	remaining: number
	/**
	 * Visual treatment. `split` matches PriceQuantityBadge's divided pill,
	 * `inline` is a single-line muted phrase, `dots` adds a filled/empty
	 * pip row as a mini progress indicator.
	 */
	variant?: Variant
	/**
	 * When true, render in first person ("want X") instead of third
	 * person ("wants X"). Used in the recipient's own list where the
	 * badge speaks on their behalf.
	 */
	firstPerson?: boolean
	className?: string
}

/**
 * Consolidates "wanted qty" + "how many still unclaimed" for the gifter
 * view. Renders nothing when quantity is 1 (a singleton's claim state is
 * communicated elsewhere by Claim / Fully claimed controls). For
 * multi-quantity items it always surfaces the desired count and, when
 * claims exist, how many slots remain.
 */
export function QuantityRemainingBadge({ quantity, remaining, variant = 'split', firstPerson = false, className }: Props) {
	if (quantity <= 1) return null

	const claimed = quantity - remaining
	const hasClaims = claimed > 0
	const fullyClaimed = remaining === 0

	if (variant === 'inline' || variant === 'inline-pill') {
		const isPill = variant === 'inline-pill'
		return (
			<span
				className={cn(
					'inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-muted-foreground',
					isPill && 'rounded-full border px-2 py-0.5',
					className
				)}
			>
				<span className={fullyClaimed ? undefined : 'text-foreground'}>
					{firstPerson ? 'want' : 'wants'} {quantity}
				</span>
				{hasClaims && (
					<>
						<span aria-hidden>·</span>
						<span className={cn(fullyClaimed ? 'text-muted-foreground' : 'text-emerald-600 dark:text-emerald-400')}>
							{fullyClaimed ? 'all claimed' : `${remaining} left`}
						</span>
					</>
				)}
			</span>
		)
	}

	if (variant === 'dots') {
		return (
			<span
				className={cn(
					'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums',
					fullyClaimed && 'text-muted-foreground',
					className
				)}
			>
				<span className={fullyClaimed ? undefined : 'text-foreground'}>×{quantity}</span>
				<span className={cn('inline-flex items-center', quantity > 6 ? 'gap-[2px]' : 'gap-[3px]')} aria-hidden>
					{Array.from({ length: quantity }).map((_, i) => {
						const filled = i < claimed
						const base = fullyClaimed ? 'bg-muted-foreground/50' : filled ? 'bg-muted-foreground/50' : 'bg-emerald-500 dark:bg-emerald-400'
						if (quantity > 6) {
							// Compact mode: each pip is a half-width capsule (~half a circle)
							// so long quantities still fit inside the badge.
							return <span key={i} className={cn('h-1.5 w-[3px] rounded-full', base)} />
						}
						return <span key={i} className={cn('size-1.5 rounded-full', base)} />
					})}
				</span>
				{hasClaims && <span>{fullyClaimed ? 'claimed' : `${remaining} left`}</span>}
			</span>
		)
	}

	// 'split' (default) - matches the PriceQuantityBadge divided pill.
	return (
		<span
			className={cn(
				'inline-flex items-stretch shrink-0 rounded-full border overflow-hidden text-xs font-medium whitespace-nowrap tabular-nums',
				fullyClaimed && 'text-muted-foreground',
				className
			)}
		>
			<span className={cn('py-0.5 pl-2', !fullyClaimed && 'text-foreground', hasClaims ? 'pr-1' : 'pr-2')}>×{quantity}</span>
			{hasClaims && (
				<>
					<span className="w-px bg-border" aria-hidden />
					<span className={cn('py-0.5 pl-1 pr-2', !fullyClaimed && 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10')}>
						{fullyClaimed ? 'all claimed' : `${remaining} left`}
					</span>
				</>
			)}
		</span>
	)
}
