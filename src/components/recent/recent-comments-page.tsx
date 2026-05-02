import { MessagesSquare } from 'lucide-react'

import type { RecentConversationRow } from '@/api/recent'
import ItemConversation from '@/components/recent/item-conversation'

type Props = {
	rows: Array<RecentConversationRow>
}

export function RecentCommentsPageContent({ rows }: Props) {
	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Comments</h1>
					<MessagesSquare className="text-teal-500 wish-page-icon" />
				</div>

				<p className="text-sm text-muted-foreground">Items with comment activity in the last 60 days, ordered by the most recent reply.</p>

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
								subjectDependentName={row.subjectDependentName}
								subjectDependentImage={row.subjectDependentImage}
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
