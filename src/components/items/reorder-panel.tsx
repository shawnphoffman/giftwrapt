import {
	closestCorners,
	defaultDropAnimationSideEffects,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	MouseSensor,
	TouchSensor,
	useDroppable,
	useSensor,
	useSensors,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Check, GripVertical, Layers, ListOrdered, Shuffle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'

import { reorderListEntries } from '@/api/items'
import type { GroupSummary } from '@/api/lists'
import PriorityIcon from '@/components/common/priority-icon'
import { SegmentedToggle } from '@/components/common/segmented-toggle'
import type { Priority } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'
import { httpsUpgrade } from '@/lib/image-url'
import { priorityRingClass } from '@/lib/priority-classes'
import { itemsKeys } from '@/lib/queries/items'
import { cn } from '@/lib/utils'

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
	const queryClient = useQueryClient()

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
	const [draggingIds, setDraggingIds] = useState<Set<EntryId>>(new Set())
	// Order in which the selection collapses at the drop point. Captured at
	// drag start (priority bucket order, then in-bucket order) so it isn't
	// disturbed by handleDragOver moving the active row mid-drag.
	const [draggingOrder, setDraggingOrder] = useState<Array<EntryId>>([])
	// Debounce same-bucket arrayMove so the active doesn't oscillate between
	// adjacent rows on every dragOver tick. Resets when the cursor moves to a
	// different over.
	const lastOverKeyRef = useRef<string | null>(null)
	const [saving, setSaving] = useState(false)
	const [multiSelect, setMultiSelect] = useState(false)
	const [selectedIds, setSelectedIds] = useState<Set<EntryId>>(new Set())

	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
		useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	)

	const findContainer = useCallback((b: Bucket, id: EntryId | string): Priority | null => {
		if (PRIORITY_ORDER.includes(id as Priority)) return id as Priority
		for (const p of PRIORITY_ORDER) if (b[p].includes(id)) return p
		return null
	}, [])

	const handleToggleMultiSelect = (on: boolean) => {
		setMultiSelect(on)
		if (!on) setSelectedIds(new Set())
	}

	const handleToggleSelect = useCallback((id: EntryId) => {
		setSelectedIds(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}, [])

	const handleDragStart = (e: DragStartEvent) => {
		const id = String(e.active.id)
		setActiveId(id)
		const isMulti = multiSelect && selectedIds.has(id) && selectedIds.size > 1
		const set = isMulti ? new Set(selectedIds) : new Set([id])
		setDraggingIds(set)
		const ordered: Array<EntryId> = []
		for (const p of PRIORITY_ORDER) {
			for (const bid of buckets[p]) if (set.has(bid)) ordered.push(bid)
		}
		setDraggingOrder(ordered)
		lastOverKeyRef.current = null
	}

	const handleDragOver = (e: DragOverEvent) => {
		const { active, over } = e
		if (!over) return
		const activeKey = String(active.id)
		const overKey = String(over.id)
		if (activeKey === overKey) return

		const isMulti = draggingIds.size > 1

		setBuckets(prev => {
			const fromContainer = findContainer(prev, activeKey)
			const toContainer = findContainer(prev, overKey)
			if (!fromContainer || !toContainer) return prev

			if (fromContainer === toContainer) {
				// Single-drag: leave same-bucket reorder to dnd-kit's
				// SortableContext animation + arrayMove in dragEnd.
				// Multi-drag: move the active explicitly so the visible drop
				// point tracks the cursor; debounced via lastOverKeyRef so we
				// don't oscillate between adjacent rows on each tick.
				if (!isMulti) return prev
				if (lastOverKeyRef.current === overKey) return prev
				const list = prev[fromContainer]
				const oldIdx = list.indexOf(activeKey)
				const overIdx = list.indexOf(overKey)
				if (oldIdx < 0 || overIdx < 0 || oldIdx === overIdx) return prev
				lastOverKeyRef.current = overKey
				return { ...prev, [fromContainer]: arrayMove(list, oldIdx, overIdx) }
			}

			// Cross-bucket: move the active to over's index in the new bucket.
			const fromList = prev[fromContainer].filter(id => id !== activeKey)
			const toList = [...prev[toContainer]]
			const overIndex = toList.indexOf(overKey)
			const insertAt = overIndex >= 0 ? overIndex : toList.length
			toList.splice(insertAt, 0, activeKey)
			lastOverKeyRef.current = overKey
			return { ...prev, [fromContainer]: fromList, [toContainer]: toList }
		})
	}

	const handleDragEnd = async (e: DragEndEvent) => {
		const { active, over } = e
		setActiveId(null)
		const wasMulti = draggingIds.size > 1
		const draggedSet = new Set(draggingIds)
		const orderedDragging = draggingOrder
		setDraggingIds(new Set())
		setDraggingOrder([])

		if (!over) {
			await persist(buckets)
			return
		}

		const activeKey = String(active.id)
		const overKey = String(over.id)

		if (wasMulti) {
			// handleDragOver placed the active row at the cursor's drop point,
			// so anchor on it. Then drop the rest of the selection in around
			// active (in original priority/sortOrder order).
			const targetBucket = findContainer(buckets, activeKey)
			if (!targetBucket) {
				await persist(buckets)
				return
			}
			const dropAnchor = buckets[targetBucket].indexOf(activeKey)
			let removedBefore = 0
			for (let i = 0; i < dropAnchor; i++) {
				if (draggedSet.has(buckets[targetBucket][i])) removedBefore++
			}
			const insertAt = Math.max(0, dropAnchor - removedBefore)

			const next: Bucket = { 'very-high': [], high: [], normal: [], low: [] }
			for (const p of PRIORITY_ORDER) next[p] = buckets[p].filter(id => !draggedSet.has(id))
			next[targetBucket].splice(insertAt, 0, ...orderedDragging)

			setBuckets(next)
			await persist(next)
			return
		}

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
			// Reorder touches both items (sortOrder/priority) and groups
			// (sortOrder/priority). Items live in React Query; groups still
			// come from the route loader.
			await Promise.all([router.invalidate(), queryClient.invalidateQueries({ queryKey: itemsKeys.byList(listId) })])
		} else {
			toast.error('Could not save order')
		}
	}

	const activeEntry = activeId ? (entries.get(activeId) ?? null) : null
	const overlayCount = draggingIds.size

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
				<p className="text-sm text-muted-foreground">
					Drag rows between buckets to change priority. Drag within a bucket to change order. Changes save automatically.
					{saving && <span className="ml-2 opacity-70">Saving…</span>}
				</p>
				<div className="flex items-center gap-2 sm:shrink-0">
					<SegmentedToggle<'single' | 'multi'>
						value={multiSelect ? 'multi' : 'single'}
						onValueChange={v => handleToggleMultiSelect(v === 'multi')}
						options={[
							{ value: 'single', label: 'Single' },
							{ value: 'multi', label: 'Multi' },
						]}
					/>
					{multiSelect && selectedIds.size > 0 && <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>}
				</div>
			</div>
			<DndContext
				sensors={sensors}
				collisionDetection={closestCorners}
				onDragStart={handleDragStart}
				onDragOver={handleDragOver}
				onDragEnd={handleDragEnd}
				onDragCancel={() => {
					setActiveId(null)
					setDraggingIds(new Set())
					setDraggingOrder([])
					lastOverKeyRef.current = null
				}}
			>
				<div className="flex flex-col gap-2">
					{PRIORITY_ORDER.map(p => (
						<BucketRow
							key={p}
							priority={p}
							ids={buckets[p]}
							entries={entries}
							multiSelect={multiSelect}
							selectedIds={selectedIds}
							onToggleSelect={handleToggleSelect}
						/>
					))}
				</div>
				{typeof document !== 'undefined' &&
					createPortal(
						<DragOverlay
							dropAnimation={{
								sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
							}}
						>
							{activeEntry ? overlayCount > 1 ? <MultiDragCard count={overlayCount} /> : <EntryRow entry={activeEntry} dragging /> : null}
						</DragOverlay>,
						document.body
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

function BucketRow({
	priority,
	ids,
	entries,
	multiSelect,
	selectedIds,
	onToggleSelect,
}: {
	priority: Priority
	ids: Array<EntryId>
	entries: Map<EntryId, Entry>
	multiSelect: boolean
	selectedIds: Set<EntryId>
	onToggleSelect: (id: EntryId) => void
}) {
	const { setNodeRef, isOver } = useDroppable({ id: priority })
	const ringClass = priorityRingClass[priority]
	return (
		<div
			ref={setNodeRef}
			className={cn('rounded-lg overflow-hidden shadow-sm ring-1 ring-border bg-card', ringClass, isOver && 'ring-primary/60')}
		>
			<div className="flex items-center gap-2 px-3 py-1.5 border-b bg-accent">
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
							return (
								<SortableRow
									key={id}
									entry={entry}
									multiSelect={multiSelect}
									isSelected={selectedIds.has(id)}
									onToggleSelect={onToggleSelect}
								/>
							)
						})
					)}
				</div>
			</SortableContext>
		</div>
	)
}

