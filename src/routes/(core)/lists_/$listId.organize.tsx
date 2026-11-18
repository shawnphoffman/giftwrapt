import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { Move, Trash2 } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { type ItemForEditing, setGroupsPriority } from '@/api/items'
import { getListForEditing, type GroupSummary, type ListForEditing } from '@/api/lists'
import PriorityIcon from '@/components/common/priority-icon'
import { RemoteImage } from '@/components/common/remote-image'
import { BulkMoveItemsDialog } from '@/components/items/bulk-move-dialog'
import { GroupBadge } from '@/components/items/group-badge'
import { ItemListSkeleton } from '@/components/items/item-list-skeleton'
import { ReorderPanel } from '@/components/items/reorder-panel'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type Priority, priorityEnumValues } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'
import { priorityLabel } from '@/lib/i18n/labels'
import { buildListEntries } from '@/lib/list-entries'
import { useAssignItemsToGroup } from '@/lib/mutations/assign-items-to-group'
import { useDeleteGroups } from '@/lib/mutations/delete-groups'
import { useDeleteItems } from '@/lib/mutations/delete-items'
import { useSetItemsPriority } from '@/lib/mutations/set-items-priority'
import { priorityRingClass, priorityTabBgClass } from '@/lib/priority-classes'
import { listItemsEditQueryOptions } from '@/lib/queries/items'
import { useListAutoRefresh } from '@/lib/use-list-auto-refresh'
import { useListSSE } from '@/lib/use-list-sse'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

type TabMode = 'bulk' | 'reorder'

export const Route = createFileRoute('/(core)/lists_/$listId/organize')({
	loader: async ({ params, context }) => {
		const listId = Number(params.listId)
		if (!Number.isFinite(listId)) throw notFound()
		void context.queryClient.prefetchQuery(listItemsEditQueryOptions(listId))
		const result = await getListForEditing({ data: { listId: params.listId } })
		if (result.kind === 'error') throw notFound()
		return { list: result.list }
	},
	head: pageHead<{ list: { name: string } }>(d =>
		d ? m.lists_organize_page_title({ listName: d.list.name }) : m.lists_organize_page_title_fallback()
	),
	component: OrganizePage,
})

function OrganizePage() {
	const { list } = Route.useLoaderData()
	useListSSE(list.id, 'organize')
	useListAutoRefresh(list.id)
	const [tab, setTab] = useState<TabMode>('bulk')

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-4">
				<h1 className="leading-[1.1] pb-1 break-words">{list.name}</h1>

				<div className="flex border-b">
					<TabButton active={tab === 'bulk'} onClick={() => setTab('bulk')}>
						{m.lists_organize_tab_bulk()}
					</TabButton>
					<TabButton active={tab === 'reorder'} onClick={() => setTab('reorder')}>
						{m.lists_organize_tab_reorder()}
					</TabButton>
				</div>

				<Suspense fallback={<ItemListSkeleton />}>
					<OrganizeTabContent list={list} tab={tab} />
				</Suspense>
			</div>
		</div>
	)
}

