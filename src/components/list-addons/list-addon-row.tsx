import { useRouter } from '@tanstack/react-router'
import { Archive, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { archiveListAddon, deleteListAddon } from '@/api/list-addons'
import type { AddonOnList } from '@/api/lists'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
	const [archiving, setArchiving] = useState(false)
	const [deleting, setDeleting] = useState(false)

	const name = addon.user.name || addon.user.email

	async function handleArchive() {
		setArchiving(true)
		try {
			const result = await archiveListAddon({ data: { addonId: addon.id } })
			if (result.kind === 'error') {
				switch (result.reason) {
					case 'not-yours':
						toast.error("You can't archive someone else's addon.")
						break
					case 'not-found':
						toast.error('This addon no longer exists.')
						break
					case 'already-archived':
						toast.error('Already marked as given.')
						break
				}
				return
			}
			toast.success('Marked as given')
			await router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to archive')
		} finally {
			setArchiving(false)
		}
	}

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
		<div className="flex flex-col gap-2 p-3 hover:bg-muted">
			<div className="flex flex-row items-start gap-3">
				<div className="flex flex-col flex-1 gap-0.5 overflow-hidden">
					<div className="flex flex-row items-center gap-2 font-medium">
						<span>{addon.description}</span>
						{addon.totalCost && <span className="px-2 text-xs border rounded whitespace-nowrap bg-card w-fit">${addon.totalCost}</span>}
						{addon.isArchived && (
							<Badge variant="secondary" className="text-xs">
								Given
							</Badge>
						)}
					</div>
					{addon.notes && <div className="text-sm text-foreground/75">{addon.notes}</div>}
				</div>
			</div>

			<div className="flex flex-row items-center gap-2 pt-1">
				<div className="flex flex-row items-center gap-1.5 text-xs text-muted-foreground">
					<UserAvatar name={name} image={addon.user.image} size="small" />
					<span>{isMine ? 'You' : name}</span>
				</div>

				{isMine && !addon.isArchived && (
					<div className="flex flex-row items-center gap-2 ml-auto">
						<Button size="sm" variant="ghost" onClick={() => setEditDialogOpen(true)} title="Edit">
							<Pencil className="size-4" />
							Edit
						</Button>
						<Button size="sm" variant="ghost" onClick={handleArchive} disabled={archiving} title="Mark as given">
							<Archive className="size-4" />
							{archiving ? 'Archiving\u2026' : 'Mark as given'}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => setDeleteDialogOpen(true)}
							title="Delete"
							className="text-destructive hover:text-destructive"
						>
							<Trash2 className="size-4" />
							Delete
						</Button>
					</div>
				)}
			</div>

			{isMine && editDialogOpen && (
				<ListAddonDialog mode="edit" addon={addon} open={editDialogOpen} onOpenChange={setEditDialogOpen} listId={listId} />
			)}

			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this off-list gift?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently remove the entry. If you meant to mark it as given instead, use "Mark as given".
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleDelete} disabled={deleting}>
							{deleting ? 'Deleting\u2026' : 'Yes, delete'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
