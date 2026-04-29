// Inspired by: Stripe Checkout success check + radial ring pulse,
// Vercel deploy success indicator. Crossfades from claim button to
// claimed to edit-claim with no flash back to "Claim" mid-flight.

import { Gift, Pencil } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ClaimStage = 'idle' | 'animating' | 'settled'

type Props = {
	stage: ClaimStage
	className?: string
}

/**
 * Renders the claim button across its three lifecycle states:
 * idle (Claim), animating (Claimed + check + ring pulse), settled
 * (Edit claim). The gift icon morphs to a check during the
 * animating stage; a soft radial ring pulses outward.
 */
export function ClaimButton({ stage, className }: Props) {
	const reduced = useReducedMotion()
	const fade = reduced ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' as const }

	return (
		<div className={cn('relative inline-flex items-center', className)}>
			<AnimatePresence mode="wait" initial={false}>
				{stage === 'idle' && (
					<motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
						<Button size="sm" variant="outline" className="h-8 pointer-events-none">
							<Gift className="size-3.5" />
							Claim
						</Button>
					</motion.span>
				)}
				{stage === 'animating' && (
					<motion.span
						key="animating"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={fade}
						className="relative inline-flex"
					>
						<ClaimedButton />
						{!reduced && (
							<motion.span
								aria-hidden
								initial={{ opacity: 0.55, scale: 0.5 }}
								animate={{ opacity: 0, scale: 1.3 }}
								transition={{ duration: 0.45, ease: 'easeOut' }}
								className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-primary/50"
							/>
						)}
					</motion.span>
				)}
				{stage === 'settled' && (
					<motion.span key="settled" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
						<Button size="sm" variant="outline" className="h-8 text-foreground pointer-events-none">
							<Pencil className="size-3.5" />
							Edit claim
						</Button>
					</motion.span>
				)}
			</AnimatePresence>
		</div>
	)
}

function ClaimedButton() {
	const reduced = useReducedMotion()
	const swap = reduced ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' as const }
	return (
		<Button size="sm" variant="default" className="h-8 pointer-events-none" aria-live="polite">
			<span className="relative inline-flex size-4 items-center justify-center">
				<motion.span
					initial={reduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={swap}
					className="inline-flex items-center justify-center"
				>
					<CheckSvg />
				</motion.span>
			</span>
			Claimed
		</Button>
	)
}

function CheckSvg() {
	const reduced = useReducedMotion()
	return (
		<svg viewBox="0 0 16 16" fill="none" className="size-3.5" aria-hidden>
			<motion.path
				d="M3 8.5 L6.5 12 L13 4.5"
				stroke="currentColor"
				strokeWidth={2.2}
				strokeLinecap="round"
				strokeLinejoin="round"
				initial={{ pathLength: reduced ? 1 : 0 }}
				animate={{ pathLength: 1 }}
				transition={{ duration: reduced ? 0 : 0.3, ease: 'easeOut', delay: reduced ? 0 : 0.06 }}
			/>
		</svg>
	)
}
