import { ArrowBigDown, ArrowBigUp, Minus, Zap } from 'lucide-react'

import type { Priority } from '@/db/schema/enums'
import { priorityLabel } from '@/lib/i18n/labels'
import { priorityRingClass } from '@/lib/priority-classes'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

// Highest-to-lowest so the inline row reads left-to-right like the priority
// scale. Icons/colors mirror PriorityIcon; 'normal' has no PriorityIcon glyph,
// so it gets a neutral dash to stay visible in the icon picker.
const PRIORITY_OPTIONS: ReadonlyArray<{ value: Priority; icon: typeof Zap; colorClass: string }> = [
	{ value: 'very-high', icon: Zap, colorClass: 'text-yellow-500' },
	{ value: 'high', icon: ArrowBigUp, colorClass: 'text-orange-500' },
	{ value: 'normal', icon: Minus, colorClass: 'text-muted-foreground' },
	{ value: 'low', icon: ArrowBigDown, colorClass: 'text-blue-500' },
]

type Props = {
	value: Priority
	onSelect: (priority: Priority) => void
}

/**
 * Inline row of priority buttons for an overflow menu. These are plain
 * buttons, not menu items, so the caller must close its (controlled) menu in
 * `onSelect`: left open, the row jumps to its new priority slot, the menu
 * follows it off-screen, and its modal lock freezes the page.
 */
export function PriorityQuickPicker({ value, onSelect }: Props) {
	return (
		<div className="flex items-center justify-center gap-1 px-1 py-1">
			{PRIORITY_OPTIONS.map(option => {
				const OptionIcon = option.icon
				const selected = value === option.value
				return (
					<button
						key={option.value}
						type="button"
						onClick={() => onSelect(option.value)}
						title={priorityLabel(option.value)}
						aria-label={m.items_row_set_priority_label({ priority: priorityLabel(option.value) })}
						aria-pressed={selected}
						className={cn(
							'flex size-7 items-center justify-center rounded-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-hidden',
							selected
								? cn('bg-accent ring-1 ring-inset', priorityRingClass[option.value] || 'ring-border')
								: 'opacity-60 hover:opacity-100'
						)}
					>
						<OptionIcon className={cn('size-4', option.colorClass)} />
					</button>
				)
			})}
		</div>
	)
}
