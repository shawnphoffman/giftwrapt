import { Filter } from 'lucide-react'

import DependentAvatar from '@/components/common/dependent-avatar'
import ListTypeIcon from '@/components/common/list-type-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

import type { ListRef } from './__fixtures__/types'

// The "Global suggestions" pseudo-row uses this sentinel id so the rest of
// the selection model can treat it uniformly with real list ids.
export const GLOBAL_FILTER_ID = '__global__'

export type ListFilterOption = {
	listId: string
	listRef: ListRef | null // null for the Global pseudo-row
}

export type ListFilterSection = {
	// 'user'   - the viewer's own lists
	// 'global' - the pseudo-row for recs with no list scope
	// 'dependent:<id>' - lists belonging to a dependent the user manages
	key: string
	label: string
	dependent?: { id: string; name: string; image: string | null }
	options: Array<ListFilterOption>
}

type Props = {
	sections: ReadonlyArray<ListFilterSection>
	selected: ReadonlySet<string>
	onChange: (next: Set<string>) => void
	// When true, render only the icon (with an unchecked-count badge).
	// Used on narrow viewports to save header space.
	iconOnly?: boolean
}

// Counts how many options across all sections (so the badge reflects
// total muted lists/sections, not just one). Includes the Global option.
function totalOptions(sections: ReadonlyArray<ListFilterSection>): number {
	return sections.reduce((acc, s) => acc + s.options.length, 0)
}

function uncheckedCount(sections: ReadonlyArray<ListFilterSection>, selected: ReadonlySet<string>): number {
	let n = 0
	for (const section of sections) {
		for (const opt of section.options) {
			if (!selected.has(opt.listId)) n++
		}
	}
	return n
}

