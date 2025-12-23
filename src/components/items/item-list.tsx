import EmptyMessage from '@/components/common/empty-message'
import type { Item } from '@/db/schema/items'

import ItemRow from './item-row'

type Props = {
	items: Array<Item>
}

export default function ItemList({ items }: Props) {
	if (items.length === 0) {
		return <EmptyMessage message="No items to display" />
	}

	return (
		<div className="flex flex-col overflow-hidden border divide-y rounded-lg shadow-sm text-card-foreground bg-accent">
			{items.map(item => (
				<ItemRow key={item.id} item={item} />
			))}
		</div>
	)
}
