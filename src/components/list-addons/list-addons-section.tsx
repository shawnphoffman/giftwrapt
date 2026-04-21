import { PackagePlus } from 'lucide-react'
import { useState } from 'react'

import type { AddonOnList } from '@/api/lists'
import { Button } from '@/components/ui/button'

import { ListAddonDialog } from './list-addon-dialog'
import { ListAddonRow } from './list-addon-row'

type Props = {
	listId: number
	addons: Array<AddonOnList>
}

export function ListAddonsSection({ listId, addons }: Props) {
	const [createDialogOpen, setCreateDialogOpen] = useState(false)

	const activeAddons = addons.filter(a => !a.isArchived)

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-row items-center justify-between">
				<h2 className="text-lg font-semibold">Off-list gifts</h2>
				<Button size="sm" variant="outline" onClick={() => setCreateDialogOpen(true)}>
					<PackagePlus className="size-4" />
					Add off-list gift
				</Button>
			</div>

			{activeAddons.length === 0 ? (
				<p className="text-sm text-muted-foreground py-3 px-3 border border-dashed rounded-lg bg-accent/30">
					No off-list gifts yet. If you're getting something that isn't on the list, add it here so other gifters can see.
				</p>
			) : (
				<div className="flex flex-col gap-2 pl-6">
					{activeAddons.map(addon => (
						<ListAddonRow key={addon.id} addon={addon} listId={listId} />
					))}
				</div>
			)}

			<ListAddonDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} listId={listId} />
		</div>
	)
}
