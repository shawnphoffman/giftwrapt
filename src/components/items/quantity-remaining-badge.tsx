import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const AVAILABILITY_DATE_FORMAT: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' }

type Variant = 'split' | 'inline' | 'inline-pill' | 'dots'

export type LockReason = 'order' | 'or'

type Props = {
	quantity: number
	remaining: number
	/**
	 * Optional total claimed quantity (sum of every gifter's claim quantity
	 * on this item). When provided AND `claimedCount > quantity`, the badge
	 * renders the over-claimed treatment: a yellow split pill that surfaces
	 * the truth ("N claimed, +M over") to gifters. This happens when the
	 * recipient lowers `items.quantity` after claims have been made; they
	 * never see the badge themselves (recipient-edit views don't include
	 * claim data), so spoiler protection is preserved while gifters get the
	 * accurate state. Without this prop the badge falls back to deriving
	 * `claimed = quantity - remaining`, which clamps to "fully claimed" for
	 * over-claimed items because `remaining` is clamped to 0 upstream.
	 */
	claimedCount?: number
	/**
	 * When true, the item is marked unavailable. Renders a red treatment
	 * across all variants (replacing the old standalone UnavailableBadge),
	 * trumping over-claim and standard fully-claimed treatments. Pair with
	 * `unavailableChangedAt` for a hover tooltip showing when it was marked.
	 */
	unavailable?: boolean
	/**
	 * Date when the item was marked unavailable. Drives the hover tooltip
	 * on the unavailable badge. Ignored unless `unavailable` is true.
	 */
	unavailableChangedAt?: Date | string | null
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
	claimedCount,
	unavailable = false,
	unavailableChangedAt,
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
	const isOverClaimed = claimedCount !== undefined && claimedCount > quantity

	const lockExplanation = isGroupLocked
		? lockReason === 'order'
			? 'Claim the item above this one first to unlock it.'
			: 'Someone already claimed an item in this pick-one group.'
		: 'Someone has already claimed this item.'

	// Unavailable trumps every other state. The recipient marked the item
	// unavailable, so claim status / over-claim / group locks are moot. Each
	// variant follows its native shape but in a red treatment, with a tooltip
	// showing the unavailable date when provided.
	if (unavailable) {
		const tooltip = unavailableChangedAt
			? `Marked unavailable on ${new Date(unavailableChangedAt).toLocaleDateString('en-US', AVAILABILITY_DATE_FORMAT)}`
			: null

		let pill: ReactNode
		if (variant === 'inline') {
			pill = (
				<span className={cn('inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-muted-foreground', className)}>
					<span>
						{firstPerson ? 'want' : 'wants'} {quantity}
					</span>
					<span aria-hidden>·</span>
					<span className="text-red-700 dark:text-red-400">unavailable</span>
				</span>
			)
		} else if (variant === 'inline-pill') {
			pill = (
				<span
					className={cn(
						'inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap rounded-full border px-2 py-0.5 text-muted-foreground',
						className
					)}
				>
					<span>
						{firstPerson ? 'Want' : 'Wants'} {quantity}
					</span>
					<span aria-hidden>·</span>
					<span className="text-red-700 dark:text-red-400">Unavailable</span>
				</span>
			)
		} else if (variant === 'dots') {
			pill = (
				<span
					className={cn(
						'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground',
						className
					)}
				>
					<span>×{quantity}</span>
					<span className="text-red-700 dark:text-red-400">Unavailable</span>
				</span>
			)
		} else {
			// 'split' (default)
			pill = (
				<span
					className={cn(
						'inline-flex items-stretch shrink-0 rounded-full border overflow-hidden text-xs font-medium whitespace-nowrap',
						'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
						className
					)}
				>
					<span className="inline-flex items-center gap-1 py-0.5 pl-2 pr-1">×{quantity}</span>
					<span className="w-px bg-red-500/40" aria-hidden />
					<span className="py-0.5 pl-1 pr-2">Unavailable</span>
				</span>
			)
		}

		if (tooltip) {
			return (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="inline-flex">{pill}</span>
					</TooltipTrigger>
					<TooltipContent side="top">{tooltip}</TooltipContent>
				</Tooltip>
			)
		}
		return pill
	}

	// Over-claim wins over every other branch: it short-circuits the qty<=1
	// "Claimed" pill and the standard "fully claimed" rendering, since both
	// would otherwise hide the truth from the gifter (the recipient lowered
	// items.quantity after claims existed). Each variant follows its own
	// native design with the yellow over-claim treatment.
	if (isOverClaimed) {
		const overBy = claimedCount - quantity
		const showLock = !youClaimed
		const explanation = `Already claimed by others. ${overBy} more pledged than the recipient asked for; you can't add to it.`

		if (variant === 'inline') {
			// Plain-text 3-way: dot separators between segments, no pill chrome.
			// "wants N · M claimed" stays muted (background context); "K over" is
			// yellow so the actionable signal stands out.
			const pill = (
				<span className={cn('inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-muted-foreground', className)}>
					{showLock && <Lock className="size-3" aria-hidden />}
					<span>
						{firstPerson ? 'want' : 'wants'} {quantity}
					</span>
					<span aria-hidden>·</span>
					<span>{claimedCount} claimed</span>
					<span aria-hidden>·</span>
					<span className="text-yellow-700 dark:text-yellow-400">{overBy} over</span>
				</span>
			)
			return wrapWithLockPopover(pill, showLock ? explanation : null)
		}

		if (variant === 'inline-pill') {
			// Compressed pill: text-only, no pips. Outer pill is muted (matches
			// the standard fully-claimed-by-others treatment) so only the
			// "{overBy} Overclaimed" segment carries the yellow signal.
			const pill = (
				<span
					className={cn(
						'inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap rounded-full border px-2 py-0.5 text-muted-foreground',
						className
					)}
				>
					{showLock && <Lock className="size-3" aria-hidden />}
					<span>
						{firstPerson ? 'Want' : 'Wants'} {quantity}
					</span>
					<span aria-hidden>·</span>
					<span className="text-yellow-700 dark:text-yellow-400">{overBy} Overclaimed</span>
				</span>
			)
			return wrapWithLockPopover(pill, showLock ? explanation : null)
		}

		if (variant === 'dots') {
			// Total pip strip: claimedCount pips. Legitimate slots (first
			// `quantity`) are muted; over slots (trailing `overBy`) are yellow,
			// matching how inline / inline-pill highlight only the over segment.
			// Outer pill is muted so the yellow pips + "overclaimed" word carry
			// the actionable signal.
			const pill = (
				<span
					className={cn(
						'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground',
						className
					)}
				>
					{showLock && <Lock className="size-3" aria-hidden />}
					<span>×{quantity}</span>
					<span className={cn('inline-flex items-center', claimedCount > 6 ? 'gap-[2px]' : 'gap-[3px]')} aria-hidden>
						{Array.from({ length: claimedCount }).map((_, i) => {
							const isOver = i >= quantity
							const tone = isOver ? 'bg-yellow-500 dark:bg-yellow-400' : 'bg-muted-foreground/50'
							if (claimedCount > 6) {
								return <span key={i} className={cn('h-1.5 w-[3px] rounded-full', tone)} />
							}
							return <span key={i} className={cn('size-1.5 rounded-full', tone)} />
						})}
					</span>
					<span className="text-yellow-700 dark:text-yellow-400">overclaimed</span>
				</span>
			)
			return wrapWithLockPopover(pill, showLock ? explanation : null)
		}

		// 'split' (default) - 3-way split: requested | claimed | over
		const splitPill = (
			<span
				className={cn(
					'inline-flex items-stretch shrink-0 rounded-full border overflow-hidden text-xs font-medium whitespace-nowrap',
					'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
					className
				)}
			>
				<span className="inline-flex items-center gap-1 py-0.5 pl-2 pr-1">
					{showLock && <Lock className="size-3" aria-hidden />}×{quantity}
				</span>
				<span className="w-px bg-yellow-500/40" aria-hidden />
				<span className="py-0.5 px-1">×{claimedCount} Claimed</span>
				<span className="w-px bg-yellow-500/40" aria-hidden />
				<span className="py-0.5 pl-1 pr-2">×{overBy} Over</span>
			</span>
		)
		return wrapWithLockPopover(splitPill, showLock ? explanation : null)
	}

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
		const wantsLabel = isPill ? (firstPerson ? 'Want' : 'Wants') : firstPerson ? 'want' : 'wants'
		const claimedLabel = isPill ? (fullyClaimed ? 'All Claimed' : `${remaining} Left`) : fullyClaimed ? 'all claimed' : `${remaining} left`
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
					{wantsLabel} {quantity}
				</span>
				{hasClaims && (
					<>
						<span aria-hidden>·</span>
						<span className={cn(success ? undefined : fullyClaimed ? 'text-muted-foreground' : 'text-orange-600 dark:text-orange-400')}>
							{claimedLabel}
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
					'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
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
				'inline-flex items-stretch shrink-0 rounded-full border overflow-hidden text-xs font-medium whitespace-nowrap',
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
						{fullyClaimed ? 'All Claimed' : `${remaining} Left`}
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
