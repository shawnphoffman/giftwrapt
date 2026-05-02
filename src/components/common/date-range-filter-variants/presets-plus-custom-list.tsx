import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'

import { RangeCalendarPopover } from '@/components/common/range-calendar-popover'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatTimeframeLabel, TIMEFRAME_PRESETS, type TimeframePreset, type TimeframeValue } from '@/lib/timeframe'

type Props = { value: TimeframeValue; onChange: (next: TimeframeValue) => void }

const CUSTOM_VALUE = '__custom__'

export function PresetsPlusCustomList({ value, onChange }: Props) {
	const [open, setOpen] = useState(false)
	const selectValue = value.kind === 'preset' ? value.preset : CUSTOM_VALUE

	function handleSelect(v: string) {
		if (v === CUSTOM_VALUE) {
			setOpen(true)
			return
		}
		onChange({ kind: 'preset', preset: v as TimeframePreset })
	}

	return (
		<div className="flex items-center gap-2">
			<Select value={selectValue} onValueChange={handleSelect}>
				<SelectTrigger className="w-[200px]">
					<SelectValue>{formatTimeframeLabel(value)}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{TIMEFRAME_PRESETS.map(opt => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
					<SelectSeparator />
					<SelectItem value={CUSTOM_VALUE}>Custom range…</SelectItem>
				</SelectContent>
			</Select>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button variant="outline" size="icon-sm" aria-label="Pick custom range">
						<CalendarIcon />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="end">
					<RangeCalendarPopover
						value={value}
						open={open}
						onCommit={(from, to) => {
							onChange({ kind: 'custom', from, to })
							setOpen(false)
						}}
					/>
				</PopoverContent>
			</Popover>
		</div>
	)
}
