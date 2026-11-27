import type { CategoryClaimStats } from '@/lib/category-claims'
import { formatList } from '@/lib/i18n/format'
import type { CategoryKey } from '@/lib/item-categories'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

export type CategoryOverviewRow = { key: CategoryKey; name: string } & CategoryClaimStats

type Props = {
	rows: ReadonlyArray<CategoryOverviewRow>
	// The category the list is narrowed to, or null for the whole list.
	selected: CategoryKey | null
	onSelect: (key: CategoryKey | null) => void
	className?: string
}

// Shows a claimed bar for a category: how much of it gifters have covered.
export function ClaimMeter({ total, claimed, className }: CategoryClaimStats & { className?: string }) {
	const percent = total > 0 ? Math.round((claimed / total) * 100) : 0
	return (
		<span aria-hidden className={cn('block h-1.5 overflow-hidden rounded-full bg-border', className)}>
			<span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
		</span>
	)
}

// The gifter's "What's on This List" panel: one row per category with how
// much of it is claimed, so purchases can be spread around. Gifter view
// only, and only beside the list where there is room. Pressing a row
// narrows the list to that category; pressing it again shows everything.
export function CategoryOverview({ rows, selected, onSelect, className }: Props) {
	// Named categories nobody has claimed anything in yet. "No category" is
	// left out of the sentence: it isn't something to shop by.
	const untouched = rows.filter(r => r.key !== 'none' && r.claimed === 0).map(r => r.name)

	return (
		<aside
			aria-label={m.items_overview_title()}
			className={cn('flex flex-col gap-1 rounded-lg bg-card p-2 pt-3 shadow-sm ring-1 ring-inset ring-border', className)}
		>
			<div role="heading" aria-level={2} className="px-2 text-sm font-bold leading-tight">
				{m.items_overview_title()}
			</div>
			<p className="px-2 pb-1 text-xs text-muted-foreground">
				{untouched.length > 0
					? m.items_overview_untouched({ categories: formatList(untouched, 'disjunction') })
					: m.items_overview_all_touched()}
			</p>
			{rows.map(row => {
				const pressed = selected === row.key
				return (
					<button
						key={row.key}
						type="button"
						aria-pressed={pressed}
						onClick={() => onSelect(pressed ? null : row.key)}
						className={cn(
							'grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2 gap-y-1.5 rounded-md px-2 py-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
							pressed && 'bg-accent'
						)}
					>
						<span className="truncate text-sm font-semibold">{row.name}</span>
						<span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
							{m.items_category_claimed_count({ claimed: row.claimed, total: row.total })}
						</span>
						<ClaimMeter total={row.total} claimed={row.claimed} className="col-span-2" />
					</button>
				)
			})}
		</aside>
	)
}
