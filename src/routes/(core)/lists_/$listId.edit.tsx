import { createFileRoute, notFound } from '@tanstack/react-router'
import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'

import { getListEditors } from '@/api/list-editors'
import { getListForEditing } from '@/api/lists'
import type { Item } from '@/db/schema/items'
import { ItemEditRow } from '@/components/items/item-edit-row'
import { ItemFormDialog } from '@/components/items/item-form-dialog'
import { ListEditorsSection } from '@/components/list-editors/list-editors-section'
import { ListSettingsCard } from '@/components/lists/list-settings-card'
import { MoveItemDialog } from '@/components/items/move-item-dialog'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/(core)/lists_/$listId/edit')({
	loader: async ({ params }) => {
		const listId = Number(params.listId)
		if (!Number.isFinite(listId)) throw notFound()

		const [listResult, editors] = await Promise.all([
			getListForEditing({ data: { listId: params.listId } }),
			getListEditors({ data: { listId } }),
		])

		if (listResult.kind === 'error') throw notFound()

		return { list: listResult.list, editors }
	},
	component: ListEditPage,
})

function ListEditPage() {
	const { list, editors } = Route.useLoaderData()
	const [addItemOpen, setAddItemOpen] = useState(false)
	const [moveItem, setMoveItem] = useState<Item | null>(null)

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative flex items-center gap-3">
					<h1 className="truncate">{list.name}</h1>
					<Pencil className="text-blue-500 wish-page-icon" />
				</div>

				{/* LIST SETTINGS — owner only */}
				{list.isOwner && (
					<ListSettingsCard
						listId={list.id}
						name={list.name}
						type={list.type}
						isPrivate={list.isPrivate}
						description={list.description}
					/>
				)}

				{/* ITEMS */}
				<div className="flex flex-col gap-2">
					<div className="flex items-center justify-between">
						<h3>Items</h3>
						<Button size="sm" onClick={() => setAddItemOpen(true)}>
							<Plus className="mr-1 size-4" /> Add item
						</Button>
					</div>

					{list.items.length === 0 ? (
						<div className="text-sm text-muted-foreground py-6 text-center border rounded-lg bg-accent">
							No items yet. Click "Add item" to get started.
						</div>
					) : (
						<div className="flex flex-col overflow-hidden border divide-y rounded-lg bg-accent">
							{list.items.map(item => (
								<ItemEditRow
									key={item.id}
									item={item}
									onMoveClick={list.isOwner ? setMoveItem : undefined}
								/>
							))}
						</div>
					)}
				</div>

				{/* EDITORS — owner only */}
				{list.isOwner && <ListEditorsSection listId={list.id} editors={editors} />}
			</div>

			<ItemFormDialog open={addItemOpen} onOpenChange={setAddItemOpen} mode="create" listId={list.id} />

			{moveItem && (
				<MoveItemDialog
					open={!!moveItem}
					onOpenChange={open => { if (!open) setMoveItem(null) }}
					item={moveItem}
				/>
			)}
		</div>
	)
}
