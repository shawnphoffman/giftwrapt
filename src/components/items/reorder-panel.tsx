import {
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRouter } from '@tanstack/react-router'
import { GripVertical } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { reorderItems } from '@/api/items'
import PriorityIcon from '@/components/common/priority-icon'
import { Badge } from '@/components/ui/badge'
import type { Priority } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'

type Props = {
	listId: number
	items: Array<Item>
	groups: Array<{ id: number; type: 'or' | 'order'; name: string | null; priority: Priority }>
}

const PRIORITY_ORDER: Array<Priority> = ['very-high', 'high', 'normal', 'low']
const PRIORITY_LABEL: Record<Priority, string> = {
	'very-high': 'Very high',
	high: 'High',
	normal: 'Normal',
	low: 'Low',
}

type Bucket = Record<Priority, Array<number>>

export function ReorderPanel({ listId, items, groups }: Props) {
	const router = useRouter()
	const [activeId, setActiveId] = useState<number | null>(null)
	const [saving, setSaving] = useState(false)

	// Only ungrouped, non-archived items are draggable. Grouped items show as
	// inert tiles at the bottom so users understand where the rest went.
	const draggable = useMemo(() => items.filter(i => !i.isArchived && i.groupId === null), [items])
	const itemById = useMemo(() => new Map(draggable.map(i => [i.id, i])), [draggable])

	const initialBuckets = useMemo<Bucket>(() => {
		const b: Bucket = { 'very-high': [], high: [], normal: [], low: [] }
		const sorted = [...draggable].sort((a, c) => {
			const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER
			const co = c.sortOrder ?? Number.MAX_SAFE_INTEGER
			if (ao !== co) return ao - co
			return a.id - c.id
		})
		for (const item of sorted) b[item.priority].push(item.id)
		return b
	}, [draggable])

	const [buckets, setBuckets] = useState<Bucket>(initialBuckets)

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	)

	const findBucket = (id: number): Priority | null => {
		for (const p of PRIORITY_ORDER) if (buckets[p].includes(id)) return p
		return null
	}

	const handleDragStart = (e: DragStartEvent) => {
		setActiveId(Number(e.active.id))
	}

	const handleDragOver = (e: DragOverEvent) => {
		const { active, over } = e
		if (!over) return
		const activeId = Number(active.id)
		const overId = over.id

		const fromBucket = findBucket(activeId)
		if (!fromBucket) return

		// Dropped over a bucket container directly.
		const toBucket: Priority | null = PRIORITY_ORDER.includes(overId as Priority)
			? (overId as Priority)
			: findBucket(Number(overId))
		if (!toBucket || fromBucket === toBucket) return

		setBuckets(prev => {
			const next: Bucket = { ...prev }
			next[fromBucket] = prev[fromBucket].filter(id => id !== activeId)
			next[toBucket] = [...prev[toBucket], activeId]
			return next
		})
	}

	const handleDragEnd = async (e: DragEndEvent) => {
		const { active, over } = e
		setActiveId(null)
		if (!over) return

		const activeId = Number(active.id)
		const overId = over.id
		const bucket = findBucket(activeId)
		if (!bucket) return

		// If dropped over another item in same bucket, reorder; otherwise already placed via drag-over.
		let nextBuckets = buckets
		if (!PRIORITY_ORDER.includes(overId as Priority)) {
			const overBucket = findBucket(Number(overId))
			if (overBucket === bucket) {
				const oldIndex = buckets[bucket].indexOf(activeId)
				const newIndex = buckets[bucket].indexOf(Number(overId))
				if (oldIndex !== newIndex && oldIndex >= 0 && newIndex >= 0) {
					nextBuckets = { ...buckets, [bucket]: arrayMove(buckets[bucket], oldIndex, newIndex) }
					setBuckets(nextBuckets)
				}
			}
		}

		// Persist the full layout.
		const updates: Array<{ itemId: number; priority: Priority; sortOrder: number }> = []
		for (const p of PRIORITY_ORDER) {
			nextBuckets[p].forEach((id, idx) => {
				updates.push({ itemId: id, priority: p, sortOrder: idx })
			})
		}
		if (updates.length === 0) return

		setSaving(true)
		const r = await reorderItems({ data: { listId, updates } })
		setSaving(false)
		if (r.kind === 'ok') {
			await router.invalidate()
		} else {
			toast.error('Could not save order')
		}
	}

	const activeItem = activeId !== null ? itemById.get(activeId) ?? null : null
	const groupedCount = items.filter(i => !i.isArchived && i.groupId !== null).length

	return (
		<div className="flex flex-col gap-3">
			<p className="text-sm text-muted-foreground">
				Drag items between buckets to change priority. Drag within a bucket to change order. Changes save automatically.
				{saving && <span className="ml-2 opacity-70">Saving…</span>}
			</p>
			<DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
				<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
					{PRIORITY_ORDER.map(p => (
						<Bucket key={p} priority={p} ids={buckets[p]} items={itemById} />
					))}
				</div>
				<DragOverlay>{activeItem && <ItemTile item={activeItem} dragging />}</DragOverlay>
			</DndContext>

			{groups.length > 0 && (
				<div className="flex flex-col gap-2 mt-2">
					<div className="text-sm font-medium">Groups</div>
					<p className="text-xs text-muted-foreground">
						Items inside a group are reordered from the group's header on the edit page. Adjust group priority there too.
					</p>
					<div className="grid gap-2 md:grid-cols-2">
						{groups.map(g => {
							const count = items.filter(i => i.groupId === g.id && !i.isArchived).length
							return (
								<div key={g.id} className="flex items-center gap-2 p-2 border rounded-md bg-muted/20">
									<PriorityIcon priority={g.priority} className="size-4 shrink-0" />
									<span className="text-sm font-medium truncate flex-1">
										{g.name ?? (g.type === 'or' ? 'Pick one' : 'In order')}
									</span>
									<Badge variant="secondary" className="text-xs tabular-nums">
										{count}
									</Badge>
								</div>
							)
						})}
					</div>
					{groupedCount > 0 && (
						<p className="text-xs text-muted-foreground">
							{groupedCount} item{groupedCount === 1 ? '' : 's'} in groups not shown here.
						</p>
					)}
				</div>
			)}
		</div>
	)
}

