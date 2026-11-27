import type { CategoryKey, CategorySummary } from '@/lib/item-categories'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

type Props = {
	categories: ReadonlyArray<CategorySummary>
	// How many rows each key holds. A key with no entry counts as zero.
	counts: ReadonlyMap<CategoryKey, number>
	total: number
	selected: ReadonlySet<CategoryKey>
	onToggle: (key: CategoryKey) => void
	onClear: () => void
	className?: string
}

// The owner's filter row: one chip per category with its item count. The
// counts are item counts only; the owner never sees claims. The row scrolls
// sideways instead of wrapping, so it stays one line tall on a phone.
export function CategoryFilterChips({ categories, counts, total, selected, onToggle, onClear, className }: Props) {
	const noneCount = counts.get('none') ?? 0
	return (
		<div
			role="group"
			aria-label={m.items_category_filter_label()}
			className={cn('-mx-1 flex gap-1.5 overflow-x-auto px-1 py-1 [scrollbar-width:none]', className)}
		>
			<Chip pressed={selected.size === 0} onClick={onClear} label={m.items_category_filter_all()} count={total} />
			{categories.map(c => (
				<Chip key={c.id} pressed={selected.has(c.id)} onClick={() => onToggle(c.id)} label={c.name} count={counts.get(c.id) ?? 0} />
			))}
			{noneCount > 0 && (
				<Chip pressed={selected.has('none')} onClick={() => onToggle('none')} label={m.items_category_none()} count={noneCount} />
			)}
		</div>
	)
}

function Chip({ pressed, onClick, label, count }: { pressed: boolean; onClick: () => void; label: string; count: number }) {
	return (
		<button
			type="button"
			aria-pressed={pressed}
			onClick={onClick}
			className={cn(
				'inline-flex h-7 max-w-56 shrink-0 items-center gap-1.5 rounded-4xl border px-3 text-xs font-semibold whitespace-nowrap outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
				pressed ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-muted'
			)}
		>
			<span className="truncate">{label}</span>
			<span className={cn('font-medium tabular-nums', pressed ? 'opacity-75' : 'text-muted-foreground')}>{count}</span>
		</button>
	)
}
