import {
	closestCorners,
	defaultDropAnimationSideEffects,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRouter } from '@tanstack/react-router'
import { GripVertical, ListOrdered, Shuffle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'

import { reorderListEntries } from '@/api/items'
import type { GroupSummary } from '@/api/lists'
import PriorityIcon from '@/components/common/priority-icon'
import type { Priority } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'
import { priorityBorderClass } from '@/lib/priority-classes'

type Props = {
	listId: number
	items: Array<Item>
	groups: Array<GroupSummary>
}

type EntryId = string

type Entry =
	| { kind: 'item'; id: EntryId; itemId: number; item: Item }
	| { kind: 'group'; id: EntryId; groupId: number; group: GroupSummary; children: Array<Item> }

type Bucket = Record<Priority, Array<EntryId>>

const PRIORITY_ORDER: Array<Priority> = ['very-high', 'high', 'normal', 'low']
const PRIORITY_LABEL: Record<Priority, string> = {
	'very-high': 'Very high',
	high: 'High',
	normal: 'Normal',
	low: 'Low',
}

const itemKey = (id: number) => `item-${id}`
const groupKey = (id: number) => `group-${id}`

export function ReorderPanel({ listId, items, groups }: Props) {
	const router = useRouter()

	const entries = useMemo<Map<EntryId, Entry>>(() => {
		const m = new Map<EntryId, Entry>()
		for (const item of items) {
			if (item.isArchived || item.groupId !== null) continue
			const id = itemKey(item.id)
			m.set(id, { kind: 'item', id, itemId: item.id, item })
		}
		const childrenByGroup = new Map<number, Array<Item>>()
		for (const item of items) {
			if (item.isArchived || item.groupId === null) continue
			if (!childrenByGroup.has(item.groupId)) childrenByGroup.set(item.groupId, [])
			childrenByGroup.get(item.groupId)!.push(item)
		}
		for (const list of childrenByGroup.values()) {
			list.sort((a, b) => {
				const ao = a.groupSortOrder ?? Number.MAX_SAFE_INTEGER
				const bo = b.groupSortOrder ?? Number.MAX_SAFE_INTEGER
				if (ao !== bo) return ao - bo
				return a.id - b.id
			})
		}
		for (const g of groups) {
			const id = groupKey(g.id)
			m.set(id, { kind: 'group', id, groupId: g.id, group: g, children: childrenByGroup.get(g.id) ?? [] })
		}
		return m
	}, [items, groups])

	const initialBuckets = useMemo<Bucket>(() => {
		const b: Bucket = { 'very-high': [], high: [], normal: [], low: [] }
		const list = [...entries.values()]
		list.sort((a, c) => {
			const ao = sortKey(a)
			const co = sortKey(c)
			if (ao !== co) return ao - co
			return refId(a) - refId(c)
		})
		for (const e of list) {
			const p = entryPriority(e)
			b[p].push(e.id)
		}
		return b
	}, [entries])

	const [buckets, setBuckets] = useState<Bucket>(initialBuckets)

	useEffect(() => {
		setBuckets(initialBuckets)
	}, [initialBuckets])

	const [activeId, setActiveId] = useState<EntryId | null>(null)
	const [saving, setSaving] = useState(false)

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	)

	const findContainer = useCallback((b: Bucket, id: EntryId | string): Priority | null => {
		if (PRIORITY_ORDER.includes(id as Priority)) return id as Priority
		for (const p of PRIORITY_ORDER) if (b[p].includes(id as EntryId)) return p
		return null
	}, [])

	const handleDragStart = (e: DragStartEvent) => {
		setActiveId(String(e.active.id))
	}

	const handleDragOver = (e: DragOverEvent) => {
		const { active, over } = e
		if (!over) return
		const activeKey = String(active.id)
		const overKey = String(over.id)
		if (activeKey === overKey) return

		setBuckets(prev => {
			const fromContainer = findContainer(prev, activeKey)
			const toContainer = findContainer(prev, overKey)
			if (!fromContainer || !toContainer) return prev
			if (fromContainer === toContainer) return prev

			const fromList = prev[fromContainer].filter(id => id !== activeKey)
			const toList = [...prev[toContainer]]

			const overIndex = toList.indexOf(overKey)
			const insertAt = overIndex >= 0 ? overIndex : toList.length
			toList.splice(insertAt, 0, activeKey)

			return { ...prev, [fromContainer]: fromList, [toContainer]: toList }
		})
	}

	const handleDragEnd = async (e: DragEndEvent) => {
		const { active, over } = e
		setActiveId(null)
		if (!over) {
			await persist(buckets)
			return
		}

		const activeKey = String(active.id)
		const overKey = String(over.id)

		const container = findContainer(buckets, activeKey)
		if (!container) return
		const overContainer = findContainer(buckets, overKey)

		let next = buckets
		if (overContainer === container && activeKey !== overKey) {
			const list = buckets[container]
			const oldIndex = list.indexOf(activeKey)
			const newIndex = overKey === container ? list.length - 1 : list.indexOf(overKey)
			if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
				next = { ...buckets, [container]: arrayMove(list, oldIndex, newIndex) }
				setBuckets(next)
			}
		}

		await persist(next)
	}

	const persist = async (b: Bucket) => {
		const itemUpdates: Array<{ itemId: number; priority: Priority; sortOrder: number }> = []
		const groupUpdates: Array<{ groupId: number; priority: Priority; sortOrder: number }> = []
		for (const p of PRIORITY_ORDER) {
			b[p].forEach((id, idx) => {
				const entry = entries.get(id)
				if (!entry) return
				if (entry.kind === 'item') itemUpdates.push({ itemId: entry.itemId, priority: p, sortOrder: idx })
				else groupUpdates.push({ groupId: entry.groupId, priority: p, sortOrder: idx })
			})
		}
		if (itemUpdates.length === 0 && groupUpdates.length === 0) return

		setSaving(true)
		const r = await reorderListEntries({ data: { listId, items: itemUpdates, groups: groupUpdates } })
		setSaving(false)
		if (r.kind === 'ok') {
			await router.invalidate()
		} else {
			toast.error('Could not save order')
		}
	}

	const activeEntry = activeId ? entries.get(activeId) ?? null : null

	return (
		<div className="flex flex-col gap-3">
			<p className="text-sm text-muted-foreground">
				Drag rows between buckets to change priority. Drag within a bucket to change order. Changes save automatically.
				{saving && <span className="ml-2 opacity-70">Saving…</span>}
			</p>
			<DndContext
				sensors={sensors}
				collisionDetection={closestCorners}
				onDragStart={handleDragStart}
				onDragOver={handleDragOver}
				onDragEnd={handleDragEnd}
				onDragCancel={() => setActiveId(null)}
			>
				<div className="flex flex-col gap-2">
					{PRIORITY_ORDER.map(p => (
						<BucketRow key={p} priority={p} ids={buckets[p]} entries={entries} />
					))}
				</div>
				{typeof document !== 'undefined' &&
					createPortal(
						<DragOverlay
							dropAnimation={{
								sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
							}}
						>
							{activeEntry ? <EntryRow entry={activeEntry} dragging /> : null}
						</DragOverlay>,
						document.body,
					)}
			</DndContext>
		</div>
	)
}

