import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router'
import { Archive, ArchiveRestore, ArrowLeft, CheckSquare, MoveRight, Square, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { assignItemsToGroup } from '@/api/groups'
import { archiveItems, deleteItems, setItemsPriority } from '@/api/items'
import { getListForEditing, type ListForEditing } from '@/api/lists'
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
import { priorityEnumValues, type Priority } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'

type FilterMode = 'active' | 'archived' | 'all'
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
		const result = await getListForEditing({ data: { listId: params.listId, includeArchived: true } })
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
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="icon" asChild>
						<Link to="/lists/$listId/edit" params={{ listId: String(list.id) }} aria-label="Back to edit">
							<ArrowLeft className="size-4" />
						</Link>
					</Button>
					<h1 className="truncate flex-1">Organize: {list.name}</h1>
				</div>

				<div className="flex border-b">
					<TabButton active={tab === 'bulk'} onClick={() => setTab('bulk')}>
						Bulk actions
					</TabButton>
					<TabButton active={tab === 'reorder'} onClick={() => setTab('reorder')}>
						Reorder
					</TabButton>
				</div>

				{tab === 'bulk' ? (
					<BulkActionsTab list={list} />
				) : (
					<ReorderPanel listId={list.id} items={list.items} groups={list.groups} />
				)}
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
	const [filter, setFilter] = useState<FilterMode>('active')
	const [busy, setBusy] = useState(false)
	const [moveOpen, setMoveOpen] = useState(false)
	const [deleteOpen, setDeleteOpen] = useState(false)

	const visibleItems = useMemo(() => {
		if (filter === 'active') return list.items.filter(i => !i.isArchived)
		if (filter === 'archived') return list.items.filter(i => i.isArchived)
		return list.items
	}, [list.items, filter])

	const visibleIds = useMemo(() => visibleItems.map(i => i.id), [visibleItems])
	const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id))
	const selectedIds = useMemo(() => [...selected], [selected])
	const selectedList = useMemo(() => list.items.filter(i => selected.has(i.id)), [list.items, selected])

	const toggle = (id: number) =>
		setSelected(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})

	const refresh = async () => {
		setSelected(new Set())
		await router.invalidate()
	}

	const runArchive = async (archived: boolean) => {
		if (selectedIds.length === 0) return
		setBusy(true)
		const r = await archiveItems({ data: { itemIds: selectedIds, archived } })
		setBusy(false)
		if (r.kind === 'ok') {
			toast.success(`${r.updated} item${r.updated === 1 ? '' : 's'} ${archived ? 'archived' : 'restored'}`)
			await refresh()
		} else {
			toast.error('Could not update items')
		}
	}

	const runDelete = async () => {
		setBusy(true)
		const r = await deleteItems({ data: { itemIds: selectedIds } })
		setBusy(false)
		setDeleteOpen(false)
		if (r.kind === 'ok') {
			toast.success(`${r.deleted} item${r.deleted === 1 ? '' : 's'} deleted`)
			await refresh()
		} else {
			toast.error('Could not delete items')
		}
	}

	const runPriority = async (priority: Priority) => {
		if (selectedIds.length === 0) return
		setBusy(true)
		const r = await setItemsPriority({ data: { itemIds: selectedIds, priority } })
		setBusy(false)
		if (r.kind === 'ok') {
			toast.success(`Priority set to ${PRIORITY_LABEL[priority]} on ${r.updated} item${r.updated === 1 ? '' : 's'}`)
			await refresh()
		} else {
			toast.error('Could not update priority')
		}
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
			<div className="flex items-center gap-1 text-sm">
				{(['active', 'archived', 'all'] as const).map(mode => (
					<Button key={mode} size="sm" variant={filter === mode ? 'default' : 'outline'} onClick={() => setFilter(mode)}>
						{mode === 'active' && 'Active'}
						{mode === 'archived' && 'Archived'}
						{mode === 'all' && 'All'}
						<Badge variant="secondary" className="ml-2 tabular-nums">
							{mode === 'active'
								? list.items.filter(i => !i.isArchived).length
								: mode === 'archived'
									? list.items.filter(i => i.isArchived).length
									: list.items.length}
						</Badge>
					</Button>
				))}
			</div>

			<div className="flex flex-wrap items-center gap-2 p-2 border rounded-md sticky top-2 z-10 bg-background/95 backdrop-blur">
				<Button
					size="sm"
					variant="outline"
					onClick={allVisibleSelected ? () => setSelected(new Set()) : () => setSelected(new Set(visibleIds))}
					disabled={visibleIds.length === 0}
				>
					{allVisibleSelected ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
					{allVisibleSelected ? 'Deselect all' : 'Select all'}
				</Button>
				<span className="text-sm text-muted-foreground">{selected.size} selected</span>
				<div className="flex-1" />

				<Button size="sm" variant="outline" disabled={selected.size === 0 || busy} onClick={() => setMoveOpen(true)}>
					<MoveRight className="size-4" /> Move
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
						<Button size="sm" variant="outline" disabled={selected.size === 0 || busy}>
							Priority
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>Set priority</DropdownMenuLabel>
						{priorityEnumValues.map(p => (
							<DropdownMenuItem key={p} onClick={() => runPriority(p)}>
								<PriorityIcon priority={p} className="size-4" />
								{PRIORITY_LABEL[p]}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>

				{filter === 'archived' ? (
					<Button size="sm" variant="outline" disabled={selected.size === 0 || busy} onClick={() => runArchive(false)}>
						<ArchiveRestore className="size-4" /> Restore
					</Button>
				) : (
					<Button size="sm" variant="outline" disabled={selected.size === 0 || busy} onClick={() => runArchive(true)}>
						<Archive className="size-4" /> Archive
					</Button>
				)}

				<Button size="sm" variant="destructive" disabled={selected.size === 0 || busy} onClick={() => setDeleteOpen(true)}>
					<Trash2 className="size-4" /> Delete
				</Button>
			</div>

			{visibleItems.length === 0 ? (
				<div className="text-sm text-muted-foreground py-6 text-center border rounded-lg bg-accent">No items to show.</div>
			) : (
				<OrganizeList items={visibleItems} groups={list.groups} selected={selected} onToggle={toggle} />
			)}

			{moveOpen && (
				<BulkMoveItemsDialog
					open={moveOpen}
					onOpenChange={setMoveOpen}
					itemIds={selectedIds}
					sourceListId={list.id}
					onMoved={refresh}
				/>
			)}

			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete {selectedList.length} item{selectedList.length === 1 ? '' : 's'}?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently removes the selected items and any associated claims or comments.
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
	items,
	groups,
	selected,
	onToggle,
}: {
	items: Array<Item>
	groups: Array<{ id: number; type: 'or' | 'order'; name: string | null }>
	selected: Set<number>
	onToggle: (id: number) => void
}) {
	const ungrouped = items.filter(i => i.groupId === null)
	const byGroup = new Map<number, Array<Item>>()
	for (const i of items) {
		if (i.groupId != null) {
			if (!byGroup.has(i.groupId)) byGroup.set(i.groupId, [])
			byGroup.get(i.groupId)!.push(i)
		}
	}

	return (
		<div className="flex flex-col gap-3">
			{ungrouped.length > 0 && (
				<div className="flex flex-col overflow-hidden border divide-y rounded-lg bg-accent">
					{ungrouped.map(item => (
						<OrganizeRow key={item.id} item={item} selected={selected.has(item.id)} onToggle={onToggle} />
					))}
				</div>
			)}
			{groups.map(g => {
				const groupItems = byGroup.get(g.id)
				if (!groupItems || groupItems.length === 0) return null
				return (
					<div key={g.id} className="border rounded-lg bg-accent overflow-hidden">
						<div className="flex items-center gap-2 p-2 bg-muted/30 border-b">
							<GroupBadge type={g.type} />
							{g.name && <span className="font-medium text-sm truncate">{g.name}</span>}
							<span className="text-xs text-muted-foreground ml-auto">
								{groupItems.length} item{groupItems.length !== 1 ? 's' : ''}
							</span>
						</div>
						<div className="divide-y">
							{groupItems.map(item => (
								<OrganizeRow key={item.id} item={item} selected={selected.has(item.id)} onToggle={onToggle} />
							))}
						</div>
					</div>
				)
			})}
		</div>
	)
}

function OrganizeRow({
	item,
	selected,
	onToggle,
}: {
	item: Item
	selected: boolean
	onToggle: (id: number) => void
}) {
	return (
		<label className="flex items-center gap-3 p-2 hover:bg-muted/50 cursor-pointer">
			<Checkbox checked={selected} onCheckedChange={() => onToggle(item.id)} />
			<div className="size-10 shrink-0 rounded bg-muted/40 overflow-hidden flex items-center justify-center">
				{item.imageUrl ? (
					<img src={item.imageUrl} alt="" className="object-contain size-full" />
				) : (
					<span className="text-xs text-muted-foreground">—</span>
				)}
			</div>
			<div className="flex-1 min-w-0 flex items-center gap-2">
				<span className="font-medium leading-tight truncate">{item.title}</span>
				{item.isArchived && (
					<Badge variant="secondary" className="text-xs shrink-0">
						Archived
					</Badge>
				)}
			</div>
			<PriorityIcon priority={item.priority} className="size-4 shrink-0" />
			{item.quantity > 1 && (
				<Badge variant="secondary" className="text-xs tabular-nums shrink-0">
					x{item.quantity}
				</Badge>
			)}
		</label>
	)
}
