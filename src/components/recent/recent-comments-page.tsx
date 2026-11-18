import { MessagesSquare } from 'lucide-react'

import type { RecentConversationRow } from '@/api/recent'
import { DateRangeFilter } from '@/components/common/date-range-filter'
import { PageHeading } from '@/components/common/page-heading'
import ItemConversation from '@/components/recent/item-conversation'
import type { TimeframeValue } from '@/lib/timeframe'
import { m } from '@/paraglide/messages.js'

type Props = {
	rows: Array<RecentConversationRow>
	timeframe: TimeframeValue
	onTimeframeChange: (next: TimeframeValue) => void
}

export function RecentCommentsPageContent({ rows, timeframe, onTimeframeChange }: Props) {
	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				<PageHeading title={m.page_recent_comments()} icon={MessagesSquare} color="teal" />

				<p className="text-sm text-muted-foreground">{m.recent_comments_intro()}</p>

				<div className="flex flex-wrap items-center justify-between gap-3">
					<DateRangeFilter value={timeframe} onChange={onTimeframeChange} />
				</div>

				{rows.length === 0 ? (
					<div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-accent/30">
						{m.recent_comments_empty()}
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