function entryPriority(e: Entry): Priority {
	return e.kind === 'item' ? e.item.priority : e.group.priority
}

function sortKey(e: Entry): number {
	const v = e.kind === 'item' ? e.item.sortOrder : e.group.sortOrder
	return v ?? Number.MAX_SAFE_INTEGER
}

function refId(e: Entry): number {
	return e.kind === 'item' ? e.itemId : e.groupId
}

function BucketRow({ priority, ids, entries }: { priority: Priority; ids: Array<EntryId>; entries: Map<EntryId, Entry> }) {
	const { setNodeRef, isOver } = useDroppable({ id: priority })
	const baseBorder = priorityBorderClass[priority] || 'border-border'
	return (
		<div ref={setNodeRef} className={`border rounded-md ${baseBorder} ${isOver ? 'ring-1 ring-primary/60' : ''}`}>
			<div className={`flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 ${baseBorder}`}>
				<PriorityIcon priority={priority} className="size-4 shrink-0" />
				<span className="text-sm font-medium flex-1">{PRIORITY_LABEL[priority]}</span>
			</div>
			<SortableContext items={ids} strategy={verticalListSortingStrategy}>
				<div className="flex flex-col py-1 px-1 min-h-12 gap-1">
					{ids.length === 0 ? (
						<div className="text-xs text-muted-foreground text-center py-3">Drop rows here</div>
					) : (
						ids.map(id => {
							const entry = entries.get(id)
							if (!entry) return null
							return <SortableRow key={id} entry={entry} />
						})
					)}
				</div>
			</SortableContext>
		</div>
	)
}

function SortableRow({ entry }: { entry: Entry }) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id })
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.4 : 1,
	}
	return (
		<div ref={setNodeRef} style={style} {...attributes} {...listeners}>
			<EntryRow entry={entry} />
		</div>
	)
}

function EntryRow({ entry, dragging = false }: { entry: Entry; dragging?: boolean }) {
	if (entry.kind === 'group') {
		const { group, children } = entry
		const Icon = group.type === 'or' ? Shuffle : ListOrdered
		return (
			<div
				className={`flex flex-col gap-1 px-2 py-2.5 bg-muted/40 hover:bg-muted/60 rounded border border-dashed cursor-grab active:cursor-grabbing touch-none ${
					dragging ? 'shadow-lg' : ''
				}`}
			>
				<div className="flex items-center gap-2">
					<GripVertical className="size-4 text-muted-foreground shrink-0" />
					<Icon className="size-4 text-muted-foreground shrink-0" />
					<span className="text-sm font-medium leading-tight truncate flex-1">
						{group.name ?? (group.type === 'or' ? 'Pick one' : 'In order')}
					</span>
				</div>
				<ul className="pl-8 text-xs text-muted-foreground space-y-0.5">
					{children.length === 0 ? (
						<li className="flex gap-1.5 italic">
							<span aria-hidden="true" className="select-none">•</span>
							<span>No items</span>
						</li>
					) : (
						children.map(c => (
							<li key={c.id} className="flex gap-1.5 truncate">
								<span aria-hidden="true" className="select-none">•</span>
								<span className="truncate">{c.title}</span>
							</li>
						))
					)}
				</ul>
			</div>
		)
	}
	const { item } = entry
	return (
		<div
			className={`flex items-center gap-2 px-2 py-2.5 bg-muted/40 hover:bg-muted/60 rounded border cursor-grab active:cursor-grabbing touch-none ${
				dragging ? 'shadow-lg' : ''
			}`}
		>
			<GripVertical className="size-4 text-muted-foreground shrink-0" />
			<span className="text-sm font-medium leading-tight truncate flex-1">{item.title}</span>
			{item.imageUrl && (
				<div className="size-7 shrink-0 rounded bg-background/60 overflow-hidden flex items-center justify-center">
					<img src={item.imageUrl} alt="" className="object-contain size-full" />
				</div>
			)}
		</div>
	)
}
