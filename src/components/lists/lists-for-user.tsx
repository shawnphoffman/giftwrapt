import { Link } from '@tanstack/react-router'
import UserAvatar from '@/components/common/user-avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { type UserWithLists } from '@/db-collections/lists'
import ListTypeIcon from '../common/list-type-icon'

// Format birthday as "Month Day"
const birthday = (month: string, day: number) => {
	if (!month || !day) return null
	return `${month.charAt(0).toUpperCase() + month.slice(1)} ${day}`
}

const daysUntilBirthday = (month: string, day: number) => {
	const months: { [key: string]: number } = {
		january: 0,
		february: 1,
		march: 2,
		april: 3,
		may: 4,
		june: 5,
		july: 6,
		august: 7,
		september: 8,
		october: 9,
		november: 10,
		december: 11,
	} as const

	const today = new Date()
	const currentYear = today.getFullYear()

	// Get the birth month and day
	const birthMonth = months[month?.toLowerCase()]
	const birthDay = day

	// Create a date object for this year's birthday
	let nextBirthday = new Date(currentYear, birthMonth, birthDay)

	// If this year's birthday has already passed, set to next year
	if (nextBirthday < today) {
		nextBirthday.setFullYear(currentYear + 1)
	}

	// Calculate the difference in time and convert to days
	const timeDifference = Number(nextBirthday) - Number(today)
	const daysDifference = Math.ceil(timeDifference / (1000 * 60 * 60 * 24))

	return daysDifference
}

export default function ListsForUser({ user }: { user: UserWithLists }) {
	const countdown = daysUntilBirthday(user.birthMonth || '', user.birthDay || 0)
	const plural = new Intl.PluralRules().select(countdown)
	const birthdayText = birthday(user.birthMonth || '', user.birthDay || 0)
	return (
		<Card key={user.id} className="py-4 gap-2 bg-accent">
			<CardHeader className="px-4 flex items-center gap-3">
				<UserAvatar name={user.name || user.email} image={user.image} />
				<CardTitle className="text-2xl font-semibold leading-none tracking-tight">{user.name || user.email}</CardTitle>
				{birthdayText && (
					<div className="flex flex-row items-center gap-1">
						<Badge variant="outline">{birthdayText}</Badge>
						{countdown < 31 && (
							<Badge variant="destructive" className="whitespace-nowrap">
								{countdown} {plural === 'one' ? 'day' : 'days'}
							</Badge>
						)}
					</div>
				)}
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
								<div className="flex items-center gap-2">
									<span className="text-xs text-muted-foreground capitalize">{list.type}</span>
									{!list.isActive && <span className="text-xs text-muted-foreground">(Inactive)</span>}
								</div>
							</Link>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	)
}
