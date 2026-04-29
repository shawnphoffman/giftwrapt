import { CircleHelp, PackagePlus } from 'lucide-react'
import { useState } from 'react'

import type { AddonOnList } from '@/api/lists'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

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
				<div className="flex items-center gap-1.5">
					<h2 className="text-lg font-semibold">Off-List Gifts</h2>
					<Popover>
						<PopoverTrigger asChild>
							<button
								type="button"
								aria-label="About off-list gifts"
								className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<CircleHelp className="size-4" />
							</button>
						</PopoverTrigger>
						<PopoverContent side="top" align="start" className="max-w-xs text-xs leading-relaxed">
							These items are off-list gifts or notes that are manually added to help keep others in the loop. The list owner cannot see
							items on this list as they are treated like purchased gifts.
						</PopoverContent>
					</Popover>
				</div>
				<Button size="sm" variant="outline" onClick={() => setCreateDialogOpen(true)}>
					<PackagePlus className="size-4 transition-colors group-hover/button:text-orange-500" />
					Add Off-List Gift
				</Button>
			</div>

			{activeAddons.length === 0 ? (
				<p className="text-sm text-muted-foreground py-3 px-3 border border-dashed rounded-lg bg-accent/30 xs:ml-6">
					No off-list gifts yet. If you're getting something that isn't on the list, add it here so other gifters can see.
				</p>
			) : (
				<div className="flex flex-col gap-2 xs:pl-6">
					{activeAddons.map(addon => (
						<ListAddonRow key={addon.id} addon={addon} listId={listId} />
					))}
				</div>
			)}

			<ListAddonDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} listId={listId} />
		</div>
	)
}
