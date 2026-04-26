import { createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { Move, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { assignItemsToGroup } from '@/api/groups'
import { deleteGroups, deleteItems, setGroupsPriority, setItemsPriority } from '@/api/items'
import { getListForEditing, type GroupSummary, type ListForEditing } from '@/api/lists'
import PriorityIcon from '@/components/common/priority-icon'
import { BulkMoveItemsDialog } from '@/components/items/bulk-move-dialog'
import { GroupBadge } from '@/components/items/group-badge'
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
import { buildListEntries } from '@/lib/list-entries'
import { priorityRingClass, priorityTabBgClass } from '@/lib/priority-classes'
import { cn } from '@/lib/utils'

type TabMode = 'bulk' | 'reorder'

const PRIORITY_LABEL: Record<Priority, string> = {
	'very-high': 'Very high',
	high: 'High',
	normal: 'Normal',
	low: 'Low',
}

export const Route = createFileRoute('/(core)/lists_/$listId/organize')({
	loader: async ({ params }) => {
		const listId = Number(params.listId)
		if (!Number.isFinite(listId)) throw notFound()
		const result = await getListForEditing({ data: { listId: params.listId } })
		if (result.kind === 'error') throw notFound()
		return { list: result.list }
	},
	component: OrganizePage,
})

function OrganizePage() {
	const { list } = Route.useLoaderData()
	const [tab, setTab] = useState<TabMode>('bulk')

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-4">
				<h1 className="leading-[1.1] pb-1 break-words">{list.name}</h1>

				<div className="flex border-b">
					<TabButton active={tab === 'bulk'} onClick={() => setTab('bulk')}>
						Bulk Actions
					</TabButton>
					<TabButton active={tab === 'reorder'} onClick={() => setTab('reorder')}>
						Reorder
					</TabButton>
				</div>

				{tab === 'bulk' ? <BulkActionsTab list={list} /> : <ReorderPanel listId={list.id} items={list.items} groups={list.groups} />}
			</div>
		</div>
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

function BulkActionsTab({ list }: { list: ListForEditing }) {
	const router = useRouter()
	const [selected, setSelected] = useState<Set<number>>(new Set())
	const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set())
	const [busy, setBusy] = useState(false)
	const [moveOpen, setMoveOpen] = useState(false)
	const [deleteOpen, setDeleteOpen] = useState(false)

	const visibleItems = list.items
	const visibleIds = useMemo(() => visibleItems.map(i => i.id), [visibleItems])
	const ungroupedIds = useMemo(() => visibleItems.filter(i => i.groupId === null).map(i => i.id), [visibleItems])
	const totalSelectable = ungroupedIds.length + list.groups.length
	const totalSelected = ungroupedIds.filter(id => selected.has(id)).length + list.groups.filter(g => selectedGroups.has(g.id)).length
	const selectAllState: boolean | 'indeterminate' =
		totalSelectable === 0 ? false : totalSelected === 0 ? false : totalSelected === totalSelectable ? true : 'indeterminate'
	const selectedIds = useMemo(() => [...selected], [selected])
	const selectedGroupIds = useMemo(() => [...selectedGroups], [selectedGroups])
	const selectedList = useMemo(() => list.items.filter(i => selected.has(i.id)), [list.items, selected])

	const itemsByGroup = useMemo(() => {
		const m = new Map<number, Array<number>>()
		for (const i of list.items) {
			if (i.groupId == null) continue
			if (!m.has(i.groupId)) m.set(i.groupId, [])
			m.get(i.groupId)!.push(i.id)
		}
		return m
	}, [list.items])

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

	const refresh = async () => {
		setSelected(new Set())
		setSelectedGroups(new Set())
		await router.invalidate()
	}

	const runDelete = async () => {
		setBusy(true)
		const groupChildIds = new Set<number>()
		for (const gid of selectedGroupIds) for (const id of itemsByGroup.get(gid) ?? []) groupChildIds.add(id)
		const itemOnlyIds = selectedIds.filter(id => !groupChildIds.has(id))

		let deletedItems = 0
		let deletedGroups = 0
		if (selectedGroupIds.length > 0) {
			const rg = await deleteGroups({ data: { groupIds: selectedGroupIds } })
			if (rg.kind === 'ok') {
				deletedGroups = rg.deletedGroups
				deletedItems += rg.deletedItems
			} else {
				setBusy(false)
				setDeleteOpen(false)
				toast.error('Could not delete groups')
				return
			}
		}
		if (itemOnlyIds.length > 0) {
			const ri = await deleteItems({ data: { itemIds: itemOnlyIds } })
			if (ri.kind === 'ok') deletedItems += ri.deleted
			else {
				setBusy(false)
				setDeleteOpen(false)
				toast.error('Could not delete items')
				return
			}
		}
		setBusy(false)
		setDeleteOpen(false)
		const parts: Array<string> = []
		if (deletedGroups) parts.push(`${deletedGroups} group${deletedGroups === 1 ? '' : 's'}`)
		if (deletedItems) parts.push(`${deletedItems} item${deletedItems === 1 ? '' : 's'}`)
		toast.success(`Deleted ${parts.join(' and ')}`)
		await refresh()
	}

	const runPriority = async (priority: Priority) => {
		if (selectedIds.length === 0 && selectedGroupIds.length === 0) return
		setBusy(true)
		let updated = 0
		if (selectedIds.length > 0) {
			const r = await setItemsPriority({ data: { itemIds: selectedIds, priority } })
			if (r.kind === 'ok') updated += r.updated
			else {
				setBusy(false)
				toast.error('Could not update priority')
				return
			}
		}
		if (selectedGroupIds.length > 0) {
			const r = await setGroupsPriority({ data: { groupIds: selectedGroupIds, priority } })
			if (r.kind === 'ok') updated += r.updated
			else {
				setBusy(false)
				toast.error('Could not update group priority')
				return
			}
		}
		setBusy(false)
		toast.success(`Priority set to ${PRIORITY_LABEL[priority]} on ${updated} row${updated === 1 ? '' : 's'}`)
		await refresh()
	}

	const runAssignGroup = async (groupId: number | null) => {
		if (selectedIds.length === 0) return
		setBusy(true)
		const r = await assignItemsToGroup({ data: { itemIds: selectedIds, groupId } })
		setBusy(false)
		if (r.kind === 'ok') {
			toast.success(groupId === null ? 'Removed from group' : 'Items assigned to group')
			await refresh()
		} else {
			toast.error(r.reason === 'mixed-lists' ? 'All items must be on the same list' : 'Could not assign group')
		}
	}

	return (
		<>
			<div className="flex flex-col gap-2 p-2 border rounded-md sticky top-2 z-10 bg-background/95 backdrop-blur sm:flex-row sm:items-center sm:flex-wrap">
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
						aria-label="Select all"
					/>
					<span className="text-sm text-muted-foreground tabular-nums truncate">
						{selected.size} item{selected.size === 1 ? '' : 's'}
						{selectedGroups.size > 0 && `, ${selectedGroups.size} group${selectedGroups.size === 1 ? '' : 's'}`}
					</span>
				</label>

				<div className="sm:flex-1" />

				<div className="flex items-center gap-1 flex-wrap">
					<Button size="sm" variant="outline" disabled={selected.size === 0 || busy} onClick={() => setMoveOpen(true)} title="Move">
						<Move className="size-4" />
						<span className="hidden md:inline">Move</span>
					</Button>

					{list.groups.length > 0 && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button size="sm" variant="outline" disabled={selected.size === 0 || busy}>
									Group
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuLabel>Assign to group</DropdownMenuLabel>
								{list.groups.map(g => (
									<DropdownMenuItem key={g.id} onClick={() => runAssignGroup(g.id)}>
										<GroupBadge type={g.type} className="text-xs" />
										{g.name ?? `Group #${g.id}`}
									</DropdownMenuItem>
								))}
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={() => runAssignGroup(null)}>Remove from group</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button size="sm" variant="outline" disabled={(selected.size === 0 && selectedGroups.size === 0) || busy}>
								Priority
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>Set priority</DropdownMenuLabel>
							{[...priorityEnumValues].reverse().map(p => (
								<DropdownMenuItem key={p} onClick={() => runPriority(p)}>
									<PriorityIcon priority={p} className="size-4" />
									{PRIORITY_LABEL[p]}
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
						title="Delete"
					>
						<Trash2 className="size-4" />
						<span className="hidden md:inline">Delete</span>
					</Button>
				</div>
			</div>

			{visibleItems.length === 0 ? (
				<div className="text-sm text-muted-foreground py-6 text-center border rounded-lg bg-accent">No items to show.</div>
			) : (
				<OrganizeList list={list} selected={selected} selectedGroups={selectedGroups} onToggle={toggle} onToggleGroup={toggleGroup} />
			)}

			{moveOpen && (
				<BulkMoveItemsDialog open={moveOpen} onOpenChange={setMoveOpen} itemIds={selectedIds} sourceListId={list.id} onMoved={refresh} />
			)}

			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Delete {selectedList.length} item{selectedList.length === 1 ? '' : 's'}
							{selectedGroups.size > 0 && ` and ${selectedGroups.size} group${selectedGroups.size === 1 ? '' : 's'}`}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently removes the selected rows and any associated claims or comments.
							{selectedGroups.size > 0 && ' Items inside deleted groups are also removed.'}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={runDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}

function OrganizeList({
	list,
	selected,
	selectedGroups,
	onToggle,
	onToggleGroup,
}: {
	list: ListForEditing
	selected: Set<number>
	selectedGroups: Set<number>
	onToggle: (id: number) => void
	onToggleGroup: (groupId: number) => void
}) {
	const entries = useMemo(() => buildListEntries(list), [list])

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
				'absolute left-0 top-0 h-[calc(100%-4px)] -translate-x-1/2 translate-y-[2px] w-12 rounded-md shadow-sm drop-shadow-[1px_1px_10px_rgb(0_0_0_/_0.2)] dark:drop-shadow-[1px_1px_10px_rgb(0_0_0_/_0.5)] flex items-center p-1 z-0',
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
					'relative z-10 flex items-center gap-3 p-2 ps-4 ring-1 ring-inset ring-border rounded-lg bg-muted/40 shadow-sm hover:bg-muted/60 cursor-pointer',
					priorityRingClass[item.priority]
				)}
			>
				<Checkbox checked={selected} onCheckedChange={() => onToggle(item.id)} />
				<div className="flex-1 min-w-0 flex items-center gap-2">
					<span className="font-medium leading-tight truncate">{item.title}</span>
					{item.isArchived && (
						<Badge variant="secondary" className="text-xs shrink-0">
							Archived
						</Badge>
					)}
				</div>
				{item.imageUrl && (
					<div className="size-10 shrink-0 rounded bg-background/60 overflow-hidden flex items-center justify-center">
						<img src={item.imageUrl} alt="" className="object-contain size-full" />
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
										Archived
									</Badge>
								)}
							</div>
							{item.imageUrl && (
								<div className="size-10 shrink-0 rounded bg-background/60 overflow-hidden flex items-center justify-center">
									<img src={item.imageUrl} alt="" className="object-contain size-full" />
								</div>
							)}
						</li>
					))}
				</ul>
			</div>
		</div>
	)
}
