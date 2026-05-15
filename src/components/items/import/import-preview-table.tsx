import { ImageOff, Sparkles, Trash2 } from 'lucide-react'
import { useMemo } from 'react'

import type { ItemDraft } from '@/api/import'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { httpsUpgrade } from '@/lib/image-url'

type Props = {
	drafts: ReadonlyArray<ItemDraft>
	onChange: (drafts: Array<ItemDraft>) => void
	onSubmit: () => void
	onCancel: () => void
	submitting: boolean
	selected: ReadonlySet<number>
	onSelectedChange: (next: Set<number>) => void
	emptyTitle?: string
	emptyDescription?: string
	importLabel?: string
}

/**
 * Shared preview table for bulk imports. Each row shows a thumbnail (when
 * known), an editable title, the URL, and a delete button. URL-only rows
 * surface a small badge so users know the title will be filled in by the
 * background scrape queue after import.
 *
 * The component is fully controlled: the parent owns the drafts array and
 * the selection set. The "Import N items" button calls `onSubmit`, which
 * is expected to call `bulkCreateItems` with the current drafts.
 */
export function ImportPreviewTable({
	drafts,
	onChange,
	onSubmit,
	onCancel,
	submitting,
	selected,
	onSelectedChange,
	emptyTitle = 'Nothing to import',
	emptyDescription = 'Remove rows by clicking the trash icon, or go back to start over.',
	importLabel = 'Import',
}: Props) {
	const allSelected = drafts.length > 0 && selected.size === drafts.length

	const selectedCount = selected.size

	const blankTitleCount = useMemo(() => drafts.filter(d => !d.title || d.title.trim().length === 0).length, [drafts])

	const updateDraft = (index: number, patch: Partial<ItemDraft>) => {
		const next = drafts.map((d, i) => (i === index ? { ...d, ...patch } : d))
		onChange(next)
	}

	const removeAt = (index: number) => {
		const next = drafts.filter((_, i) => i !== index)
		onChange(next)
		if (selected.size === 0) return
		// Selection set carries indices; rebuild it relative to the new array.
		const nextSelected = new Set<number>()
		for (const i of selected) {
			if (i === index) continue
			nextSelected.add(i > index ? i - 1 : i)
		}
		onSelectedChange(nextSelected)
	}

	const removeSelected = () => {
		if (selected.size === 0) return
		const next = drafts.filter((_, i) => !selected.has(i))
		onChange(next)
		onSelectedChange(new Set())
	}

	const toggleAll = () => {
		if (allSelected) {
			onSelectedChange(new Set())
		} else {
			onSelectedChange(new Set(drafts.map((_, i) => i)))
		}
	}

	const toggleOne = (index: number) => {
		const next = new Set(selected)
		if (next.has(index)) next.delete(index)
		else next.add(index)
		onSelectedChange(next)
	}

	if (drafts.length === 0) {
		return (
			<div className="flex flex-col items-center gap-3 py-10 text-center">
				<div className="text-muted-foreground text-sm font-medium">{emptyTitle}</div>
				<div className="text-muted-foreground text-xs">{emptyDescription}</div>
				<Button type="button" variant="outline" size="sm" onClick={onCancel}>
					Back
				</Button>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-3 text-xs">
				<label className="flex items-center gap-2">
					<Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label={allSelected ? 'Deselect all rows' : 'Select all rows'} />
					<span className="text-muted-foreground">
						{drafts.length} item{drafts.length === 1 ? '' : 's'}
					</span>
				</label>
				<div className="flex items-center gap-2">
					{selectedCount > 0 && (
						<Button type="button" variant="ghost" size="xs" onClick={removeSelected} disabled={submitting}>
							<Trash2 className="size-3" /> Remove {selectedCount}
						</Button>
					)}
				</div>
			</div>

			<ul className="flex flex-col divide-y rounded-md border max-h-[420px] overflow-y-auto">
				{drafts.map((draft, index) => {
					const titleBlank = !draft.title || draft.title.trim().length === 0
					const hasUrl = !!draft.url && draft.url.trim().length > 0
					return (
						<li key={index} className="flex items-center gap-3 p-2">
							<Checkbox checked={selected.has(index)} onCheckedChange={() => toggleOne(index)} aria-label={`Select row ${index + 1}`} />
							<div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
								{draft.imageUrl ? (
									<img src={httpsUpgrade(draft.imageUrl)} alt="" className="size-full object-cover" />
								) : (
									<ImageOff className="size-4 text-muted-foreground" aria-hidden />
								)}
							</div>
							<div className="flex flex-col gap-1 flex-1 min-w-0">
								<Input
									value={draft.title ?? ''}
									onChange={e => updateDraft(index, { title: e.target.value })}
									placeholder={hasUrl ? '(scrape will fill this in)' : 'Item title'}
									disabled={submitting}
									aria-label={`Title for row ${index + 1}`}
								/>
								<div className="flex items-center gap-2 text-xs text-muted-foreground">
									{hasUrl ? (
										<span className="truncate flex-1" title={draft.url ?? undefined}>
											{draft.url}
										</span>
									) : (
										<span className="italic">No URL</span>
									)}
									{titleBlank && hasUrl && (
										<Badge variant="secondary" className="gap-1 text-[0.65rem] py-0 px-1.5">
											<Sparkles className="size-3" /> queued
										</Badge>
									)}
								</div>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								onClick={() => removeAt(index)}
								disabled={submitting}
								aria-label={`Remove row ${index + 1}`}
							>
								<Trash2 className="size-4" />
							</Button>
						</li>
					)
				})}
			</ul>

			<div className="flex items-center justify-between gap-3">
				<div className="text-xs text-muted-foreground">
					{drafts.length} item{drafts.length === 1 ? '' : 's'} will be imported
					{blankTitleCount > 0 ? `; ${blankTitleCount} will be filled in by the background scrape` : ''}.
				</div>
				<div className="flex items-center gap-2">
					<Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
						Cancel
					</Button>
					<Button type="button" onClick={onSubmit} disabled={submitting || drafts.length === 0}>
						{submitting ? 'Importing...' : `${importLabel} ${drafts.length} item${drafts.length === 1 ? '' : 's'}`}
					</Button>
				</div>
			</div>
		</div>
	)
}
