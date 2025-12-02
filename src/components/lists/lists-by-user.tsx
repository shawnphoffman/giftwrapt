import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import UserAvatar from '@/components/common/user-avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { BirthMonth } from '@/db/enums'

type UserWithLists = {
	id: string
	email: string
	name: string | null
	image: string | null
	birthMonth: BirthMonth | null
	birthDay: number | null
	lists: Array<{
		id: number
		name: string
		type: string
		isActive: boolean
		description: string | null
		createdAt: string
		updatedAt: string
	}>
}

// Format birthday as "Month Day"
const birthday = (month: string, day: number) => {
	if (!month || !day) return null
	return `${month.charAt(0).toUpperCase() + month.slice(1)} ${day}`
}

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
		return a.birthDay! - b.birthDay!
	}
	return aMonth - bMonth
}

export function ListsByUser() {
	const {
		data: usersData = [],
		isLoading,
		error,
	} = useQuery<UserWithLists[]>({
		queryKey: ['lists', 'public'],
		queryFn: async () => {
			const response = await fetch('/api/lists/public')
			if (!response.ok) {
				throw new Error('Failed to fetch public lists')
			}
			return response.json()
		},
	})

	if (isLoading) {
		return (
			<div className="space-y-6">
				{[...Array(3)].map((_, i) => (
					<Card key={i}>
						<CardHeader>
							<div className="flex items-center gap-3">
								<Skeleton className="h-10 w-10 rounded-full" />
								<Skeleton className="h-5 w-32" />
							</div>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-3/4" />
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		)
	}

	if (error) {
		return (
			<div className="text-sm text-destructive">
				Error loading lists: {error instanceof Error ? error.message : 'Unknown error'}
			</div>
		)
	}

	// Sort users by next upcoming birthday
	const sortedUsers = [...usersData].sort(sortUserGroupsByBirthDate)

	if (sortedUsers.length === 0) {
		return <div className="text-sm text-muted-foreground">No users</div>
	}

	return (
		<div className="space-y-6">
			{sortedUsers.map(user => {
				const birthdayText = birthday(user.birthMonth || '', user.birthDay || 0)
				return (
					<Card key={user.id}>
						<CardHeader>
							<div className="flex items-center gap-3">
								<UserAvatar name={user.name || user.email} image={user.image} className="w-10 h-10" />
								<CardTitle className="text-lg">{user.name || user.email}</CardTitle>
								{birthdayText && (
									<Badge variant="secondary" className="ml-auto">
										{birthdayText}
									</Badge>
								)}
							</div>
						</CardHeader>
					<CardContent>
						{user.lists.length === 0 ? (
							<div className="text-sm text-muted-foreground">No lists</div>
						) : (
							<div className="space-y-2">
								{user.lists.map(list => (
									<Link
										key={list.id}
										to="/lists/$listId"
										params={{ listId: String(list.id) }}
										className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors"
									>
										<div className="font-medium">{list.name}</div>
										{list.description && (
											<div className="text-sm text-muted-foreground mt-1">{list.description}</div>
										)}
										<div className="flex items-center gap-2 mt-2">
											<span className="text-xs text-muted-foreground capitalize">{list.type}</span>
											{!list.isActive && (
												<span className="text-xs text-muted-foreground">(Inactive)</span>
											)}
										</div>
									</Link>
								))}
							</div>
						)}
					</CardContent>
				</Card>
				)
			})}
		</div>
	)
}

