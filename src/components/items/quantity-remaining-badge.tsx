import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type Variant = 'split' | 'inline' | 'inline-pill' | 'dots'

export type LockReason = 'order' | 'or'

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
	/**
	 * When set, the viewer is blocked from claiming because of a group
	 * rule. `order` means an earlier item in the ordered group still has
	 * slots open; `or` means a sibling in the pick-one group is already
	 * claimed. The badge renders a Lock icon + popover that explains the
	 * lock. "Fully claimed by others" (remaining===0 and !youClaimed) is
	 * inferred internally and does not need this prop.
	 */
	lockReason?: LockReason
	className?: string
}

/**
 * Consolidates "wanted qty", "how many still unclaimed", and "viewer
 * can't claim" into a single trailing pill so list rows have one source
 * of truth for claim/lock state. For multi-quantity items it surfaces
 * the desired count and, when claims exist, how many slots remain. For
 * single-quantity items it renders nothing while unclaimed and a
 * "Claimed" / "You claimed this" pill once a claim is made. When the
 * viewer is locked out (group rule or fully claimed by others) it adds
 * a Lock icon and a popover with the reason.
 */
export function QuantityRemainingBadge({
	quantity,
	remaining,
	variant = 'split',
	firstPerson = false,
	youClaimed = false,
	lockReason,
	className,
}: Props) {
	const fullyClaimed = remaining === 0
	const lockedByOthers = fullyClaimed && !youClaimed
	// `order`/`or` group locks only matter while slots are still open; once
	// remaining hits 0 the "claimed by others" branch already covers it.
	const isGroupLocked = !!lockReason && remaining > 0 && !youClaimed
	const isLocked = lockedByOthers || isGroupLocked

	const lockExplanation = isGroupLocked
		? lockReason === 'order'
			? 'Claim the item above this one first to unlock it.'
			: 'Someone already claimed an item in this pick-one group.'
		: 'Someone has already claimed this item.'

	if (quantity <= 1) {
		if (remaining > 0 && !isGroupLocked) return null
		// qty=1 covers two locked branches: "claimed by others" (Claimed pill
		// + Lock icon + popover) and "group-locked while still unclaimed"
		// (Locked label + popover, no claim copy yet).
		const successTone = youClaimed
		const isInline = variant === 'inline'
		const isPill = variant === 'inline-pill' || variant === 'dots' || variant === 'split'
		const label = isGroupLocked ? 'Locked' : 'Claimed'
		const pill = (
			<span
				className={cn(
					'inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap',
					isPill && 'rounded-full border px-2 py-0.5',
					successTone
						? cn('text-emerald-700 dark:text-emerald-400', isPill && 'border-emerald-500/30 bg-emerald-500/10')
						: 'text-muted-foreground',
					isInline && 'px-0',
					className
				)}
			>
				{isLocked && <Lock className="size-3" aria-hidden />}
				{label}
			</span>
		)
		return wrapWithLockPopover(pill, isLocked ? lockExplanation : null)
	}

	const claimed = quantity - remaining
	const hasClaims = claimed > 0
	// Green/success treatment is reserved for the "you fully claimed it" milestone.
	// Partial-claim states (even when the viewer is one of the claimers) stay in the
	// neutral + orange treatment; the claimer presence is communicated by ClaimUsers.
	const success = youClaimed && fullyClaimed

	if (isGroupLocked) {
		// While group-locked and unclaimed, hide the quantity copy entirely;
		// the Lock pill is the only signal the viewer needs.
		const isInline = variant === 'inline'
		const isPill = !isInline
		const pill = (
			<span
				className={cn(
					'inline-flex items-center gap-1 text-xs font-medium text-muted-foreground whitespace-nowrap',
					isPill && 'rounded-full border px-2 py-0.5',
					className
				)}
			>
				<Lock className="size-3" aria-hidden />
				Locked
			</span>
		)
		return wrapWithLockPopover(pill, lockExplanation)
	}

	if (variant === 'inline' || variant === 'inline-pill') {
		const isPill = variant === 'inline-pill'
		const pill = (
			<span
				className={cn(
					'inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap',
					success ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
					isPill && 'rounded-full border px-2 py-0.5',
					isPill && success && 'border-emerald-500/30 bg-emerald-500/10',
					className
				)}
			>
				{lockedByOthers && <Lock className="size-3" aria-hidden />}
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
		return wrapWithLockPopover(pill, lockedByOthers ? lockExplanation : null)
	}

	if (variant === 'dots') {
		const pill = (
			<span
				className={cn(
					'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums',
					success && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
					!success && fullyClaimed && 'text-muted-foreground',
					className
				)}
			>
				{lockedByOthers && <Lock className="size-3" aria-hidden />}
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
		return wrapWithLockPopover(pill, lockedByOthers ? lockExplanation : null)
	}

	// 'split' (default) - matches the PriceQuantityBadge divided pill.
	const splitPill = (
		<span
			className={cn(
				'inline-flex items-stretch shrink-0 rounded-full border overflow-hidden text-xs font-medium whitespace-nowrap tabular-nums',
				success && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
				!success && fullyClaimed && 'text-muted-foreground',
				className
			)}
		>
			<span
				className={cn(
					'inline-flex items-center gap-1 py-0.5 pl-2',
					!success && !fullyClaimed && 'text-foreground',
					hasClaims ? 'pr-1' : 'pr-2'
				)}
			>
				{lockedByOthers && <Lock className="size-3" aria-hidden />}×{quantity}
			</span>
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
	return wrapWithLockPopover(splitPill, lockedByOthers ? lockExplanation : null)
}

function wrapWithLockPopover(pill: ReactNode, explanation: string | null): ReactNode {
	if (!explanation) return pill
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="inline-flex items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{pill}
				</button>
			</PopoverTrigger>
			<PopoverContent side="top" align="end" className="w-auto max-w-xs text-xs leading-relaxed">
				{explanation}
			</PopoverContent>
		</Popover>
	)
}
