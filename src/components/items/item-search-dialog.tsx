import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, PackageSearch, Search } from 'lucide-react'
import { useState } from 'react'

import { type MyItemSearchRow, searchMyItems } from '@/api/items'
import ListTypeIcon from '@/components/common/list-type-icon'
import { MoveItemDialog } from '@/components/items/move-item-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { httpsUpgrade } from '@/lib/image-url'
import { MIN_ITEM_SEARCH_QUERY_LENGTH } from '@/lib/item-search'
import { useDebouncedValue } from '@/lib/use-debounced-value'

// Prefix key: `MoveItemDialog` invalidates on this, which covers every
// per-query entry below it.
const searchQueryKeyPrefix = ['my-item-search'] as const

// Long enough that a normal typing burst is one request, short enough that
// results feel like they're keeping up.
const DEBOUNCE_MS = 200

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function ItemSearchDialog({ open, onOpenChange }: Props) {
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const [movingItem, setMovingItem] = useState<MyItemSearchRow | null>(null)
	const [query, setQuery] = useState('')

	// The input is controlled so keystrokes paint immediately; only the settled
	// value drives a request.
	const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS)
	const trimmedQuery = debouncedQuery.trim()
	const hasQuery = trimmedQuery.length >= MIN_ITEM_SEARCH_QUERY_LENGTH

	// Matching, ranking, and the result cap all live in `searchMyItemsImpl`; we
	// render exactly what comes back. Nothing is requested until the query
	// clears the minimum length.
	const { data, isPending } = useQuery({
		queryKey: [...searchQueryKeyPrefix, trimmedQuery],
		queryFn: () => searchMyItems({ data: { query: trimmedQuery } }),
		enabled: open && hasQuery,
		staleTime: 30 * 1000,
		// Keep the last query's rows on screen while the next one is in flight so
		// the list doesn't flash empty mid-typing.
		placeholderData: keepPreviousData,
	})

	const result = data?.kind === 'ok' ? data : null
	const rows = result?.items ?? []

	const handleOpenChange = (next: boolean) => {
		if (!next) setQuery('')
		onOpenChange(next)
	}

	const openList = (listId: number) => {
		handleOpenChange(false)
		navigate({ to: '/lists/$listId', params: { listId: String(listId) } })
	}

	const startMove = (row: MyItemSearchRow) => {
		// Close the search dialog and hand off to the move dialog so the two
		// don't fight over focus / outside-click. The move dialog invalidates
		// the search query on success, so reopening search shows the new list.
		handleOpenChange(false)
		setMovingItem(row)
	}

	return (
		<>
			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogContent className="gap-4 p-0 sm:max-w-2xl" showCloseButton={false}>
					<DialogHeader className="px-6 pt-6">
						<DialogTitle>Search my items</DialogTitle>
						<DialogDescription>Search across every item on the lists you own.</DialogDescription>
					</DialogHeader>

					<Command
						// `shouldFilter={false}`: the server already matched, ranked, and
						// capped, so cmdk only handles keyboard navigation over the
						// (small) rendered set.
						shouldFilter={false}
						className="rounded-none border-t bg-transparent"
					>
						<CommandInput placeholder="Search items by name, list, or notes…" value={query} onValueChange={setQuery} autoFocus />
						<CommandList className="max-h-[min(60svh,32rem)]">
							{!hasQuery ? (
								<div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
									<Search className="size-6 opacity-60" />
									<p>Type at least {MIN_ITEM_SEARCH_QUERY_LENGTH} characters to search.</p>
								</div>
							) : isPending || !result ? (
								<div className="space-y-2 p-3">
									{Array.from({ length: 5 }).map((_, i) => (
										<div key={i} className="flex items-center gap-3">
											<Skeleton className="size-10 rounded-md" />
											<div className="flex-1 space-y-1.5">
												<Skeleton className="h-3.5 w-1/2" />
												<Skeleton className="h-3 w-1/4" />
											</div>
										</div>
									))}
								</div>
							) : !result.hasAnyItems ? (
								<div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
									<PackageSearch className="size-6 opacity-60" />
									<p>You don't have any items on your own lists yet.</p>
								</div>
							) : rows.length === 0 ? (
								<div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
									<PackageSearch className="size-6 opacity-60" />
									<p>No items match your search.</p>
								</div>
							) : (
								<>
									<div className="p-1">
										{rows.map(row => (
											<CommandItem
												key={row.itemId}
												// Unique per item; cmdk isn't filtering on this value
												// (see `shouldFilter={false}`), it only needs identity.
												value={String(row.itemId)}
												onSelect={() => openList(row.listId)}
												className="gap-3 py-2"
											>
												{row.imageUrl ? (
													<img
														src={httpsUpgrade(row.imageUrl)}
														alt=""
														className="size-10 shrink-0 rounded-md object-cover ring-1 ring-inset ring-border"
													/>
												) : (
													<div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted/50 ring-1 ring-inset ring-border">
														<ListTypeIcon type={row.listType} className="size-4" />
													</div>
												)}

												<div className="min-w-0 flex-1">
													<div className="truncate font-medium">{row.title}</div>
													<div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
														<Badge variant="secondary" className="gap-1 font-normal">
															<ListTypeIcon type={row.listType} className="size-3" />
															<span className="max-w-40 truncate">{row.listName}</span>
														</Badge>
														{row.price && <span className="truncate">{row.price}</span>}
													</div>
												</div>

												<div className="flex shrink-0 items-center gap-1">
													<Button
														type="button"
														size="sm"
														variant="outline"
														onClick={e => {
															e.stopPropagation()
															startMove(row)
														}}
													>
														Move
													</Button>
													<Button
														type="button"
														size="sm"
														variant="ghost"
														onClick={e => {
															e.stopPropagation()
															openList(row.listId)
														}}
													>
														Open <ArrowRight className="size-3.5" />
													</Button>
												</div>
											</CommandItem>
										))}
									</div>
									{result.totalMatches > rows.length && (
										<p className="px-3 pb-3 text-center text-xs text-muted-foreground">
											Showing the closest {rows.length} of {result.totalMatches} matches. Keep typing to narrow it down.
										</p>
									)}
								</>
							)}
						</CommandList>
					</Command>
				</DialogContent>
			</Dialog>

			{movingItem && (
				<MoveItemDialog
					open
					onOpenChange={next => {
						if (!next) setMovingItem(null)
					}}
					item={{ id: movingItem.itemId, listId: movingItem.listId, title: movingItem.title }}
					onMoved={() => {
						setMovingItem(null)
						void queryClient.invalidateQueries({ queryKey: searchQueryKeyPrefix })
					}}
				/>
			)}
		</>
	)
}