function Bucket({ priority, ids, items }: { priority: Priority; ids: Array<number>; items: Map<number, Item> }) {
	const { setNodeRef, isOver } = useSortable({ id: priority, data: { isBucket: true } })
	return (
		<div
			ref={setNodeRef}
			className={`border rounded-lg bg-accent flex flex-col min-h-40 ${isOver ? 'ring-2 ring-primary' : ''}`}
		>
			<div className="flex items-center gap-2 p-2 border-b bg-muted/30">
				<PriorityIcon priority={priority} className="size-4 shrink-0" />
				<span className="font-medium text-sm flex-1">{PRIORITY_LABEL[priority]}</span>
				<Badge variant="secondary" className="text-xs tabular-nums">
					{ids.length}
				</Badge>
			</div>
			<SortableContext items={ids} strategy={verticalListSortingStrategy}>
				<div className="flex flex-col gap-1 p-1 flex-1 min-h-20">
					{ids.length === 0 ? (
						<div className="text-xs text-muted-foreground text-center py-4">Drop items here</div>
					) : (
						ids.map(id => {
							const item = items.get(id)
							if (!item) return null
							return <SortableTile key={id} item={item} />
						})
					)}
				</div>
			</SortableContext>
		</div>
	)
}

function SortableTile({ item }: { item: Item }) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.4 : 1,
	}
	return (
		<div ref={setNodeRef} style={style} {...attributes} {...listeners}>
			<ItemTile item={item} />
		</div>
	)
}

function ItemTile({ item, dragging = false }: { item: Item; dragging?: boolean }) {
	return (
		<div
			className={`flex items-center gap-2 p-2 bg-background rounded border cursor-grab active:cursor-grabbing touch-none ${
				dragging ? 'shadow-lg' : ''
			}`}
		>
			<GripVertical className="size-4 text-muted-foreground shrink-0" />
			<div className="size-8 shrink-0 rounded bg-muted/40 overflow-hidden flex items-center justify-center">
				{item.imageUrl ? (
					<img src={item.imageUrl} alt="" className="object-contain size-full" />
				) : (
					<span className="text-xs text-muted-foreground">—</span>
				)}
			</div>
			<span className="text-sm font-medium leading-tight truncate flex-1">{item.title}</span>
		</div>
	)
}
