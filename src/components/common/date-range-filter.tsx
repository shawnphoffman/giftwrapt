import { CalendarIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { RangeCalendarPopover } from '@/components/common/range-calendar-popover'
import { SegmentedToggle } from '@/components/common/segmented-toggle'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatTimeframeLabel, TIMEFRAME_PRESETS, type TimeframePreset, type TimeframeValue } from '@/lib/timeframe'

type Props = { value: TimeframeValue; onChange: (next: TimeframeValue) => void }

export function DateRangeFilter({ value, onChange }: Props) {
	const [open, setOpen] = useState(false)
	const segmentedValue = value.kind === 'preset' ? value.preset : ''

	const presetOptions = useMemo(
		() =>
			TIMEFRAME_PRESETS.map(opt => ({
				value: opt.value,
				label: opt.label.replace('Last ', '').replace(' days', 'd').replace(' months', 'm'),
				ariaLabel: opt.label,
			})),
		[]
	)

	return (
		<div className="flex items-center gap-2 flex-wrap">
			<SegmentedToggle<TimeframePreset>
				value={segmentedValue}
				onValueChange={preset => onChange({ kind: 'preset', preset })}
				options={presetOptions}
			/>
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
