import { useSuspenseQuery } from '@tanstack/react-query'
import { CircleHelp, PackagePlus } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { listAddonsQueryOptions } from '@/lib/queries/lists'
import { m } from '@/paraglide/messages.js'

import { ListAddonDialog } from './list-addon-dialog'
import { ListAddonRow } from './list-addon-row'

type Props = {
	listId: number
}

export function ListAddonsSection({ listId }: Props) {
	const [createDialogOpen, setCreateDialogOpen] = useState(false)
	const { data: addons } = useSuspenseQuery(listAddonsQueryOptions(listId))

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-2 xs:flex-row xs:items-center xs:justify-between">
				<div className="flex items-center gap-1.5">
					<h2 className="text-lg font-semibold">{m.lists_addons_heading()}</h2>
					<Popover>
						<PopoverTrigger asChild>
							<button
								type="button"
								aria-label={m.lists_addons_about_label()}
								className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<CircleHelp className="size-4" />
							</button>
						</PopoverTrigger>
						<PopoverContent side="top" align="start" className="max-w-xs text-xs leading-relaxed">
							{m.lists_addons_about_text()}
						</PopoverContent>
					</Popover>
				</div>
				<Button size="sm" variant="outline" onClick={() => setCreateDialogOpen(true)}>
					<PackagePlus className="size-4 transition-colors group-hover/button:text-orange-500" />
					{m.lists_addons_add_button()}
				</Button>
			</div>

			{addons.length === 0 ? (
				<p className="text-sm text-muted-foreground py-3 px-3 border border-dashed rounded-lg bg-accent/30 xs:ml-6">
					{m.lists_addons_empty()}
				</p>
			) : (
				<div className="flex flex-col gap-2 xs:pl-6">
					{addons.map(addon => (
						<ListAddonRow key={addon.id} addon={addon} listId={listId} />
					))}
				</div>
			)}

			<ListAddonDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} listId={listId} />
		</div>
	)
}
