import { useLiveQuery } from '@tanstack/react-db'
import { Info } from 'lucide-react'

import BirthdayBadge from '@/components/common/birthday-badge'
import DependentAvatar from '@/components/common/dependent-avatar'
import UserAvatar from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { ClientOnly } from '@/components/utilities/client-only'
import type { BirthMonth } from '@/db/schema/enums'
import type { DependentWithLists, UserWithLists } from '@/db-collections/lists'
import { dependentsWithListsCollection, usersWithListsCollection } from '@/db-collections/lists'

type EmptyEntry = {
	kind: 'user' | 'dependent'
	id: string
	name: string
	image: string | null
	birthMonth: BirthMonth | null
	birthDay: number | null
}

function NoListsPopoverContent() {
	const usersResult = useLiveQuery(q =>
		q.from({ user: usersWithListsCollection }).select(({ user }) => ({
			...user,
		}))
	)
	const dependentsResult = useLiveQuery(q => q.from({ dep: dependentsWithListsCollection }).select(({ dep }) => ({ ...dep })))

	const users = Array.from(usersResult.data.values()) as Array<UserWithLists>
	const dependents = Array.from(dependentsResult.data.values()) as Array<DependentWithLists>

	const empty: Array<EmptyEntry> = [
		...users
			.filter(u => u.lists.length === 0)
			.map(u => ({
				kind: 'user' as const,
				id: u.id,
				name: u.name || u.email,
				image: u.image,
				birthMonth: u.birthMonth,
				birthDay: u.birthDay,
			})),
		...dependents
			.filter(d => d.lists.length === 0)
			.map(d => ({
				kind: 'dependent' as const,
				id: d.id,
				name: d.name,
				image: d.image,
				birthMonth: d.birthMonth,
				birthDay: d.birthDay,
			})),
	].sort((a, b) => a.name.localeCompare(b.name))

	if (empty.length === 0) return null

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8 text-muted-foreground hover:text-foreground"
					aria-label={`${empty.length} ${empty.length === 1 ? 'person has' : 'people have'} no lists`}
				>
					<Info className="size-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72">
				<PopoverHeader>
					<PopoverTitle>No lists yet</PopoverTitle>
				</PopoverHeader>
				<ul className="flex flex-col gap-2">
					{empty.map(entry => (
						<li key={`${entry.kind}-${entry.id}`} className="flex items-center gap-2">
							{entry.kind === 'user' ? (
								<UserAvatar name={entry.name} image={entry.image} size="small" />
							) : (
								<DependentAvatar name={entry.name} image={entry.image} size="small" />
							)}
							<span className="text-sm flex-1 min-w-0 truncate">{entry.name}</span>
							<BirthdayBadge birthMonth={entry.birthMonth} birthDay={entry.birthDay} />
						</li>
					))}
				</ul>
			</PopoverContent>
		</Popover>
	)
}

export function NoListsPopover() {
	return (
		<ClientOnly>
			<NoListsPopoverContent />
		</ClientOnly>
	)
}