type DragHandleProps = Record<string, unknown>

function SortableRow({
	entry,
	multiSelect,
	isSelected,
	onToggleSelect,
}: {
	entry: Entry
	multiSelect: boolean
	isSelected: boolean
	onToggleSelect: (id: EntryId) => void
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id })
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.4 : 1,
	}
	const dragHandleProps: DragHandleProps = { ...attributes, ...listeners }
	return (
		<div ref={setNodeRef} style={style}>
			<EntryRow
				entry={entry}
				dragHandleProps={dragHandleProps}
				multiSelect={multiSelect}
				isSelected={isSelected}
				onToggleSelect={onToggleSelect}
			/>
		</div>
	)
}

function DragHandle({ dragHandleProps }: { dragHandleProps?: DragHandleProps }) {
	return (
		<button
			type="button"
			aria-label="Drag to reorder"
			{...(dragHandleProps ?? {})}
			className="p-2 -m-1 shrink-0 text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
		>
			<GripVertical className="size-4" />
		</button>
	)
}

function MultiDragCard({ count }: { count: number }) {
	return (
		<div className="flex items-center gap-2 px-3 py-2.5 bg-card shadow-lg rounded border ring-2 ring-primary/60 select-none">
			<Layers className="size-4 text-primary shrink-0" />
			<span className="text-sm font-medium">{count} rows selected</span>
		</div>
	)
}

