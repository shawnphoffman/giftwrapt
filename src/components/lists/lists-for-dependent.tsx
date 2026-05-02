import DependentAvatar from '@/components/common/dependent-avatar'
import { ListRow } from '@/components/lists/list-row'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DependentWithLists } from '@/db-collections/lists'

import BirthdayBadge from '../common/birthday-badge'

export default function ListsForDependent({ dependent }: { dependent: DependentWithLists }) {
	return (
		<Card key={dependent.id} className="group/user-card py-4 gap-2 flex flex-col overflow-visible relative hover:z-10">
			<CardHeader className="px-4 flex items-center gap-3">
				<DependentAvatar
					name={dependent.name}
					image={dependent.image}
					className="border-2 border-background origin-bottom transition-transform duration-200 ease-out group-hover/user-card:scale-150 group-hover/user-card:-rotate-6"
				/>
				<CardTitle className="text-2xl font-semibold leading-none tracking-tight">{dependent.name}</CardTitle>
				<BirthdayBadge birthMonth={dependent.birthMonth} birthDay={dependent.birthDay} />
			</CardHeader>
			<CardContent className="px-4">
				{dependent.lists.length === 0 ? (
					<div className="text-sm text-muted-foreground bg-background/25 border border-dashed rounded px-2 py-1 italic">No lists</div>
				) : (
					<div className="flex flex-col gap-0 xs:divide-y-0">
						{dependent.lists.map(list => (
							<ListRow key={list.id} role="gifter" list={list} />
						))}
					</div>
				)}
			</CardContent>
		</Card>
	)
}
