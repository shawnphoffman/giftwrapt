import { CalendarIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { RangeCalendarPopover } from '@/components/common/range-calendar-popover'
import { SegmentedToggle } from '@/components/common/segmented-toggle'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
	formatTimeframeLabel,
	TIMEFRAME_PRESETS,
	type TimeframePreset,
	timeframePresetLabel,
	timeframePresetShortLabel,
	type TimeframeValue,
} from '@/lib/timeframe'
import { m } from '@/paraglide/messages.js'

type Props = { value: TimeframeValue; onChange: (next: TimeframeValue) => void }

export function DateRangeFilter({ value, onChange }: Props) {
	const [open, setOpen] = useState(false)
	const segmentedValue = value.kind === 'preset' ? value.preset : ''

	const presetOptions = useMemo(
		() =>
			TIMEFRAME_PRESETS.map(preset => ({
				value: preset,
				label: timeframePresetShortLabel(preset),
				ariaLabel: timeframePresetLabel(preset),
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
						{value.kind === 'custom' ? formatTimeframeLabel(value) : m.shared_date_range_custom_button()}
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
