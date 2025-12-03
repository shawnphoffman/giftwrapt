import { Link } from '@tanstack/react-router'
import UserAvatar from '@/components/common/user-avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { type UserWithLists } from '@/db-collections/lists'
import ListTypeIcon from '../common/list-type-icon'
import BirthdayBadge from '../common/birthday-badge'
import { BirthMonth } from '@/db/schema/enums'
import CountBadge from '../common/count-badge'

export default function ListsForUser({ user }: { user: UserWithLists }) {
	return (
		<Card key={user.id} className="py-4 gap-2 bg-accent">
			<CardHeader className="px-4 flex items-center gap-3">
				<UserAvatar name={user.name || user.email} image={user.image} />
				<CardTitle className="text-2xl font-semibold leading-none tracking-tight">{user.name || user.email}</CardTitle>
				<BirthdayBadge birthMonth={user.birthMonth as BirthMonth} birthDay={user.birthDay ?? 0} />
			</CardHeader>
			<CardContent className="px-4">
				{user.lists.length === 0 ? (
					<div className="text-sm text-muted-foreground">No lists</div>
				) : (
					<div className="flex flex-col gap-0 xs:divide-y-0">
						{user.lists.map(list => (
							<Link
								key={list.id}
								to="/lists/$listId"
								params={{ listId: String(list.id) }}
								// className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors"
								className="text-lg flex-row bg-transparent hover:bg-muted rounded flex p-2 items-center gap-2"
							>
								<ListTypeIcon type={list.type} className="size-6" />
								<div className="font-medium leading-tight flex-1">{list.name}</div>
								{/* {list.description && <div className="text-sm text-muted-foreground mt-1">{list.description}</div>} */}
								{/* <div className="flex items-center gap-2">
									<span className="text-xs text-muted-foreground capitalize">{list.type}</span>
									{!list.isActive && <span className="text-xs text-muted-foreground">(Inactive)</span>}
								</div> */}
								<CountBadge count={list.itemsTotal} remaining={list.itemsRemaining} />
							</Link>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	)
}
