import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo, useState } from 'react'

import { DateRangeFilter } from '@/components/common/date-range-filter'
import { matchesTimeframe, PRESET_DEFAULT, type TimeframeValue } from '@/lib/timeframe'

import { PresetsPlusCustomList } from './presets-plus-custom-list'

type VariantComponent = (props: { value: TimeframeValue; onChange: (next: TimeframeValue) => void }) => React.ReactElement

const MOCK_DATASET: ReadonlyArray<Date> = (() => {
	const out: Array<Date> = []
	const now = Date.now()
	for (let i = 0; i < 100; i++) {
		const offsetDays = Math.floor(Math.random() * 540)
		out.push(new Date(now - offsetDays * 24 * 60 * 60 * 1000))
	}
	return out
})()

function Harness({ Variant, label, blurb }: { Variant: VariantComponent; label: string; blurb: string }) {
	const [value, setValue] = useState<TimeframeValue>(PRESET_DEFAULT)
	const filtered = useMemo(() => MOCK_DATASET.filter(d => matchesTimeframe(d, value)), [value])

	return (
		<div className="flex flex-col gap-3 p-4 border border-border rounded-md bg-card">
			<div className="flex flex-col gap-0.5">
				<div className="text-sm font-medium">{label}</div>
				<div className="text-xs text-muted-foreground">{blurb}</div>
			</div>
			<div>
				<Variant value={value} onChange={setValue} />
			</div>
			<div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
				<span>
					Filtered <strong className="text-foreground">{filtered.length}</strong> of {MOCK_DATASET.length}
				</span>
				<span className="font-mono">{JSON.stringify(value, (_k, v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v))}</span>
			</div>
		</div>
	)
}

const meta = {
	title: 'Common/DateRangeFilter',
	parameters: { layout: 'padded' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const VARIANTS: Array<{ key: string; label: string; blurb: string; Component: VariantComponent }> = [
	{
		key: 'SelectList',
		label: 'Select List',
		blurb: 'Existing Select with a "Custom range…" entry that opens a separate calendar popover.',
		Component: PresetsPlusCustomList,
	},
	{
		key: 'SegmentedControl',
		label: 'Segmented Control',
		blurb: 'Inline segmented control for the 5 presets; "Custom…" button opens a calendar.',
		Component: DateRangeFilter,
	},
]

export const Gallery: Story = {
	render: () => (
		<div className="flex flex-col gap-4">
			{VARIANTS.map(v => (
				<Harness key={v.key} Variant={v.Component} label={v.label} blurb={v.blurb} />
			))}
		</div>
	),
}
