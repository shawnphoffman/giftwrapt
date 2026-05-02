import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'

import { RangeCalendarPopover } from '@/components/common/range-calendar-popover'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatTimeframeLabel, TIMEFRAME_PRESETS, type TimeframePreset, type TimeframeValue } from '@/lib/timeframe'

type Props = { value: TimeframeValue; onChange: (next: TimeframeValue) => void }

export function DateRangeFilter({ value, onChange }: Props) {
	const [open, setOpen] = useState(false)
	const segmentedValue = value.kind === 'preset' ? value.preset : ''

	function handlePresetChange(v: string) {
		if (!v) return
		onChange({ kind: 'preset', preset: v as TimeframePreset })
	}

	return (
		<div className="flex items-center gap-2 flex-wrap">
			<ToggleGroup type="single" variant="outline" size="sm" value={segmentedValue} onValueChange={handlePresetChange}>
				{TIMEFRAME_PRESETS.map(opt => (
					<ToggleGroupItem
						key={opt.value}
						value={opt.value}
						aria-label={opt.label}
						className="bg-background dark:bg-input/30 dark:hover:bg-input/50 data-[state=on]:bg-emerald-100 data-[state=on]:text-emerald-800 data-[state=on]:hover:bg-emerald-200 dark:data-[state=on]:bg-emerald-950 dark:data-[state=on]:text-emerald-200 dark:data-[state=on]:hover:bg-emerald-900"
					>
						{opt.label.replace('Last ', '').replace(' days', 'd').replace(' months', 'm')}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button variant={value.kind === 'custom' ? 'secondary' : 'outline'} size="sm">
						<CalendarIcon className="size-4" />
						{value.kind === 'custom' ? formatTimeframeLabel(value) : 'Custom…'}
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
