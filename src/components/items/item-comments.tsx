import { MessageSquare } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { lazy, Suspense, useEffect, useState } from 'react'

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
	const [liveCount, setLiveCount] = useState(commentCount)
	const displayCount = liveCount
	const prefersReducedMotion = useReducedMotion()
	const duration = prefersReducedMotion ? 0 : 0.18

	// Mount immediately on expand; on collapse, the motion.div animates to
	// height: 0 and onAnimationComplete fires the unmount. Going through
	// AnimatePresence + exit dropped the close animation when Suspense was
	// inside the motion.div.
	useEffect(() => {
		if (expanded) setMounted(true)
	}, [expanded])

	return (
		<div className="@container flex flex-col gap-2">
			<div className="flex flex-col-reverse gap-2 @md:flex-row @md:items-center">
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
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
				<motion.div
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0 }}
					transition={{ duration, ease: 'easeOut' }}
					onAnimationComplete={() => {
						if (!expanded) setMounted(false)
					}}
					className="overflow-hidden"
				>
					<Suspense fallback={null}>
						<ItemCommentsPanel itemId={itemId} onCountChange={setLiveCount} />
					</Suspense>
				</motion.div>
			)}
		</div>
	)
}
