import { createFileRoute, Link } from '@tanstack/react-router'
import { ExternalLink, Inbox } from 'lucide-react'

import { getRecentItems } from '@/api/recent'
import PriorityIcon from '@/components/common/priority-icon'
import { Badge } from '@/components/ui/badge'
import type { Priority } from '@/db/schema/enums'
import { getDomainFromUrl } from '@/lib/urls'

export const Route = createFileRoute('/(core)/recent/items')({
	loader: () => getRecentItems(),
	component: RecentItemsPage,
})

function RecentItemsPage() {
	const items = Route.useLoaderData()

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Recent Items</h1>
					<Inbox className="text-purple-500 wish-page-icon" />
				</div>

				{items.length === 0 ? (
					<div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-accent/30">
						No recent items in the last 30 days.
					</div>
				) : (
					<div className="flex flex-col overflow-hidden border divide-y rounded-lg bg-accent">
						{items.map(item => {
							const domain = item.url ? getDomainFromUrl(item.url) : null
							return (
								<div key={item.id} className="flex items-center gap-2 p-3">
									<PriorityIcon priority={item.priority as Priority} className="size-4 shrink-0" />
									<div className="flex-1 min-w-0">
										<div className="font-medium leading-tight truncate">
											{item.url ? (
												<a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
													{item.title}
												</a>
											) : (
												item.title
											)}
										</div>
										<div className="text-xs text-muted-foreground">
											{item.listOwnerName || item.listOwnerEmail} &middot;{' '}
											<Link to="/lists/$listId" params={{ listId: String(item.listId) }} className="hover:underline">
												{item.listName}
											</Link>
											{' '}&middot; {new Date(item.createdAt).toLocaleDateString()}
										</div>
									</div>
									{domain && (
										<Badge variant="outline" className="text-xs shrink-0 gap-1">
											{domain} <ExternalLink className="size-3" />
										</Badge>
									)}
									{item.price && (
										<Badge variant="outline" className="text-xs shrink-0">${item.price}</Badge>
									)}
									{item.quantity > 1 && (
										<Badge variant="secondary" className="text-xs tabular-nums shrink-0">x{item.quantity}</Badge>
									)}
								</div>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}
