import { createFileRoute, Link } from '@tanstack/react-router'
import { MessagesSquare } from 'lucide-react'

import { getRecentComments } from '@/api/comments'
import UserAvatar from '@/components/common/user-avatar'

export const Route = createFileRoute('/(core)/recent/comments')({
	loader: () => getRecentComments(),
	component: RecentCommentsPage,
})

function RecentCommentsPage() {
	const comments = Route.useLoaderData()

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Recent Comments</h1>
					<MessagesSquare className="text-teal-500 wish-page-icon" />
				</div>

				{comments.length === 0 ? (
					<div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-accent/30">
						No recent comments.
					</div>
				) : (
					<div className="flex flex-col overflow-hidden border divide-y rounded-lg bg-accent">
						{comments.map(c => {
							const name = c.user.name || c.user.email
							return (
								<div key={c.id} className="flex gap-3 p-3">
									<UserAvatar name={name} image={c.user.image} size="small" />
									<div className="flex-1 min-w-0">
										<div className="flex items-baseline gap-1.5 flex-wrap">
											<span className="font-medium text-sm">{name}</span>
											<span className="text-xs text-muted-foreground">
												on{' '}
												<Link
													to="/lists/$listId"
													params={{ listId: String(c.listId) }}
													className="hover:underline"
												>
													{c.itemTitle}
												</Link>
												{' '}&middot; {c.listOwnerName ? `${c.listOwnerName}'s` : ''} {c.listName}
											</span>
											<span className="text-xs text-muted-foreground">
												{new Date(c.createdAt).toLocaleDateString()}
											</span>
										</div>
										<p className="text-sm text-foreground/80 whitespace-pre-wrap line-clamp-3">{c.comment}</p>
									</div>
								</div>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}