function EntryRow({
	entry,
	dragging = false,
	dragHandleProps,
	multiSelect = false,
	isSelected = false,
	onToggleSelect,
}: {
	entry: Entry
	dragging?: boolean
	dragHandleProps?: DragHandleProps
	multiSelect?: boolean
	isSelected?: boolean
	onToggleSelect?: (id: EntryId) => void
}) {
	const handleBodyClick = multiSelect && onToggleSelect ? () => onToggleSelect(entry.id) : undefined
	const surface = isSelected ? 'bg-primary/25 hover:bg-primary/30 border-primary/60' : 'bg-card hover:bg-accent/40'
	const cursor = multiSelect ? 'cursor-pointer' : ''

	if (entry.kind === 'group') {
		const { group, children } = entry
		const Icon = group.type === 'or' ? Shuffle : ListOrdered
		return (
			<div
				onClick={handleBodyClick}
				className={cn(
					'flex flex-col gap-1 px-2 py-2.5 shadow-sm rounded border border-dashed select-none',
					surface,
					cursor,
					dragging && 'shadow-lg'
				)}
			>
				<div className="flex items-center gap-2">
					<DragHandle dragHandleProps={dragHandleProps} />
					<Icon className="size-4 text-muted-foreground shrink-0" />
					<span className="text-sm font-medium leading-tight truncate flex-1">
						{group.name ?? (group.type === 'or' ? 'Pick one' : 'In order')}
					</span>
					{isSelected && <Check className="size-4 text-primary shrink-0" />}
				</div>
				<ul className="pl-8 text-xs text-muted-foreground space-y-0.5">
					{children.length === 0 ? (
						<li className="flex gap-1.5 italic">
							<span aria-hidden="true" className="select-none">
								•
							</span>
							<span>No items</span>
						</li>
					) : (
						children.map(c => (
							<li key={c.id} className="flex gap-1.5 truncate">
								<span aria-hidden="true" className="select-none">
									•
								</span>
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
			onClick={handleBodyClick}
			className={cn('flex items-center gap-2 px-2 py-2.5 shadow-sm rounded border select-none', surface, cursor, dragging && 'shadow-lg')}
		>
			<DragHandle dragHandleProps={dragHandleProps} />
			<span className="text-sm font-medium leading-tight truncate flex-1">{item.title}</span>
			{item.imageUrl && (
				<div className="size-7 shrink-0 rounded bg-background/60 overflow-hidden flex items-center justify-center">
					<img src={httpsUpgrade(item.imageUrl)} alt="" className="object-contain size-full" />
				</div>
			)}
			{isSelected && <Check className="size-4 text-primary shrink-0" />}
		</div>
	)
}
