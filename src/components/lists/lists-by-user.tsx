import { useLiveQuery } from '@tanstack/react-db'
import { Link } from '@tanstack/react-router'

import { ClientOnly } from '@/components/utilities/client-only'
import type { BirthMonth } from '@/db/schema/enums'
import type { DependentWithLists, UserWithLists } from '@/db-collections/lists'
import { dependentsWithListsCollection, usersWithListsCollection } from '@/db-collections/lists'
import { useSession } from '@/lib/auth-client'
import { useListsSSE } from '@/lib/use-lists-sse'

import ListsByUserSkeleton from '../skeletons/lists-by-user-skeleton'
import ListsForDependent from './lists-for-dependent'
import ListsForUser from './lists-for-user'

// Map month names to numbers (1-12)
const monthToNumber: Record<BirthMonth, number> = {
	january: 1,
	february: 2,
	march: 3,
	april: 4,
	may: 5,
	june: 6,
	july: 7,
	august: 8,
	september: 9,
	october: 10,
	november: 11,
	december: 12,
}

type BirthdayLike = { birthMonth: BirthMonth | null; birthDay: number | null }

const sortByBirthDate = (a: BirthdayLike, b: BirthdayLike) => {
	const currentDate = new Date()
	const currentMonth = currentDate.getMonth() + 1
	const currentDay = currentDate.getDate()

	// If entry doesn't have birth month/day, put it at the end
	if (!a.birthMonth || !a.birthDay) {
		return 1
	}
	if (!b.birthMonth || !b.birthDay) {
		return -1
	}

	let aMonth = monthToNumber[a.birthMonth]
	if (aMonth < currentMonth) {
		aMonth += 12
	} else if (aMonth === currentMonth && a.birthDay < currentDay) {
		aMonth += 12
	}

	let bMonth = monthToNumber[b.birthMonth]
	if (bMonth < currentMonth) {
		bMonth += 12
	} else if (bMonth === currentMonth && b.birthDay < currentDay) {
		bMonth += 12
	}

	// Today's birthday goes to the top
	if (aMonth === currentMonth && a.birthDay === currentDay) {
		return -1
	}
	if (bMonth === currentMonth && b.birthDay === currentDay) {
		return 1
	}

	// Sort by month, then by day
	if (aMonth === bMonth) {
		return a.birthDay - b.birthDay
	}
	return aMonth - bMonth
}

const isDependent = (entry: UserWithLists | DependentWithLists): entry is DependentWithLists => 'guardianIds' in entry

function ListsByUserContent() {
	const { data: session } = useSession()
	const isAdmin = session?.user.isAdmin ?? false

	// Keep the grouped public-lists query live: any claim/unclaim anywhere
	// should refresh the unclaimed/total badge counts.
	useListsSSE()

	const queryResult = useLiveQuery(q =>
		q.from({ user: usersWithListsCollection }).select(({ user }) => ({
			...user,
		}))
	)
	const dependentsResult = useLiveQuery(q => q.from({ dep: dependentsWithListsCollection }).select(({ dep }) => ({ ...dep })))

	const usersData = Array.from(queryResult.data.values()) as Array<UserWithLists>
	const dependentsData = Array.from(dependentsResult.data.values()) as Array<DependentWithLists>
	const isLoading = queryResult.isLoading

	if (isLoading && usersData.length === 0 && dependentsData.length === 0) {
		return (
			<div className="space-y-6">
				{[...Array(3)].map((_, i) => (
					<ListsByUserSkeleton key={i} />
				))}
			</div>
		)
	}

	// Interleave users and dependents into one birthday-sorted stream
	const sortedEntries: Array<UserWithLists | DependentWithLists> = [...usersData, ...dependentsData].sort(sortByBirthDate)

	if (sortedEntries.length === 0) {
		return (
			<div className="text-sm text-muted-foreground py-3 px-3 border border-dashed rounded-lg bg-accent/30">
				No users.
				{isAdmin ? (
					<>
						{' '}
						<Link to="/admin/users" className="underline">
							Invite users
						</Link>
						.
					</>
				) : null}
			</div>
		)
	}

	return (
		<div className="gap-2 flex flex-col">
			{sortedEntries.map(entry =>
				isDependent(entry) ? (
					<ListsForDependent key={`dep-${entry.id}`} dependent={entry} />
				) : (
					<ListsForUser key={`user-${entry.id}`} user={entry} />
				)
			)}
		</div>
	)
}

export function ListsByUser() {
	// Wrap in ClientOnly to prevent SSR issues with useLiveQuery
	// useLiveQuery uses useSyncExternalStore which requires getServerSnapshot for SSR
	// Since this is a client-side live query feature, it should only render on the client
	return (
		<ClientOnly>
			<ListsByUserContent />
		</ClientOnly>
	)
}
