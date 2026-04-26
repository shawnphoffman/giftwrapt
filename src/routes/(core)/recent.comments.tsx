import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, MessagesSquare } from 'lucide-react'

import { getRecentComments } from '@/api/comments'
import UserAvatar from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/(core)/recent/comments')({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData({
			queryKey: ['recent', 'comments'],
			queryFn: () => getRecentComments(),
			staleTime: 30 * 1000,
		}),
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
					<div className="flex flex-col overflow-hidden divide-y rounded-xl bg-card shadow-sm ring-1 ring-foreground/10">
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
													hash={`item-${c.itemId}`}
													className="hover:underline"
												>
													{c.itemTitle}
												</Link>{' '}
												&middot; {c.listOwnerName ? `${c.listOwnerName}'s` : ''} {c.listName}
											</span>
											<span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</span>
										</div>
										<p className="text-sm text-foreground/80 whitespace-pre-wrap line-clamp-3">{c.comment}</p>
									</div>
									<Button asChild size="icon" variant="ghost" className="size-7 shrink-0 self-start" title="Open comment on list">
										<Link to="/lists/$listId" params={{ listId: String(c.listId) }} hash={`comment-${c.id}`}>
											<ArrowRight className="size-4" />
										</Link>
									</Button>
								</div>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}
