import { Link } from '@tanstack/react-router'
import { List } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type Props = {
	listId: number
	name: string
	/**
	 * Source list id. When set, gets attached as `?from=<id>` so the
	 * destination can render a "Back to <parent>" affordance. The param
	 * drops off naturally when the user clicks Back or navigates away.
	 */
	from?: number
	className?: string
}

export default function ListLinkBadge({ listId, name, from, className }: Props) {
	return (
		<TooltipProvider delayDuration={150}>
			<Tooltip>
				<TooltipTrigger asChild>
					<Link
						to="/lists/$listId"
						params={{ listId: String(listId) }}
						search={from !== undefined ? { from } : undefined}
						className={cn(
							'shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-normal bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900 transition-colors max-w-[40%] cursor-pointer',
							className
						)}
					>
						<List className="size-3 shrink-0" />
						<span className="truncate">{name}</span>
					</Link>
				</TooltipTrigger>
				<TooltipContent>Links to another list</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	)
}