function OrganizeTabContent({ list, tab }: { list: ListForEditing; tab: TabMode }) {
	const { data: items } = useSuspenseQuery(listItemsEditQueryOptions(list.id))
	return tab === 'bulk' ? (
		<BulkActionsTab list={list} items={items} />
	) : (
		<ReorderPanel listId={list.id} items={items} groups={list.groups} />
	)
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
				active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
			}`}
		>
			{children}
		</button>
	)
}

function BulkActionsTab({ list, items }: { list: ListForEditing; items: Array<ItemForEditing> }) {
	const router = useRouter()
	const deleteItemsMut = useDeleteItems()
	const deleteGroupsMut = useDeleteGroups()
	const setPriorityMut = useSetItemsPriority()
	const assignGroupMut = useAssignItemsToGroup()
	const [selected, setSelected] = useState<Set<number>>(new Set())
	const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set())
	const [busy, setBusy] = useState(false)
	const [moveOpen, setMoveOpen] = useState(false)
	const [deleteOpen, setDeleteOpen] = useState(false)

	const visibleItems = items
	const visibleIds = useMemo(() => visibleItems.map(i => i.id), [visibleItems])
	const ungroupedIds = useMemo(() => visibleItems.filter(i => i.groupId === null).map(i => i.id), [visibleItems])
	const totalSelectable = ungroupedIds.length + list.groups.length
	const totalSelected = ungroupedIds.filter(id => selected.has(id)).length + list.groups.filter(g => selectedGroups.has(g.id)).length
	const selectAllState: boolean | 'indeterminate' =
		totalSelectable === 0 ? false : totalSelected === 0 ? false : totalSelected === totalSelectable ? true : 'indeterminate'
	const selectedIds = useMemo(() => [...selected], [selected])
	const selectedGroupIds = useMemo(() => [...selectedGroups], [selectedGroups])
	const selectedList = useMemo(() => items.filter(i => selected.has(i.id)), [items, selected])

	const itemsByGroup = useMemo(() => {
		const byGroup = new Map<number, Array<number>>()
		for (const i of items) {
			if (i.groupId == null) continue
			if (!byGroup.has(i.groupId)) byGroup.set(i.groupId, [])
			byGroup.get(i.groupId)!.push(i.id)
		}
		return byGroup
	}, [items])

	const toggle = (id: number) =>
		setSelected(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})

	const toggleGroup = (groupId: number) => {
		const childIds = itemsByGroup.get(groupId) ?? []
		setSelectedGroups(prev => {
			const next = new Set(prev)
			if (next.has(groupId)) next.delete(groupId)
			else next.add(groupId)
			return next
		})
		setSelected(prev => {
			const next = new Set(prev)
			const groupIsSelected = selectedGroups.has(groupId)
			if (groupIsSelected) {
				for (const id of childIds) next.delete(id)
			} else {
				for (const id of childIds) next.add(id)
			}
			return next
		})
	}

	const clearSelection = () => {
		setSelected(new Set())
		setSelectedGroups(new Set())
	}

	const runDelete = async () => {
		setBusy(true)
		const groupChildIds = new Set<number>()
		for (const gid of selectedGroupIds) for (const id of itemsByGroup.get(gid) ?? []) groupChildIds.add(id)
		const itemOnlyIds = selectedIds.filter(id => !groupChildIds.has(id))

		clearSelection()
		setDeleteOpen(false)

		let deletedItems = 0
		let deletedGroups = 0
		if (selectedGroupIds.length > 0) {
			const rg = await deleteGroupsMut.mutateAsync({ listId: list.id, groupIds: selectedGroupIds })
			if (rg.kind === 'ok') {
				deletedGroups = rg.deletedGroups
				deletedItems += rg.deletedItems
			} else {
				setBusy(false)
				toast.error(m.lists_organize_delete_groups_failed())
				return
			}
		}
		if (itemOnlyIds.length > 0) {
			const ri = await deleteItemsMut.mutateAsync({ listId: list.id, itemIds: itemOnlyIds })
			if (ri.kind === 'ok') deletedItems += ri.deleted
			else {
				setBusy(false)
				toast.error(m.lists_organize_delete_items_failed())
				return
			}
		}
		setBusy(false)
		if (deletedGroups && deletedItems) {
			toast.success(m.lists_organize_deleted_both({ groupCount: deletedGroups, itemCount: deletedItems }))
		} else if (deletedGroups) {
			toast.success(m.lists_organize_deleted_groups({ count: deletedGroups }))
		} else {
			toast.success(m.lists_organize_deleted_items({ count: deletedItems }))
		}
		// Group rows live in the route loader's list data; the items cache is
		// already patched optimistically, so just refresh the loader.
		if (deletedGroups > 0) await router.invalidate()
	}

	const runPriority = async (priority: Priority) => {
		if (selectedIds.length === 0 && selectedGroupIds.length === 0) return
		const itemIds = selectedIds
		const groupIds = selectedGroupIds
		clearSelection()
		setBusy(true)
		let updated = 0
		if (itemIds.length > 0) {
			const r = await setPriorityMut.mutateAsync({ listId: list.id, itemIds, priority })
			if (r.kind === 'ok') updated += r.updated
			else {
				setBusy(false)
				toast.error(m.lists_organize_priority_failed())
				return
			}
		}
		if (groupIds.length > 0) {
			const r = await setGroupsPriority({ data: { groupIds, priority } })
			if (r.kind === 'ok') {
				updated += r.updated
				// Group priority lives on the route loader's group rows; refresh.
				await router.invalidate()
			} else {
				setBusy(false)
				toast.error(m.lists_organize_group_priority_failed())
				return
			}
		}
		setBusy(false)
		toast.success(m.lists_organize_priority_set({ priority: priorityLabel(priority), count: updated }))
	}

	const runAssignGroup = async (groupId: number | null) => {
		if (selectedIds.length === 0) return
		const itemIds = selectedIds
		clearSelection()
		setBusy(true)
		const r = await assignGroupMut.mutateAsync({ listId: list.id, itemIds, groupId })
		setBusy(false)
		if (r.kind === 'ok') {
			toast.success(groupId === null ? m.lists_organize_removed_from_group() : m.lists_organize_assigned_to_group())
		} else {
			toast.error(r.reason === 'mixed-lists' ? m.lists_organize_error_mixed_lists() : m.lists_organize_assign_failed())
		}
	}

	return (
		<>
			{/* z-20: rows below are `relative z-10`, and the later ones in the DOM
			    would otherwise paint over the bar once it sticks. It sticks just
			    under the app header (3rem plus the PWA status-bar inset), which is
			    sticky too and holds the sidebar toggle. */}
			<div className="flex flex-col gap-2 p-2 border rounded-md sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 bg-background/95 backdrop-blur sm:flex-row sm:items-center sm:flex-wrap">
				<label className="flex items-center gap-2 min-w-0 cursor-pointer select-none">
					<Checkbox
						checked={selectAllState}
						onCheckedChange={() => {
							if (selectAllState === true) {
								setSelected(new Set())
								setSelectedGroups(new Set())
							} else {
								setSelected(new Set(visibleIds))
								setSelectedGroups(new Set(list.groups.map(g => g.id)))
							}
						}}
						disabled={visibleIds.length === 0}
						aria-label={m.lists_organize_select_all()}
					/>
					<span className="text-sm text-muted-foreground tabular-nums truncate">
						{selectedGroups.size > 0
							? m.lists_organize_selection_items_groups({ itemCount: selected.size, groupCount: selectedGroups.size })
							: m.lists_organize_selection_items({ count: selected.size })}
					</span>
				</label>

				<div className="sm:flex-1" />

				<div className="flex items-center gap-1 flex-wrap">
					<Button
						size="sm"
						variant="outline"
						disabled={selected.size === 0 || busy}
						onClick={() => setMoveOpen(true)}
						title={m.lists_organize_move()}
					>
						<Move className="size-4" />
						<span className="hidden md:inline">{m.lists_organize_move()}</span>
					</Button>

					{list.groups.length > 0 && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button size="sm" variant="outline" disabled={selected.size === 0 || busy}>
									{m.lists_organize_group_button()}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuLabel>{m.lists_organize_assign_label()}</DropdownMenuLabel>
								{list.groups.map(g => (
									<DropdownMenuItem key={g.id} onClick={() => runAssignGroup(g.id)}>
										<GroupBadge type={g.type} className="text-xs" />
										{g.name ?? m.lists_organize_group_fallback_name({ id: g.id })}
									</DropdownMenuItem>
								))}
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={() => runAssignGroup(null)}>{m.lists_organize_remove_from_group()}</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button size="sm" variant="outline" disabled={(selected.size === 0 && selectedGroups.size === 0) || busy}>
								{m.lists_organize_priority_button()}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>{m.lists_organize_set_priority_label()}</DropdownMenuLabel>
							{[...priorityEnumValues].reverse().map(p => (
								<DropdownMenuItem key={p} onClick={() => runPriority(p)}>
									<PriorityIcon priority={p} className="size-4" />
									{priorityLabel(p)}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>

					<div className="w-px h-5 bg-border mx-1" aria-hidden />

					<Button
						size="sm"
						variant="destructive"
						disabled={(selected.size === 0 && selectedGroups.size === 0) || busy}
						onClick={() => setDeleteOpen(true)}
						title={m.action_delete()}
					>
						<Trash2 className="size-4" />
						<span className="hidden md:inline">{m.action_delete()}</span>
					</Button>
				</div>
			</div>

			{visibleItems.length === 0 ? (
				<div className="text-sm text-muted-foreground py-6 text-center border rounded-lg bg-accent">{m.lists_organize_empty()}</div>
			) : (
				<OrganizeList
					list={list}
					items={items}
					selected={selected}
					selectedGroups={selectedGroups}
					onToggle={toggle}
					onToggleGroup={toggleGroup}
				/>
			)}

			{moveOpen && (
				<BulkMoveItemsDialog
					open={moveOpen}
					onOpenChange={setMoveOpen}
					itemIds={selectedIds}
					sourceListId={list.id}
					onMoved={clearSelection}
				/>
			)}

			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{selectedGroups.size > 0
								? m.lists_organize_delete_title_items_groups({ itemCount: selectedList.length, groupCount: selectedGroups.size })
								: m.lists_organize_delete_title_items({ count: selectedList.length })}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{selectedGroups.size > 0 ? m.lists_organize_delete_description_with_groups() : m.lists_organize_delete_description()}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{m.action_cancel()}</AlertDialogCancel>
						<AlertDialogAction onClick={runDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
							{m.action_delete()}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}

function OrganizeList({
	list,
	items,
	selected,
	selectedGroups,
	onToggle,
	onToggleGroup,
}: {
	list: ListForEditing
	items: Array<ItemForEditing>
	selected: Set<number>
	selectedGroups: Set<number>
	onToggle: (id: number) => void
	onToggleGroup: (groupId: number) => void
}) {
	const entries = useMemo(() => buildListEntries({ items, groups: list.groups }), [items, list.groups])

	return (
		<div className="flex flex-col gap-2 pl-6">
			{entries.map(entry =>
				entry.kind === 'item' ? (
					<OrganizeItemRow key={`item-${entry.item.id}`} item={entry.item} selected={selected.has(entry.item.id)} onToggle={onToggle} />
				) : entry.items.length === 0 ? null : (
					<OrganizeGroupBlock
						key={`group-${entry.group.id}`}
						group={entry.group}
						items={entry.items}
						selected={selectedGroups.has(entry.group.id)}
						onToggle={onToggleGroup}
					/>
				)
			)}
		</div>
	)
}

function PriorityTab({ priority }: { priority: Priority }) {
	if (priority === 'normal') return null
	return (
		<div
			className={cn(
				'absolute left-0 top-0 h-[calc(100%-0.25rem)] max-h-16 -translate-x-1/2 translate-y-0.5 w-12 rounded-md shadow-sm drop-shadow-[1px_1px_10px_rgb(0_0_0_/_0.2)] dark:drop-shadow-[1px_1px_10px_rgb(0_0_0_/_0.5)] flex items-center p-1 z-0',
				priorityTabBgClass[priority]
			)}
			aria-hidden
		>
			<PriorityIcon priority={priority} className="size-4" />
		</div>
	)
}

function OrganizeItemRow({ item, selected, onToggle }: { item: Item; selected: boolean; onToggle: (id: number) => void }) {
	return (
		<div className="relative">
			<PriorityTab priority={item.priority} />
			<label
				className={cn(
					'relative z-10 flex items-center gap-3 p-2 ps-4 ring-1 ring-inset ring-border rounded-lg bg-card shadow-sm hover:bg-accent cursor-pointer',
					priorityRingClass[item.priority]
				)}
			>
				<Checkbox checked={selected} onCheckedChange={() => onToggle(item.id)} />
				<div className="flex-1 min-w-0 flex items-center gap-2">
					<span className="font-medium leading-tight truncate">{item.title}</span>
					{item.isArchived && (
						<Badge variant="secondary" className="text-xs shrink-0">
							{m.lists_organize_archived_badge()}
						</Badge>
					)}
				</div>
				{item.imageUrl && (
					<div className="size-10 shrink-0 rounded bg-background/60 overflow-hidden flex items-center justify-center">
						<RemoteImage src={item.imageUrl} alt="" className="object-contain size-full" />
					</div>
				)}
			</label>
		</div>
	)
}

function OrganizeGroupBlock({
	group,
	items,
	selected,
	onToggle,
}: {
	group: GroupSummary
	items: Array<Item>
	selected: boolean
	onToggle: (groupId: number) => void
}) {
	return (
		<div className="relative">
			<PriorityTab priority={group.priority} />
			<div className="relative z-10 flex flex-col rounded-lg overflow-hidden bg-card shadow-sm px-px">
				<div
					aria-hidden
					className={cn(
						'pointer-events-none absolute inset-0 z-20 rounded-lg ring-1 ring-inset ring-border',
						priorityRingClass[group.priority]
					)}
				/>
				<label className="flex items-center gap-3 p-2 ps-4 bg-accent border-b cursor-pointer hover:bg-accent/80">
					<Checkbox checked={selected} onCheckedChange={() => onToggle(group.id)} />
					{group.name && <span className="font-medium text-sm truncate min-w-0">{group.name}</span>}
					<GroupBadge type={group.type} />
				</label>
				<ul className="divide-y">
					{items.map(item => (
						<li key={item.id} className="flex items-center gap-3 p-2 ps-4">
							<div className="flex-1 min-w-0 flex items-center gap-2">
								<span className="font-medium leading-tight truncate">{item.title}</span>
								{item.isArchived && (
									<Badge variant="secondary" className="text-xs shrink-0">
										{m.lists_organize_archived_badge()}
									</Badge>
								)}
							</div>
							{item.imageUrl && (
								<div className="size-10 shrink-0 rounded bg-background/60 overflow-hidden flex items-center justify-center">
									<RemoteImage src={item.imageUrl} alt="" className="object-contain size-full" />
								</div>
							)}
						</li>
					))}
				</ul>
			</div>
		</div>
	)
}
