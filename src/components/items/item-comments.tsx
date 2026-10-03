import { MessageSquare } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

const ItemCommentsPanel = lazy(() => import('./item-comments-panel'))

type Props = {
	itemId: number
	commentCount?: number
	/**
	 * Optional slot rendered on the same line as the expand trigger,
	 * right-aligned. Used to surface small contextual metadata
	 * (e.g. a quantity/remaining badge) without stealing a row.
	 */
	trailing?: React.ReactNode
}

export function ItemComments({ itemId, commentCount = 0, trailing }: Props) {
	const [expanded, setExpanded] = useState(commentCount > 0)
	const [mounted, setMounted] = useState(commentCount > 0)
	// The grid row is 1fr only after the panel has rendered at 0fr, so an
	// expand transitions instead of jumping open.
	const [open, setOpen] = useState(commentCount > 0)
	// Clip only while closed or moving. Once open the overflow is visible so
	// the textarea's focus ring isn't cut off.
	const [settled, setSettled] = useState(commentCount > 0)
	const [liveCount, setLiveCount] = useState(commentCount)
	const displayCount = liveCount
	const prefersReducedMotion = useReducedMotion()
	const gridRef = useRef<HTMLDivElement>(null)

	// The height comes from a CSS grid row (0fr -> 1fr), never a measured
	// pixel value. The panel's content arrives late (lazy chunk, comments
	// query, and a field-sizing textarea that grows), and a height animated to
	// a measurement taken before that left the composer clipped on mobile.
	// A panel that starts expanded renders open with no animation.
	useLayoutEffect(() => {
		if (!mounted || !expanded || open) return
		// Commit the 0fr style before flipping to 1fr so the change transitions.
		void gridRef.current?.offsetHeight
		setOpen(true)
		if (prefersReducedMotion) setSettled(true)
	}, [mounted, expanded, open, prefersReducedMotion])

	const toggle = () => {
		if (expanded) {
			setExpanded(false)
			setOpen(false)
			setSettled(false)
			if (prefersReducedMotion) setMounted(false)
		} else {
			setExpanded(true)
			setMounted(true)
		}
	}

	return (
		<div className="@container flex flex-col gap-2">
			<div className="flex flex-col-reverse gap-2 @md:flex-row @md:items-center">
				<button
					type="button"
					onClick={toggle}
					className={cn(
						'flex items-center gap-1.5 text-xs w-fit',
						displayCount > 0
							? 'font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300'
							: 'text-muted-foreground hover:text-foreground'
					)}
				>
					<MessageSquare className="size-3.5" />
					{displayCount > 0 ? `${displayCount} comment${displayCount !== 1 ? 's' : ''}` : 'Add comment'}
				</button>
				{trailing && <div className="@md:ml-auto self-end">{trailing}</div>}
			</div>

			{mounted && (
				<div
					ref={gridRef}
					className={cn(
						'grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none',
						open ? 'opacity-100' : 'opacity-0'
					)}
					style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
					onTransitionEnd={e => {
						if (e.target !== e.currentTarget || e.propertyName !== 'grid-template-rows') return
						if (open) setSettled(true)
						else setMounted(false)
					}}
				>
					<div className={cn('min-h-0', !settled && 'overflow-hidden')}>
						<Suspense fallback={null}>
							<ItemCommentsPanel itemId={itemId} onCountChange={setLiveCount} />
						</Suspense>
					</div>
				</div>
			)}
		</div>
	)
}
