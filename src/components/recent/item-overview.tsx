import { Link } from '@tanstack/react-router'
import { formatDistanceToNow } from 'date-fns'
import { ArrowRight, MessageSquare } from 'lucide-react'

import ListTypeIcon from '@/components/common/list-type-icon'
import PriorityIcon from '@/components/common/priority-icon'
import UrlBadge from '@/components/common/url-badge'
import UserAvatar from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ListType, Priority } from '@/db/schema/enums'
import { priorityRingClass, priorityTabBgClass } from '@/lib/priority-classes'
import { cn } from '@/lib/utils'

export type ItemOverviewProps = {
	id: number
	title: string
	url: string | null
	priority: Priority
	imageUrl?: string | null
	commentCount?: number
	createdAt: Date | string
	listId: number
	listName: string
	listType: ListType
	listOwnerName: string | null
	listOwnerEmail: string
	listOwnerImage?: string | null
}

export default function ItemOverview(props: ItemOverviewProps) {
	const {
		id,
		title,
		url,
		priority,
		imageUrl,
		commentCount = 0,
		createdAt,
		listId,
		listName,
		listType,
		listOwnerName,
		listOwnerEmail,
		listOwnerImage,
	} = props

	const ownerName = listOwnerName || listOwnerEmail
	const when = formatDistanceToNow(new Date(createdAt), { addSuffix: true })
	const hasPriorityTab = priority !== 'normal'

	return (
		<div className="relative">
			{hasPriorityTab && (
				<div
					className={cn(
						'absolute left-0 top-0 h-[calc(100%-4px)] -translate-x-1/2 translate-y-[2px] w-12 rounded-md shadow-sm drop-shadow-[1px_1px_10px_rgb(0_0_0_/_0.2)] dark:drop-shadow-[1px_1px_10px_rgb(0_0_0_/_0.5)] hidden xs:flex items-center p-1 z-0',
						priorityTabBgClass[priority]
					)}
					aria-hidden
				>
					<PriorityIcon priority={priority} className="size-4" />
				</div>
			)}
			<div
				className={cn(
					'relative z-10 flex items-stretch gap-3 p-3 ps-4 ring-1 ring-inset ring-border rounded-lg bg-card shadow-sm',
					priorityRingClass[priority]
				)}
			>
				<div className="@container flex flex-col flex-1 min-w-0 gap-2 scroll-mt-24">
					{/* HEADER */}
					<div className="flex items-center gap-2 min-w-0 font-medium leading-tight">
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="shrink-0 inline-flex">
									<UserAvatar name={ownerName} image={listOwnerImage} size="small" className="size-7" />
								</span>
							</TooltipTrigger>
							<TooltipContent side="top">{ownerName}</TooltipContent>
						</Tooltip>
						<span className="truncate min-w-0">{title}</span>
						<UrlBadge url={url} />
					</div>

					{/* LIST + TIME */}
					<div className="mt-auto pl-9 flex flex-col @[16rem]:flex-row @[16rem]:items-center gap-x-2 gap-y-0.5 min-w-0 text-xs text-muted-foreground">
						<Link
							to="/lists/$listId"
							params={{ listId: String(listId) }}
							className="hover:underline truncate inline-flex items-center gap-1 min-w-0 cursor-pointer"
						>
							<ListTypeIcon type={listType} className="size-3 shrink-0" />
							<span className="truncate">{listName}</span>
						</Link>
						<span aria-hidden className="hidden @[16rem]:inline">
							·
						</span>
						<span className="shrink-0">{when}</span>
					</div>
				</div>

				{imageUrl && (
					<div className="shrink-0 self-stretch overflow-hidden rounded-md ring-1 ring-inset ring-border bg-muted/40">
						<img src={imageUrl} alt={title} className="h-full w-16 xs:w-24 object-cover" />
					</div>
				)}

				<div className="flex flex-col items-center justify-between shrink-0 self-stretch gap-2">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button asChild size="icon" variant="ghost" className="size-7 cursor-pointer">
								<Link to="/lists/$listId" params={{ listId: String(listId) }} hash={`item-${id}`}>
									<ArrowRight className="size-4" />
								</Link>
							</Button>
						</TooltipTrigger>
						<TooltipContent side="left">View item in list</TooltipContent>
					</Tooltip>
					{commentCount > 0 && (
						<Link
							to="/lists/$listId"
							params={{ listId: String(listId) }}
							hash={`item-${id}`}
							className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 tabular-nums cursor-pointer"
							title={`${commentCount} comment${commentCount !== 1 ? 's' : ''}`}
						>
							<MessageSquare className="size-3.5" />
							{commentCount}
						</Link>
					)}
				</div>
			</div>
		</div>
	)
}
