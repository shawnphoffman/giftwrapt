import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, PackageSearch } from 'lucide-react'
import { useState } from 'react'

import { type MyItemSearchRow, searchMyItems } from '@/api/items'
import ListTypeIcon from '@/components/common/list-type-icon'
import { MoveItemDialog } from '@/components/items/move-item-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { httpsUpgrade } from '@/lib/image-url'

const searchQueryKey = ['my-item-search'] as const

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function ItemSearchDialog({ open, onOpenChange }: Props) {
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const [movingItem, setMovingItem] = useState<MyItemSearchRow | null>(null)

	const { data, isLoading } = useQuery({
		queryKey: searchQueryKey,
		queryFn: () => searchMyItems(),
		enabled: open,
		staleTime: 30 * 1000,
	})

	const rows = data?.items ?? []

	const openList = (listId: number) => {
		onOpenChange(false)
		navigate({ to: '/lists/$listId', params: { listId: String(listId) } })
	}

	const startMove = (row: MyItemSearchRow) => {
		// Close the search dialog and hand off to the move dialog so the two
		// don't fight over focus / outside-click. The move dialog invalidates
		// the search query on success, so reopening search shows the new list.
		onOpenChange(false)
		setMovingItem(row)
	}

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="gap-4 p-0 sm:max-w-2xl" showCloseButton={false}>
					<DialogHeader className="px-6 pt-6">
						<DialogTitle>Search my items</DialogTitle>
						<DialogDescription>Fuzzy-search across every item on the lists you own.</DialogDescription>
					</DialogHeader>

					<Command
						// We supply pre-ordered rows and let cmdk do the fuzzy filtering
						// over each item's title / list name / notes.
						className="rounded-none border-t bg-transparent"
					>
						<CommandInput placeholder="Search items by name, list, or notes…" autoFocus />
						<CommandList className="max-h-[min(60svh,32rem)]">
							{isLoading ? (
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
							) : rows.length === 0 ? (
								<div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
									<PackageSearch className="size-6 opacity-60" />
									<p>You don't have any items on your own lists yet.</p>
								</div>
							) : (
								<>
									<CommandEmpty>No items match your search.</CommandEmpty>
									<div className="p-1">
										{rows.map(row => (
											<CommandItem
												key={row.itemId}
												// Unique per item (id disambiguates duplicate titles) while
												// still exposing the searchable text to cmdk's fuzzy filter.
												value={`${row.title} · ${row.listName} · ${row.notes ?? ''} · #${row.itemId}`}
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
						void queryClient.invalidateQueries({ queryKey: searchQueryKey })
					}}
				/>
			)}
		</>
	)
}
