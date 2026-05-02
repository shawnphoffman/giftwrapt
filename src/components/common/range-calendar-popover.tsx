import { useEffect, useState } from 'react'
import type { DateRange } from 'react-day-picker'

import { Calendar } from '@/components/ui/calendar'
import type { TimeframeValue } from '@/lib/timeframe'

type Props = {
	value: TimeframeValue
	open: boolean
	numberOfMonths?: number
	onCommit: (from: Date, to: Date) => void
}

/**
 * Wraps `Calendar` in range mode with two-click commit semantics.
 * react-day-picker v9 returns `{from: A, to: A}` on the first click, so naively
 * closing on `from && to` fires before the user has a chance to pick an end date.
 * Instead, track clicks locally and only commit/close on the second selection.
 */
export function RangeCalendarPopover({ value, open, numberOfMonths = 2, onCommit }: Props) {
	const [tempRange, setTempRange] = useState<DateRange | undefined>(() =>
		value.kind === 'custom' ? { from: value.from, to: value.to } : undefined
	)
	const [clicks, setClicks] = useState(0)

	useEffect(() => {
		if (open) {
			setTempRange(value.kind === 'custom' ? { from: value.from, to: value.to } : undefined)
			setClicks(0)
		}
	}, [open, value])

	function handleSelect(range: DateRange | undefined) {
		setTempRange(range)
		const next = clicks + 1
		setClicks(next)
		if (next >= 2 && range?.from && range.to) {
			const from = range.from <= range.to ? range.from : range.to
			const to = range.from <= range.to ? range.to : range.from
			onCommit(from, to)
		}
	}

	return <Calendar mode="range" selected={tempRange} numberOfMonths={numberOfMonths} onSelect={handleSelect} />
}
