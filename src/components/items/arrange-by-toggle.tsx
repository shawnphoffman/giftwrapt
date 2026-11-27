import { ArrowBigUp, Tag } from 'lucide-react'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

export type Arrangement = 'priority' | 'category'

type Props = {
	value: Arrangement
	onChange: (value: Arrangement) => void
	className?: string
}

// Words or icons, never both. From the `xs` breakpoint up the two sides show
// their words. Below it they show icons only, the words stay for screen
// readers and as tooltips, and the pressed side turns solid so the state
// reads without words.
const itemClass =
	'h-7 gap-1 px-2.5 text-xs font-semibold max-xs:w-8 max-xs:px-0 max-xs:data-[state=on]:bg-foreground max-xs:data-[state=on]:text-background'

// The icons match the rest of the app: ArrowBigUp is the high-priority mark
// (PriorityIcon), and Tag is the icon for categories everywhere.
export function ArrangeByToggle({ value, onChange, className }: Props) {
	return (
		<ToggleGroup
			type="single"
			variant="outline"
			value={value}
			// Radix lets the pressed item be un-pressed; one side is always on.
			onValueChange={v => {
				if (v === 'priority' || v === 'category') onChange(v)
			}}
			aria-label={m.items_arrange_label()}
			className={cn('shrink-0', className)}
		>
			<ToggleGroupItem value="priority" title={m.items_arrange_priority()} className={itemClass}>
				<ArrowBigUp className="size-3.5 xs:hidden" aria-hidden />
				<span className="max-xs:sr-only">{m.items_arrange_priority()}</span>
			</ToggleGroupItem>
			<ToggleGroupItem value="category" title={m.items_arrange_category()} className={itemClass}>
				<Tag className="size-3.5 xs:hidden" aria-hidden />
				<span className="max-xs:sr-only">{m.items_arrange_category()}</span>
			</ToggleGroupItem>
		</ToggleGroup>
	)
}
