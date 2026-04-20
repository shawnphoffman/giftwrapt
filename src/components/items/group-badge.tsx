import { CircleDot, HelpCircle, ListOrdered } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { GroupType } from '@/db/schema/enums'

type Props = {
	type: GroupType
	className?: string
	showHelp?: boolean
}

const GROUP_COPY: Record<GroupType, { label: string; help: string }> = {
	or: {
		label: 'Pick one',
		help: 'The recipient wants one item from this group, not all. Once someone claims an item here, the others are considered fulfilled.',
	},
	order: {
		label: 'In order',
		help: 'Items in this group should be claimed in the order shown, top first. Useful when one item depends on another (e.g. a console before its controllers).',
	},
}

/**
 * Visual indicator for an item group on both the edit and view pages.
 * When `showHelp` is set, renders a sibling help icon with a hover tooltip.
 */
export function GroupBadge({ type, className, showHelp }: Props) {
	const Icon = type === 'or' ? CircleDot : ListOrdered
	const { label, help } = GROUP_COPY[type]

	const badge = (
		<Badge variant="outline" className={className}>
			<Icon className="size-3 mr-1" />
			{label}
		</Badge>
	)

	if (!showHelp) return badge

	return (
		<>
			{badge}
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={`About "${label}" groups`}
						className="inline-flex items-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-full"
						onClick={e => e.stopPropagation()}
					>
						<HelpCircle className="size-5" />
					</button>
				</TooltipTrigger>
				<TooltipContent className="max-w-64 text-xs leading-relaxed" side="top" align="start">
					{help}
				</TooltipContent>
			</Tooltip>
		</>
	)
}
