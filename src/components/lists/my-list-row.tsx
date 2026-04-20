import { Link, useRouter } from '@tanstack/react-router'
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Star, StarOff, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { deleteList, type MyListRow as MyListRowType,setPrimaryList, updateList } from '@/api/lists'
import ListTypeIcon from '@/components/common/list-type-icon'
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type Props = {
	list: MyListRowType
	showOwner?: { name: string | null; email: string }
}

export function MyListRow({ list, showOwner }: Props) {
	const router = useRouter()
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

	const handleArchive = async () => {
		const result = await updateList({ data: { listId: list.id, isActive: false } })
		if (result.kind === 'ok') {
			toast.success(`"${list.name}" archived`)
			await router.invalidate()
		}
	}

	const handleRestore = async () => {
		const result = await updateList({ data: { listId: list.id, isActive: true } })
		if (result.kind === 'ok') {
			toast.success(`"${list.name}" restored`)
			await router.invalidate()
		}
	}

	const handleDelete = async () => {
		const result = await deleteList({ data: { listId: list.id } })
		if (result.kind === 'ok') {
			if (result.action === 'archived') {
				toast.info(`"${list.name}" was archived instead of deleted because it has claimed items.`)
			} else {
				toast.success(`"${list.name}" deleted`)
			}
			await router.invalidate()
		}
		setDeleteDialogOpen(false)
	}

	const handleTogglePrimary = async () => {
		const result = await setPrimaryList({ data: { listId: list.id, isPrimary: !list.isPrimary } })
		if (result.kind === 'ok') {
			toast.success(list.isPrimary ? 'Primary list unset' : `"${list.name}" set as primary`)
			await router.invalidate()
		}
	}

	return (
		<>
			<div className="flex items-center gap-2 rounded p-2 hover:bg-muted">
				<ListTypeIcon type={list.type} className="size-5 shrink-0" />
				<Link
					to="/lists/$listId/edit"
					params={{ listId: String(list.id) }}
					className="flex-1 font-medium leading-tight truncate hover:underline"
				>
					{list.name}
				</Link>
				{showOwner && <span className="text-xs text-muted-foreground truncate max-w-32">{showOwner.name || showOwner.email}</span>}
				{list.isPrimary && <Star className="size-4 text-yellow-500 fill-yellow-500 shrink-0" />}
				<Badge variant="secondary" className="text-xs tabular-nums shrink-0">
					{list.itemCount}
				</Badge>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="size-7 shrink-0">
							<MoreHorizontal className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem asChild>
							<Link to="/lists/$listId/edit" params={{ listId: String(list.id) }}>
								<Pencil className="mr-2 size-4" /> Edit
							</Link>
						</DropdownMenuItem>
						{list.type !== 'giftideas' && (
							<DropdownMenuItem onClick={handleTogglePrimary}>
								{list.isPrimary ? (
									<>
										<StarOff className="mr-2 size-4" /> Unset primary
									</>
								) : (
									<>
										<Star className="mr-2 size-4" /> Set as primary
									</>
								)}
							</DropdownMenuItem>
						)}
						<DropdownMenuSeparator />
						{list.isActive ? (
							<DropdownMenuItem onClick={handleArchive}>
								<Archive className="mr-2 size-4" /> Archive
							</DropdownMenuItem>
						) : (
							<DropdownMenuItem onClick={handleRestore}>
								<ArchiveRestore className="mr-2 size-4" /> Restore
							</DropdownMenuItem>
						)}
						<DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteDialogOpen(true)}>
							<Trash2 className="mr-2 size-4" /> Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete "{list.name}"?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently remove the list and all its items. If there are claimed items, the list will be archived instead.
							Consider archiving if you might want to restore it later.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
