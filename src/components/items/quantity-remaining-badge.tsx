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
	/**
	 * When true, render the badge in the green/success treatment to
	 * communicate that the current viewer is among the claimers ("you
	 * claimed this"). Overrides the muted "fully claimed" styling.
	 */
	youClaimed?: boolean
	className?: string
}

/**
 * Consolidates "wanted qty" + "how many still unclaimed" for the gifter
 * view. For multi-quantity items it surfaces the desired count and, when
 * claims exist, how many slots remain. For single-quantity items it
 * renders nothing while unclaimed and a "Claimed" / "You claimed this"
 * pill once a claim is made. The badge is the source of truth for the
 * claim state, so callers don't need a separate Claim / Fully-claimed
 * control to communicate it.
 */
export function QuantityRemainingBadge({
	quantity,
	remaining,
	variant = 'split',
	firstPerson = false,
	youClaimed = false,
	className,
}: Props) {
	if (quantity <= 1) {
		if (remaining > 0) return null
		// qty=1, claimed: render a single-segment "Claimed" pill (green when the viewer is the claimer).
		const label = 'Claimed'
		const successTone = youClaimed
		const isInline = variant === 'inline'
		const isPill = variant === 'inline-pill' || variant === 'dots' || variant === 'split'
		return (
			<span
				className={cn(
					'inline-flex items-center text-xs font-medium whitespace-nowrap',
					isPill && 'rounded-full border px-2 py-0.5',
					successTone
						? cn('text-emerald-700 dark:text-emerald-400', isPill && 'border-emerald-500/30 bg-emerald-500/10')
						: 'text-muted-foreground',
					isInline && 'px-0',
					className
				)}
			>
				{label}
			</span>
		)
	}

	const claimed = quantity - remaining
	const hasClaims = claimed > 0
	const fullyClaimed = remaining === 0
	// Green/success treatment is reserved for the "you fully claimed it" milestone.
	// Partial-claim states (even when the viewer is one of the claimers) stay in the
	// neutral + orange treatment; the claimer presence is communicated by ClaimUsers.
	const success = youClaimed && fullyClaimed

	if (variant === 'inline' || variant === 'inline-pill') {
		const isPill = variant === 'inline-pill'
		return (
			<span
				className={cn(
					'inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap',
					success ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
					isPill && 'rounded-full border px-2 py-0.5',
					isPill && success && 'border-emerald-500/30 bg-emerald-500/10',
					className
				)}
			>
				<span className={cn(success ? undefined : fullyClaimed ? undefined : 'text-foreground')}>
					{firstPerson ? 'want' : 'wants'} {quantity}
				</span>
				{hasClaims && (
					<>
						<span aria-hidden>·</span>
						<span className={cn(success ? undefined : fullyClaimed ? 'text-muted-foreground' : 'text-orange-600 dark:text-orange-400')}>
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
					success && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
					!success && fullyClaimed && 'text-muted-foreground',
					className
				)}
			>
				<span className={cn(success ? undefined : fullyClaimed ? undefined : 'text-foreground')}>×{quantity}</span>
				<span className={cn('inline-flex items-center', quantity > 6 ? 'gap-[2px]' : 'gap-[3px]')} aria-hidden>
					{Array.from({ length: quantity }).map((_, i) => {
						const filled = i < claimed
						const base = success
							? filled
								? 'bg-emerald-500 dark:bg-emerald-400'
								: 'bg-emerald-500/30 dark:bg-emerald-400/30'
							: fullyClaimed
								? 'bg-muted-foreground/50'
								: filled
									? 'bg-muted-foreground/50'
									: 'bg-orange-500 dark:bg-orange-400'
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
				success && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
				!success && fullyClaimed && 'text-muted-foreground',
				className
			)}
		>
			<span className={cn('py-0.5 pl-2', !success && !fullyClaimed && 'text-foreground', hasClaims ? 'pr-1' : 'pr-2')}>×{quantity}</span>
			{hasClaims && (
				<>
					<span className={cn('w-px', success ? 'bg-emerald-500/30' : 'bg-border')} aria-hidden />
					<span className={cn('py-0.5 pl-1 pr-2', !success && !fullyClaimed && 'text-orange-700 dark:text-orange-400 bg-orange-500/10')}>
						{fullyClaimed ? 'all claimed' : `${remaining} left`}
					</span>
				</>
			)}
		</span>
	)
}
