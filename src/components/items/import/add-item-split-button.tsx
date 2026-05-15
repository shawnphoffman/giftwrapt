import { Apple, ChevronDown, Link2, Plus, ShoppingBag } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useAppSetting } from '@/hooks/use-app-settings'

import { ImportDialogAmazon } from './import-dialog-amazon'
import { ImportDialogAppleNotes } from './import-dialog-apple-notes'
import { ImportDialogUrls } from './import-dialog-urls'

type Props = {
	listId: number
	onAddItem: () => void
	// Allow the route loader to pre-resolve the gate so the caret never
	// flashes; falling back to the live setting hook lets us still react
	// to admin toggles without a route reload.
	importEnabledOverride?: boolean
}

type ImportSource = 'urls' | 'apple-notes' | 'amazon'

/**
 * Split-button affordance on the list-edit toolbar. The primary face
 * preserves the one-click "Add item" flow into the existing
 * `ItemFormDialog`. The caret trigger opens a dropdown of bulk-import
 * sources (paste URLs, Apple Notes, Amazon Wish List).
 *
 * The caret is hidden when `importEnabled=false` in app settings so the
 * UI degrades gracefully to the original single-button shape.
 */
export function AddItemSplitButton({ listId, onAddItem, importEnabledOverride }: Props) {
	const liveImportEnabled = useAppSetting('importEnabled')
	const importEnabled = importEnabledOverride ?? liveImportEnabled
	const [openSource, setOpenSource] = useState<ImportSource | null>(null)

	if (!importEnabled) {
		return (
			<Button size="sm" onClick={onAddItem}>
				<Plus className="size-4" /> <span className="xs:hidden">Add</span>
				<span className="hidden xs:inline">Add item</span>
			</Button>
		)
	}

	return (
		<>
			<div className="inline-flex items-stretch isolate">
				<Button size="sm" onClick={onAddItem} className="rounded-r-none border-r-0 focus-visible:z-10">
					<Plus className="size-4" /> <span className="xs:hidden">Add</span>
					<span className="hidden xs:inline">Add item</span>
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="sm" aria-label="Import items" className="rounded-l-none px-1.5 focus-visible:z-10">
							<ChevronDown className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={() => setOpenSource('urls')}>
							<Link2 className="size-4" /> Paste URLs
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => setOpenSource('apple-notes')}>
							<Apple className="size-4" /> Apple Notes
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => setOpenSource('amazon')}>
							<ShoppingBag className="size-4" /> Amazon Wish List
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<ImportDialogUrls listId={listId} open={openSource === 'urls'} onOpenChange={open => setOpenSource(open ? 'urls' : null)} />
			<ImportDialogAppleNotes
				listId={listId}
				open={openSource === 'apple-notes'}
				onOpenChange={open => setOpenSource(open ? 'apple-notes' : null)}
			/>
			<ImportDialogAmazon listId={listId} open={openSource === 'amazon'} onOpenChange={open => setOpenSource(open ? 'amazon' : null)} />
		</>
	)
}
