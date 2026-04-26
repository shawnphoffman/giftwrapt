import { Slot } from '@radix-ui/react-slot'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useRouter } from '@tanstack/react-router'
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Star, StarOff, Trash2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'

import { deleteList, type MyListRow as MyListRowType, setPrimaryList, updateList } from '@/api/lists'
import CountBadge from '@/components/common/count-badge'
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
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { UserWithLists } from '@/db-collections/lists'
import { useSession } from '@/lib/auth-client'
import { cn } from '@/lib/utils'

type GifterList = UserWithLists['lists'][number]

type Props =
	| { role: 'recipient'; list: MyListRowType; showOwner?: { name: string | null; email: string } }
	| { role: 'gifter'; list: GifterList }

const rowClass = 'text-lg flex min-h-11 bg-transparent hover:bg-muted rounded p-2 items-center gap-2'

function ListRowShell({ children, archived, asChild = false }: { children: ReactNode; archived?: boolean; asChild?: boolean }) {
	const Comp = asChild ? Slot : 'div'
	return <Comp className={cn(rowClass, archived && 'opacity-60')}>{children}</Comp>
}

export function ListRow(props: Props) {
	if (props.role === 'recipient') {
		return <RecipientRow list={props.list} showOwner={props.showOwner} />
	}
	return <GifterRow list={props.list} />
}

function RecipientRow({ list, showOwner }: { list: MyListRowType; showOwner?: { name: string | null; email: string } }) {
	const router = useRouter()
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const isAdmin = session?.user.isAdmin
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

	const refreshLists = async () => {
		await queryClient.invalidateQueries({ queryKey: ['my-lists'] })
		await router.invalidate()
	}

	const handleArchive = async () => {
		const result = await updateList({ data: { listId: list.id, isActive: false } })
		if (result.kind === 'ok') {
			toast.success(`"${list.name}" archived`)
			await refreshLists()
		}
	}

	const handleRestore = async () => {
		const result = await updateList({ data: { listId: list.id, isActive: true } })
		if (result.kind === 'ok') {
			toast.success(`"${list.name}" restored`)
			await refreshLists()
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
			await refreshLists()
		}
		setDeleteDialogOpen(false)
	}

	const handleTogglePrimary = async () => {
		const result = await setPrimaryList({ data: { listId: list.id, isPrimary: !list.isPrimary } })
		if (result.kind === 'ok') {
			toast.success(list.isPrimary ? 'Primary list unset' : `"${list.name}" set as primary`)
			await refreshLists()
		}
	}

	return (
		<>
			<ListRowShell archived={!list.isActive}>
				<ListTypeIcon type={list.type} className="size-6 shrink-0" />
				<Link to="/lists/$listId/edit" params={{ listId: String(list.id) }} className="flex-1 font-medium leading-tight truncate">
					{list.name}
				</Link>
				{showOwner && <span className="text-xs text-muted-foreground truncate max-w-32">{showOwner.name || showOwner.email}</span>}
				{list.isPrimary && <Star className="size-4 text-yellow-500 fill-yellow-500 shrink-0" />}
				{!list.isActive && (
					<Badge variant="outline" className="gap-1 shrink-0 text-xs text-muted-foreground">
						<Archive className="size-3" />
						Archived
					</Badge>
				)}
				<CountBadge count={list.itemCount} />
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="size-7 shrink-0">
							<MoreHorizontal className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem asChild>
							<Link to="/lists/$listId/edit" params={{ listId: String(list.id) }}>
								<Pencil className="size-4" /> Edit
							</Link>
						</DropdownMenuItem>
						{list.type !== 'giftideas' && (
							<DropdownMenuItem onClick={handleTogglePrimary}>
								{list.isPrimary ? (
									<>
										<StarOff className="size-4" /> Unset primary
									</>
								) : (
									<>
										<Star className="size-4" /> Set as primary
									</>
								)}
							</DropdownMenuItem>
						)}
						<DropdownMenuSeparator />
						{list.isActive ? (
							<DropdownMenuItem onClick={handleArchive}>
								<Archive className="size-4" /> Archive
							</DropdownMenuItem>
						) : (
							<DropdownMenuItem onClick={handleRestore}>
								<ArchiveRestore className="size-4" /> Restore
							</DropdownMenuItem>
						)}
						<DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteDialogOpen(true)}>
							<Trash2 className="size-4" /> Delete
						</DropdownMenuItem>
						{isAdmin && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuLabel className="text-muted-foreground font-mono text-xs">list #{list.id}</DropdownMenuLabel>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</ListRowShell>

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

function GifterRow({ list }: { list: GifterList }) {
	return (
		<ListRowShell asChild>
			<Link to="/lists/$listId" params={{ listId: String(list.id) }}>
				<ListTypeIcon type={list.type} className="size-6 shrink-0" />
				<div className="font-medium leading-tight flex-1 truncate">{list.name}</div>
				<CountBadge count={list.itemsTotal} remaining={list.itemsRemaining} />
			</Link>
		</ListRowShell>
	)
}
