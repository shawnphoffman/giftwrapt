import { useLiveQuery } from '@tanstack/react-db'

import { ClientOnly } from '@/components/utilities/client-only'
import type { BirthMonth } from '@/db/schema/enums'
import type { UserWithLists } from '@/db-collections/lists'
import { usersWithListsCollection } from '@/db-collections/lists'

import ListsByUserSkeleton from '../skeletons/lists-by-user-skeleton'
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

const sortUserGroupsByBirthDate = (a: UserWithLists, b: UserWithLists) => {
	const currentDate = new Date()
	const currentMonth = currentDate.getMonth() + 1
	const currentDay = currentDate.getDate()

	// If user doesn't have birth month/day, put them at the end
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

function ListsByUserContent() {
	// Use useLiveQuery to query the collection directly
	// The collection's queryFn automatically fetches from the API route
	// This provides live updates, automatic caching, and local-first behavior
	// The API route is still needed (server-side database access), but this
	// gives us a cleaner client-side API with live updates
	const queryResult = useLiveQuery(q =>
		q.from({ user: usersWithListsCollection }).select(({ user }) => ({
			...user,
		}))
	)

	// Convert Map to array for easier use
	const usersData = Array.from(queryResult.data.values()) as Array<UserWithLists>
	const isLoading = queryResult.isLoading

	if (isLoading && usersData.length === 0) {
		return (
			<div className="space-y-6">
				{[...Array(3)].map((_, i) => (
					<ListsByUserSkeleton key={i} />
				))}
			</div>
		)
	}

	// Sort users by next upcoming birthday
	const sortedUsers = [...usersData].sort(sortUserGroupsByBirthDate)

	if (sortedUsers.length === 0) {
		return <div className="text-sm text-muted-foreground">No users</div>
	}

	return (
		<div className="gap-2 flex flex-col">
			{sortedUsers.map(user => (
				<ListsForUser key={user.id} user={user} />
			))}
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
