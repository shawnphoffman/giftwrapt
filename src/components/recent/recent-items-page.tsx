import { Inbox } from 'lucide-react'

import type { RecentItemRow } from '@/api/recent'
import { DateRangeFilter } from '@/components/common/date-range-filter'
import { PageHeading } from '@/components/common/page-heading'
import ItemOverview from '@/components/recent/item-overview'
import type { TimeframeValue } from '@/lib/timeframe'
import { m } from '@/paraglide/messages.js'

type Props = {
	items: Array<RecentItemRow>
	timeframe: TimeframeValue
	onTimeframeChange: (next: TimeframeValue) => void
}

export function RecentItemsPageContent({ items, timeframe, onTimeframeChange }: Props) {
	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				<PageHeading title={m.page_recent_items()} icon={Inbox} color="purple" />

				<p className="text-sm text-muted-foreground">{m.recent_items_intro()}</p>

				<div className="flex flex-wrap items-center justify-between gap-3">
					<DateRangeFilter value={timeframe} onChange={onTimeframeChange} />
				</div>

				{items.length === 0 ? (
					<div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-accent/30">
						{m.recent_items_empty()}
					</div>
				) : (
					<div className="flex flex-col gap-2 xs:pl-6">
						{items.map(item => (
							<ItemOverview
								key={item.id}
								id={item.id}
								title={item.title}
								url={item.url}
								priority={item.priority}
								imageUrl={item.imageUrl}
								commentCount={item.commentCount}
								createdAt={item.createdAt}
								listId={item.listId}
								listName={item.listName}
								listType={item.listType}
								listOwnerName={item.listOwnerName}
								listOwnerEmail={item.listOwnerEmail}
								listOwnerImage={item.listOwnerImage}
								subjectDependentName={item.subjectDependentName}
								subjectDependentImage={item.subjectDependentImage}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	)
}
