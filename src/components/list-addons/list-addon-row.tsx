import { useRouter } from '@tanstack/react-router'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { deleteListAddon } from '@/api/list-addons'
import type { AddonOnList } from '@/api/lists'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import UserAvatar from '@/components/common/user-avatar'
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
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useSession } from '@/lib/auth-client'

import { ListAddonDialog } from './list-addon-dialog'

type Props = {
	addon: AddonOnList
	listId: number
}

export function ListAddonRow({ addon, listId }: Props) {
	const router = useRouter()
	const { data: session } = useSession()
	const currentUserId = session?.user.id
	const isMine = addon.userId === currentUserId

	const [editDialogOpen, setEditDialogOpen] = useState(false)
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [deleting, setDeleting] = useState(false)

	const name = addon.user.name || addon.user.email

	async function handleDelete() {
		setDeleting(true)
		try {
			const result = await deleteListAddon({ data: { addonId: addon.id } })
			if (result.kind === 'error') {
				switch (result.reason) {
					case 'not-yours':
						toast.error("You can't delete someone else's addon.")
						break
					case 'not-found':
						toast.error('This addon no longer exists.')
						break
				}
				return
			}
			toast.success('Off-list gift removed')
			setDeleteDialogOpen(false)
			await router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to delete')
		} finally {
			setDeleting(false)
		}
	}

	return (
		<div className="relative z-10 flex items-start gap-2 p-3 ps-4 ring-1 ring-inset ring-border rounded-lg bg-card shadow-sm">
			<div className="flex flex-col w-full gap-2">
				{/* HEADER */}
				<div className="flex items-center gap-2 font-medium leading-tight">
					<span className="truncate min-w-0">{addon.description}</span>
					<span className="flex-1" />
					{isMine && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="icon" className="size-7 shrink-0" aria-label="Off-list gift actions">
									<MoreHorizontal className="size-5" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
									<Pencil className="size-4" />
									Edit
								</DropdownMenuItem>
								<DropdownMenuItem variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
									<Trash2 className="size-4" />
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>

				{/* CONTENT */}
				{(addon.totalCost || addon.notes) && (
					<div className="flex flex-col gap-1">
						{addon.totalCost && <span className="px-2 text-xs border rounded whitespace-nowrap bg-card w-fit">${addon.totalCost}</span>}
						{addon.notes && <MarkdownNotes content={addon.notes} className="text-xs text-foreground/75" />}
					</div>
				)}

				{/* FOOTER */}
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<UserAvatar name={name} image={addon.user.image} size="small" />
					<span>{isMine ? 'You' : name}</span>
				</div>
			</div>

			{isMine && editDialogOpen && (
				<ListAddonDialog mode="edit" addon={addon} open={editDialogOpen} onOpenChange={setEditDialogOpen} listId={listId} />
			)}

			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this off-list gift?</AlertDialogTitle>
						<AlertDialogDescription>This will permanently remove the entry.</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleDelete} disabled={deleting}>
							{deleting ? 'Deleting…' : 'Yes, delete'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
