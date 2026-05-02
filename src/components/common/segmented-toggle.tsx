import type { ReactNode } from 'react'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export type SegmentedToggleOption<T extends string> = {
	value: T
	label: ReactNode
	ariaLabel?: string
}

type Props<T extends string> = {
	value: T | ''
	onValueChange: (value: T) => void
	options: ReadonlyArray<SegmentedToggleOption<T>>
	size?: 'sm' | 'default' | 'lg'
	className?: string
}

const SELECTED_TONE_CLASSES =
	'bg-background dark:bg-input/30 dark:hover:bg-input/50 data-[state=on]:bg-emerald-100 data-[state=on]:text-emerald-800 data-[state=on]:hover:bg-emerald-200 dark:data-[state=on]:bg-emerald-950 dark:data-[state=on]:text-emerald-200 dark:data-[state=on]:hover:bg-emerald-900'

export function SegmentedToggle<T extends string>({ value, onValueChange, options, size = 'sm', className }: Props<T>) {
	return (
		<ToggleGroup
			type="single"
			variant="outline"
			size={size}
			value={value}
			onValueChange={v => {
				if (v) onValueChange(v as T)
			}}
			className={className}
		>
			{options.map(opt => (
				<ToggleGroupItem
					key={opt.value}
					value={opt.value}
					aria-label={opt.ariaLabel ?? (typeof opt.label === 'string' ? opt.label : opt.value)}
					className={cn(SELECTED_TONE_CLASSES)}
				>
					{opt.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	)
}
