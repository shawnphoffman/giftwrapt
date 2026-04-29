import { motion, useReducedMotion } from 'motion/react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'

type Props = {
	/**
	 * Fires after the celebration window closes. Caller should swap to the
	 * normal "Edit claim" button on this callback.
	 */
	onComplete: () => void
}

const CELEBRATION_MS = 2400

/**
 * Plays the claim-success flourish: gift-icon-replaced-by-check morph
 * inside a primary "Claimed" button, plus a soft radial ring pulse.
 * The button is intentionally non-interactive while the celebration
 * runs - the parent should re-render the real "Edit claim" affordance
 * on `onComplete`. Honors `prefers-reduced-motion`.
 */
export function ClaimCelebration({ onComplete }: Props) {
	const reduced = useReducedMotion()

	useEffect(() => {
		const t = setTimeout(onComplete, reduced ? 0 : CELEBRATION_MS)
		return () => clearTimeout(t)
	}, [onComplete, reduced])

	return (
		<div className="relative inline-flex items-center">
			<Button size="sm" variant="default" className="h-7 pointer-events-none" aria-live="polite">
				<span className="relative inline-flex size-3.5 items-center justify-center">
					<motion.span
						initial={reduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={reduced ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
						className="inline-flex items-center justify-center"
					>
						<CheckPath />
					</motion.span>
				</span>
				Claimed
			</Button>
			{!reduced && (
				<motion.span
					aria-hidden
					initial={{ opacity: 0.55, scale: 0.5 }}
					animate={{ opacity: 0, scale: 1.3 }}
					transition={{ duration: 0.45, ease: 'easeOut' }}
					className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-primary/50"
				/>
			)}
		</div>
	)
}

function CheckPath() {
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