export function ListFilterPopover({ sections, selected, onChange, iconOnly = false }: Props) {
	const total = totalOptions(sections)
	const muted = uncheckedCount(sections, selected)
	const allChecked = muted === 0
	const allUnchecked = muted === total

	const toggle = (listId: string) => {
		const next = new Set(selected)
		if (next.has(listId)) next.delete(listId)
		else next.add(listId)
		onChange(next)
	}

	const selectAll = () => {
		const next = new Set<string>()
		for (const section of sections) for (const opt of section.options) next.add(opt.listId)
		onChange(next)
	}

	const clearAll = () => onChange(new Set())

	// Nothing to filter on - hide the trigger entirely so the header doesn't
	// render a non-functional control.
	if (total === 0) return null

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					data-intelligence="list-filter-trigger"
					data-filter-active={!allChecked ? 'true' : 'false'}
					size="sm"
					variant="outline"
					aria-label={iconOnly ? 'Filter suggestions by list' : undefined}
					className={iconOnly ? 'relative px-2' : 'relative'}
				>
					<Filter className="size-4" />
					{!iconOnly && <span>Filter</span>}
					{muted > 0 && (
						<Badge
							data-intelligence="list-filter-count"
							variant="secondary"
							className={cn(
								'absolute -top-1 -right-1 size-4 min-w-0 rounded-full px-0 text-[10px] tabular-nums leading-none',
								'bg-fuchsia-500 text-white ring-1 ring-background'
							)}
						>
							{muted}
						</Badge>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent data-intelligence="list-filter-popover" className="w-80 p-0" align="end">
				<div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
					<span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Filter by list</span>
					<div className="flex items-center gap-1">
						<button
							type="button"
							data-intelligence="list-filter-select-all"
							onClick={selectAll}
							disabled={allChecked}
							className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
						>
							Select all
						</button>
						<span className="text-xs text-muted-foreground/40">·</span>
						<button
							type="button"
							data-intelligence="list-filter-clear"
							onClick={clearAll}
							disabled={allUnchecked}
							className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
						>
							Clear
						</button>
					</div>
				</div>
				<div className="max-h-[60vh] overflow-y-auto p-1">
					{sections.map((section, sectionIdx) => (
						<div key={section.key} data-intelligence="list-filter-section" data-section-key={section.key}>
							{sectionIdx > 0 && <Separator className="my-1" />}
							<div data-intelligence="list-filter-section-header" className="flex items-center gap-2 px-3 py-1.5">
								{section.dependent && <DependentAvatar name={section.dependent.name} image={section.dependent.image} size="small" />}
								<span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{section.label}</span>
							</div>
							{section.options.map(opt => {
								const isGlobal = opt.listId === GLOBAL_FILTER_ID
								const checked = selected.has(opt.listId)
								return (
									<label
										key={opt.listId}
										data-intelligence="list-filter-option"
										data-list-id={opt.listId}
										data-checked={checked ? 'true' : 'false'}
										className="flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm hover:bg-muted/60 cursor-pointer"
									>
										<Checkbox checked={checked} onCheckedChange={() => toggle(opt.listId)} />
										{!isGlobal && opt.listRef && (
											<ListTypeIcon type={opt.listRef.type} className="size-3.5 shrink-0 text-muted-foreground" />
										)}
										<span className="truncate">{isGlobal ? 'Global suggestions' : (opt.listRef?.name ?? opt.listId)}</span>
									</label>
								)
							})}
						</div>
					))}
				</div>
			</PopoverContent>
		</Popover>
	)
}

// ─── Selection / derivation helpers (exported for unit tests) ───────────────

// Pulls the union of list ids referenced by a rec (from `affected.listChips`
// and `relatedLists`). A rec with an empty union is "global" and rolls into
// the Global pseudo-row in the filter.
export function listIdsForRec(rec: { affected?: { listChips?: Array<ListRef> }; relatedLists?: Array<ListRef> }): Set<string> {
	const ids = new Set<string>()
	for (const l of rec.affected?.listChips ?? []) ids.add(l.id)
	for (const l of rec.relatedLists ?? []) ids.add(l.id)
	return ids
}

type RecWithLists = { affected?: { listChips?: Array<ListRef> }; relatedLists?: Array<ListRef> }

// Builds the filter sections from the active recs. Adds the Global pseudo-row
// only if at least one rec is global (zero list scope). User-scope lists are
// gathered from `userRecs`; per-dependent lists are gathered from
// `dependentGroups`. Lists are sorted alphabetically within each section.
export function buildFilterSections(
	userRecs: ReadonlyArray<RecWithLists>,
	dependentGroups: ReadonlyArray<{ dependent: { id: string; name: string; image: string | null }; recs: ReadonlyArray<RecWithLists> }>
): Array<ListFilterSection> {
	const sections: Array<ListFilterSection> = []

	// 1. Global pseudo-row: only present if any user or dependent rec has
	//    zero list scope.
	const anyGlobal =
		userRecs.some(r => listIdsForRec(r).size === 0) || dependentGroups.some(g => g.recs.some(r => listIdsForRec(r).size === 0))
	if (anyGlobal) {
		sections.push({
			key: 'global',
			label: 'Global suggestions',
			options: [{ listId: GLOBAL_FILTER_ID, listRef: null }],
		})
	}

	// 2. Lists pulled from the user's own active recs that aren't already
	//    claimed by a dependent section. Build a set of dependent-claimed
	//    list ids first so a list seen in both places goes to the dependent
	//    section.
	const dependentClaimed = new Set<string>()
	for (const group of dependentGroups) {
		for (const rec of group.recs) {
			for (const l of rec.affected?.listChips ?? []) dependentClaimed.add(l.id)
			for (const l of rec.relatedLists ?? []) dependentClaimed.add(l.id)
		}
	}
	const userLists = new Map<string, ListRef>()
	for (const rec of userRecs) {
		for (const l of rec.affected?.listChips ?? []) if (!dependentClaimed.has(l.id)) userLists.set(l.id, l)
		for (const l of rec.relatedLists ?? []) if (!dependentClaimed.has(l.id)) userLists.set(l.id, l)
	}
	if (userLists.size > 0) {
		sections.push({
			key: 'user',
			label: 'Your lists',
			options: [...userLists.values()].sort((a, b) => a.name.localeCompare(b.name)).map(listRef => ({ listId: listRef.id, listRef })),
		})
	}

	// 3. One section per dependent, in the order the caller passed them.
	for (const group of dependentGroups) {
		const lists = new Map<string, ListRef>()
		for (const rec of group.recs) {
			for (const l of rec.affected?.listChips ?? []) lists.set(l.id, l)
			for (const l of rec.relatedLists ?? []) lists.set(l.id, l)
		}
		if (lists.size === 0) continue
		sections.push({
			key: `dependent:${group.dependent.id}`,
			label: `${group.dependent.name}'s lists`,
			dependent: group.dependent,
			options: [...lists.values()].sort((a, b) => a.name.localeCompare(b.name)).map(listRef => ({ listId: listRef.id, listRef })),
		})
	}

	return sections
}

// True iff the rec should be rendered given the current selection. A rec is
// visible if (a) it's global and the Global option is selected, or (b) at
// least one of its list ids is in the selected set.
export function isRecVisible(rec: RecWithLists, selected: ReadonlySet<string>): boolean {
	const ids = listIdsForRec(rec)
	if (ids.size === 0) return selected.has(GLOBAL_FILTER_ID)
	for (const id of ids) if (selected.has(id)) return true
	return false
}
