import { Link } from '@tanstack/react-router'

import type { UserWithLists } from '@/db-collections/lists'

import CountBadge from '../common/count-badge'
import ListTypeIcon from '../common/list-type-icon'

export default function ListsForUserRow({ list }: { list: UserWithLists['lists'][number] }) {
	return (
		<Link
			key={list.id}
			to="/lists/$listId"
			params={{ listId: String(list.id) }}
			className="text-lg flex-row bg-transparent hover:bg-muted rounded flex p-2 items-center gap-2"
		>
			<ListTypeIcon type={list.type} className="size-6" />
			<div className="font-medium leading-tight flex-1">{list.name}</div>
			<CountBadge count={list.itemsTotal} remaining={list.itemsRemaining} />
		</Link>
	)
}
