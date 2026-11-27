import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'

import { createCategory, deleteCategory, getCategoryNameSuggestions, reorderCategories, updateCategory } from '@/api/categories'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { CategorySummary } from '@/lib/item-categories'
import { itemsKeys } from '@/lib/queries/items'
import { LIMITS } from '@/lib/validation/limits'
import { m } from '@/paraglide/messages.js'

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	listId: number
	categories: ReadonlyArray<CategorySummary>
	// Rows per category, as the list shows them (a group counts once).
	itemCounts: ReadonlyMap<number, number>
}

const suggestionsKey = (listId: number) => ['category-name-suggestions', listId] as const

// Where a list's categories are added, renamed, ordered and deleted. Every
// change saves at once; Done only closes. Categories are optional, so an
// empty dialog is a normal state.
export function CategoriesDialog({ open, onOpenChange, listId, categories, itemCounts }: Props) {
	const router = useRouter()
	const queryClient = useQueryClient()
	const [newName, setNewName] = useState('')
	const [busy, setBusy] = useState(false)

	// Names from the person's other lists, so a second list gets the same
	// categories with a tap each.
	const { data: suggestions } = useQuery({
		queryKey: suggestionsKey(listId),
		queryFn: async () => {
			const result = await getCategoryNameSuggestions({ data: { listId } })
			return result.kind === 'ok' ? result.names : []
		},
		enabled: open,
		staleTime: 0,
	})

	// Categories come from the route loader. A delete also clears the
	// category on its items, so the items query refetches too.
	const refresh = () =>
		Promise.all([
			router.invalidate(),
			queryClient.invalidateQueries({ queryKey: itemsKeys.byList(listId) }),
			queryClient.invalidateQueries({ queryKey: suggestionsKey(listId) }),
		])

	const run = async (action: () => Promise<{ kind: 'ok' } | { kind: 'error'; reason: string }>): Promise<boolean> => {
		setBusy(true)
		try {
			const result = await action()
			if (result.kind === 'error') {
				toast.error(result.reason === 'name-taken' ? m.items_categories_toast_name_taken() : m.items_categories_toast_failed())
				return false
			}
			await refresh()
			return true
		} catch {
			toast.error(m.items_categories_toast_failed())
			return false
		} finally {
			setBusy(false)
		}
	}

	const add = (name: string) => run(() => createCategory({ data: { listId, name } }))

	const handleAdd = async (e: FormEvent) => {
		e.preventDefault()
		const name = newName.trim()
		if (!name) return
		if (await add(name)) setNewName('')
	}

	const handleRename = async (category: CategorySummary, input: HTMLInputElement) => {
		const name = input.value.trim()
		if (!name || name === category.name) {
			input.value = category.name
			return
		}
		const ok = await run(() => updateCategory({ data: { categoryId: category.id, name } }))
		if (!ok) input.value = category.name
	}

	const handleMove = (index: number, direction: -1 | 1) => {
		const next = categories.map(c => c.id)
		const to = index + direction
		if (to < 0 || to >= next.length) return
		;[next[index], next[to]] = [next[to], next[index]]
		void run(() => reorderCategories({ data: { listId, categoryIds: next } }))
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{m.items_categories_dialog_title()}</DialogTitle>
					<DialogDescription>{m.items_categories_dialog_description()}</DialogDescription>
				</DialogHeader>

				<div className="grid gap-3">
					{categories.length === 0 ? (
						<p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">{m.items_categories_empty()}</p>
					) : (
						<ul className="grid gap-1.5">
							{categories.map((category, index) => (
								<li key={category.id} className="flex min-w-0 items-center gap-1.5">
									<Button
										type="button"
										variant="outline"
										size="icon-xs"
										disabled={busy || index === 0}
										onClick={() => handleMove(index, -1)}
										aria-label={m.items_categories_move_up({ name: category.name })}
									>
										<ArrowUp className="size-4" />
									</Button>
									<Button
										type="button"
										variant="outline"
										size="icon-xs"
										disabled={busy || index === categories.length - 1}
										onClick={() => handleMove(index, 1)}
										aria-label={m.items_categories_move_down({ name: category.name })}
									>
										<ArrowDown className="size-4" />
									</Button>
									{/* Uncontrolled and keyed on the saved name: a rename saves on blur or Enter, and a refused one snaps back. */}
									<Input
										key={`${category.id}:${category.name}`}
										id={`category-name-${category.id}`}
										name="category-name"
										defaultValue={category.name}
										aria-label={m.items_categories_name_label()}
										maxLength={LIMITS.CATEGORY_NAME}
										autoComplete="off"
										data-1p-ignore
										data-lpignore="true"
										disabled={busy}
										className="h-8 min-w-0 flex-1 font-medium"
										onBlur={e => void handleRename(category, e.currentTarget)}
										onKeyDown={e => {
											if (e.key === 'Enter') e.currentTarget.blur()
										}}
									/>
									<span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
										{m.items_categories_item_count({ count: itemCounts.get(category.id) ?? 0 })}
									</span>
									<Button
										type="button"
										variant="outline"
										size="icon-xs"
										disabled={busy}
										onClick={() => void run(() => deleteCategory({ data: { categoryId: category.id } }))}
										aria-label={m.items_categories_delete({ name: category.name })}
									>
										<X className="size-4" />
									</Button>
								</li>
							))}
						</ul>
					)}

					{suggestions && suggestions.length > 0 && (
						<div className="grid gap-2 border-t pt-3">
							<p className="text-xs text-muted-foreground">{m.items_categories_other_lists()}</p>
							<div className="flex flex-wrap gap-1.5">
								{suggestions.map(name => (
									<button
										key={name}
										type="button"
										disabled={busy}
										onClick={() => void add(name)}
										className="inline-flex h-7 max-w-full items-center rounded-4xl border border-dashed px-3 text-xs font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
									>
										<span className="truncate">{name}</span>
									</button>
								))}
							</div>
						</div>
					)}

					<form onSubmit={handleAdd} className="flex items-center gap-2 border-t pt-3">
						<Input
							id={`category-new-${listId}`}
							name="category-new"
							value={newName}
							onChange={e => setNewName(e.target.value)}
							placeholder={m.items_categories_new_placeholder()}
							aria-label={m.items_categories_new_label()}
							maxLength={LIMITS.CATEGORY_NAME}
							autoComplete="off"
							data-1p-ignore
							data-lpignore="true"
							disabled={busy}
							className="h-8 min-w-0 flex-1"
						/>
						<Button type="submit" variant="outline" size="sm" disabled={busy || newName.trim() === ''}>
							{m.action_add()}
						</Button>
					</form>
					<p className="text-xs text-muted-foreground">{m.items_categories_hint()}</p>
				</div>

				<DialogFooter>
					<Button onClick={() => onOpenChange(false)}>{m.action_done()}</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
