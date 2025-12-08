import UserAvatar from '@/components/common/user-avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { UserWithLists } from '@/db-collections/lists'

import BirthdayBadge from '../common/birthday-badge'
import ListsForUserRow from './lists-for-user-row'

export default function ListsForUser({ user }: { user: UserWithLists }) {
	return (
		<Card key={user.id} className="py-4 gap-2 bg-accent max-w-xl">
			<CardHeader className="px-4 flex items-center gap-3">
				<UserAvatar name={user.name || user.email} image={user.image} />
				<CardTitle className="text-2xl font-semibold leading-none tracking-tight">{user.name || user.email}</CardTitle>
				<BirthdayBadge birthMonth={user.birthMonth} birthDay={user.birthDay} />
			</CardHeader>
			<CardContent className="px-4">
				{user.lists.length === 0 ? (
					<div className="text-sm text-muted-foreground">No lists</div>
				) : (
					<div className="flex flex-col gap-0 xs:divide-y-0">
						{user.lists.map(list => (
							<ListsForUserRow key={list.id} list={list} />
						))}
					</div>
				)}
			</CardContent>
		</Card>
	)
}
