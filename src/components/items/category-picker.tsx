import { ChevronDown, Settings2 } from 'lucide-react'

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

import { useListCategories } from './list-categories-context'

const NONE = 'none'

type Props = {
	value: number | null
	onChange: (categoryId: number | null) => void
	disabled?: boolean
	className?: string
}

// The category label on a row (or a group's footer). It is also the way to
// change it: a pill that opens the list's categories. Creating, renaming and
// deleting happen in the Categories dialog, reached from the last entry.
export function CategoryPicker({ value, onChange, disabled, className }: Props) {
	const { categories, onManage } = useListCategories()
	const current = value === null ? undefined : categories.find(c => c.id === value)

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					aria-label={m.items_category_picker_label()}
					className={cn(
						'inline-flex h-5 max-w-40 shrink-0 items-center gap-1 rounded-4xl border px-2 text-xs font-medium whitespace-nowrap outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50',
						current
							? 'border-border bg-accent text-foreground hover:bg-muted'
							: 'border-dashed text-muted-foreground hover:text-foreground',
						className
					)}
				>
					<span className="truncate">{current ? current.name : m.items_category_add()}</span>
					<ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="max-w-64">
				<DropdownMenuRadioGroup value={current ? String(current.id) : NONE} onValueChange={v => onChange(v === NONE ? null : Number(v))}>
					{categories.map(c => (
						<DropdownMenuRadioItem key={c.id} value={String(c.id)}>
							<span className="truncate">{c.name}</span>
						</DropdownMenuRadioItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuRadioItem value={NONE}>{m.items_category_none()}</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={onManage}>
					<Settings2 className="size-4" /> {m.items_category_manage()}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
