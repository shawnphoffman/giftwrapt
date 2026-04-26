import { MessageSquare } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { lazy, Suspense, useState } from 'react'

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
	const [liveCount, setLiveCount] = useState(commentCount)
	const displayCount = liveCount
	const prefersReducedMotion = useReducedMotion()
	const duration = prefersReducedMotion ? 0 : 0.18

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

			<AnimatePresence initial={false}>
				{expanded && (
					<motion.div
						key="comments-panel"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration, ease: 'easeOut' }}
						className="overflow-hidden"
					>
						<Suspense fallback={null}>
							<ItemCommentsPanel itemId={itemId} onCountChange={setLiveCount} />
						</Suspense>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}
