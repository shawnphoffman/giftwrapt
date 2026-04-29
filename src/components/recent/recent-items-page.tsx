import { Inbox } from 'lucide-react'

import type { RecentItemRow } from '@/api/recent'
import ItemOverview from '@/components/recent/item-overview'

type Props = {
	items: Array<RecentItemRow>
}

export function RecentItemsPageContent({ items }: Props) {
	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Recent Items</h1>
					<Inbox className="text-purple-500 wish-page-icon" />
				</div>

				<p className="text-sm text-muted-foreground">New items added to lists you can see in the last 30 days, newest first.</p>

				{items.length === 0 ? (
					<div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-accent/30">
						No recent items in the last 30 days.
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
							/>
						))}
					</div>
				)}
			</div>
		</div>
	)
}
