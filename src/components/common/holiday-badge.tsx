import { Badge } from '@/components/ui/badge'

type HolidayBadgeProps = {
	// ISO 8601 (UTC start-of-day) date string from the server. Null
	// renders nothing - non-holiday lists or holidays whose
	// customHolidayId can't be resolved.
	date: string | null
}

function daysFromTodayUtc(target: Date, now: Date): number {
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
	const targetDay = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate())
	return Math.round((targetDay - today) / (1000 * 60 * 60 * 24))
}

const shortDateFormatter = (sameYear: boolean) =>
	new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		year: sameYear ? undefined : 'numeric',
		timeZone: 'UTC',
	})

export default function HolidayBadge({ date }: HolidayBadgeProps) {
	if (!date) return null
	const target = new Date(date)
	if (Number.isNaN(target.getTime())) return null
	const now = new Date()
	const days = daysFromTodayUtc(target, now)

	if (days < 0) {
		const sameYear = target.getUTCFullYear() === now.getUTCFullYear()
		return (
			<Badge variant="outline" className="text-muted-foreground whitespace-nowrap">
				{shortDateFormatter(sameYear).format(target)}
			</Badge>
		)
	}

	if (days === 0) {
		return (
			<Badge variant="destructive" className="whitespace-nowrap">
				Today
			</Badge>
		)
	}

	if (days === 1) {
		return (
			<Badge variant="destructive" className="whitespace-nowrap">
				Tomorrow
			</Badge>
		)
	}

	const plural = new Intl.PluralRules().select(days)
	const text = `${days} ${plural === 'one' ? 'day' : 'days'}`
	return (
		<Badge variant={days < 31 ? 'destructive' : 'outline'} className="whitespace-nowrap">
			{text}
		</Badge>
	)
}
