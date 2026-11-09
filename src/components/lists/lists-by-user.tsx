import { useLiveQuery } from '@tanstack/react-db'
import { Link } from '@tanstack/react-router'
import { Skeleton } from 'skullet/react'

import { ClientOnly } from '@/components/utilities/client-only'
import type { BirthMonth } from '@/db/schema/enums'
import type { DependentWithLists, UserWithLists } from '@/db-collections/lists'
import { dependentsWithListsCollection, usersWithListsCollection } from '@/db-collections/lists'
import { useSession } from '@/lib/auth-client'
import { useListsSSE } from '@/lib/use-lists-sse'

import { SAMPLE_FEED } from './lists-feed-sample'
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

const isDependent = (entry: FeedEntry): entry is DependentWithLists => 'guardianIds' in entry

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
	const isLoading = queryResult.isLoading || dependentsResult.isLoading

	// Interleave users and dependents into one birthday-sorted stream.
	// Hide entries with no lists from the feed; the page heading surfaces
	// them via the info-icon popover instead.
	const sortedEntries: Array<FeedEntry> | null = isLoading
		? null
		: [...usersData, ...dependentsData].filter(entry => entry.lists.length > 0).sort(sortByBirthDate)

	return (
		<Skeleton id="lists-feed" label="Loading lists" data={sortedEntries} sample={SAMPLE_FEED}>
			{entries => <ListsFeed entries={entries} isAdmin={isAdmin} />}
		</Skeleton>
	)
}

type FeedEntry = UserWithLists | DependentWithLists

// The loaded feed, also rendered from sample data for the loading skeleton.
function ListsFeed({ entries, isAdmin }: { entries: Array<FeedEntry>; isAdmin: boolean }) {
	if (entries.length === 0) {
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
			{entries.map(entry =>
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
		<ClientOnly
			fallback={
				<Skeleton loading label="Loading lists">
					<ListsFeed entries={SAMPLE_FEED} isAdmin={false} />
				</Skeleton>
			}
		>
			<ListsByUserContent />
		</ClientOnly>
	)
}
