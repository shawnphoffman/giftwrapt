import { createFileRoute } from '@tanstack/react-router'
import { MessagesSquare } from 'lucide-react'

import { getRecentConversations } from '@/api/recent'
import ItemConversation from '@/components/recent/item-conversation'

export const Route = createFileRoute('/(core)/recent/comments')({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData({
			queryKey: ['recent', 'conversations'],
			queryFn: () => getRecentConversations(),
			staleTime: 30 * 1000,
		}),
	component: RecentCommentsPage,
})

function RecentCommentsPage() {
	const rows = Route.useLoaderData()

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Recent Comments</h1>
					<MessagesSquare className="text-teal-500 wish-page-icon" />
				</div>

				<p className="text-sm text-muted-foreground">Items with comment activity in the last 30 days, ordered by the most recent reply.</p>

				{rows.length === 0 ? (
					<div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-accent/30">
						No recent comments.
					</div>
				) : (
					<div className="flex flex-col gap-2 xs:pl-6">
						{rows.map(row => (
							<ItemConversation
								key={row.id}
								id={row.id}
								title={row.title}
								url={row.url}
								priority={row.priority}
								imageUrl={row.imageUrl}
								createdAt={row.createdAt}
								listId={row.listId}
								listName={row.listName}
								listType={row.listType}
								listOwnerName={row.listOwnerName}
								listOwnerEmail={row.listOwnerEmail}
								listOwnerImage={row.listOwnerImage}
								comments={row.comments}
								commentCount={row.commentCount}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	)
}
