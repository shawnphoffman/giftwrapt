import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const DAYS_IN_MONTH: Record<string, number> = {
	january: 31,
	february: 29,
	march: 31,
	april: 30,
	may: 31,
	june: 30,
	july: 31,
	august: 31,
	september: 30,
	october: 31,
	november: 30,
	december: 31,
}

type BirthDaySelectProps = {
	id?: string
	month?: string
	value?: number
	onValueChange: (day: number | undefined) => void
	disabled?: boolean
	className?: string
}

export function BirthDaySelect({ id, month, value, onValueChange, disabled, className }: BirthDaySelectProps) {
	const maxDay = (month && DAYS_IN_MONTH[month]) || 31
	const days = Array.from({ length: maxDay }, (_, i) => i + 1)

	return (
		<Select
			onValueChange={next => onValueChange(next === '' ? undefined : Number(next))}
			value={value !== undefined && value >= 1 && value <= maxDay ? String(value) : ''}
			disabled={disabled}
		>
			<SelectTrigger id={id} className={className ?? 'w-full'}>
				<SelectValue placeholder="Select day" />
			</SelectTrigger>
			<SelectContent>
				{days.map(day => (
					<SelectItem key={day} value={String(day)}>
						{day}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}
