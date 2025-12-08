import { Badge } from '@/components/ui/badge'
import type { BirthMonth } from '@/db/schema/enums'

type BirthdayBadgeProps = {
	birthMonth?: BirthMonth | null
	birthDay?: number | null
}

// Format birthday as "Month Day"
const birthday = (month: BirthMonth | null, day?: number | null) => {
	if (!month || !day) return null
	return `${month.charAt(0).toUpperCase() + month.slice(1)} ${day}`
}

const daysUntilBirthday = (month: BirthMonth | null, day: number | null) => {
	if (!month || !day) return null

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
	const birthMonth = months[month.toLowerCase()]
	const birthDay = day

	// Create a date object for this year's birthday
	const nextBirthday = new Date(currentYear, birthMonth, birthDay)

	// If this year's birthday has already passed, set to next year
	if (nextBirthday < today) {
		nextBirthday.setFullYear(currentYear + 1)
	}

	// Calculate the difference in time and convert to days
	const timeDifference = Number(nextBirthday) - Number(today)
	const daysDifference = Math.ceil(timeDifference / (1000 * 60 * 60 * 24))

	return daysDifference
}

export default function BirthdayBadge({ birthMonth, birthDay }: BirthdayBadgeProps) {
	// Don't render anything if we don't have the required data
	if (!birthMonth || !birthDay) {
		return null
	}

	const birthdayText = birthday(birthMonth, birthDay)
	const countdown = daysUntilBirthday(birthMonth, birthDay)

	if (!birthdayText || countdown === null) {
		return null
	}

	const plural = new Intl.PluralRules().select(countdown)

	return (
		<div className="flex flex-row items-center gap-1">
			<Badge variant="outline">{birthdayText}</Badge>
			{countdown < 31 && (
				<Badge variant="destructive" className="whitespace-nowrap">
					{countdown} {plural === 'one' ? 'day' : 'days'}
				</Badge>
			)}
		</div>
	)
}
