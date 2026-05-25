import { Slot } from '@radix-ui/react-slot'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useRouter } from '@tanstack/react-router'
import { Archive, ArchiveRestore, Crown, Lock, MoreHorizontal, Pencil, Star, StarOff, Trash2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'

import { deleteList, type MyListRow as MyListRowType, setPrimaryList, updateList } from '@/api/lists'
import CountBadge from '@/components/common/count-badge'
import DependentAvatar from '@/components/common/dependent-avatar'
import ListTypeIcon from '@/components/common/list-type-icon'
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
import { AvatarGroupCount } from '@/components/ui/avatar'
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
import { TapTooltip, TapTooltipContent, TapTooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import type { UserWithLists } from '@/db-collections/lists'
import { useSession } from '@/lib/auth-client'
import { cn } from '@/lib/utils'

type GifterList = UserWithLists['lists'][number]

type EditorInfo = { name: string | null; email: string; image: string | null }

// Compact "shared with" indicator for an owner's own list: shows the first
// editor's avatar with a "+N" count for the rest, tooltip lists everyone.
// Mirrors the showOwner avatar group's visual treatment so the two surfaces
// read as a family.
// Callers gate on `editors.length > 0`, so destructuring `first` here is safe.
function SharedWithAvatars({ editors }: { editors: Array<EditorInfo> }) {
	const [first, ...rest] = editors
	return (
		<TooltipProvider delayDuration={150}>
			<TapTooltip>
				<TapTooltipTrigger asChild>
					<div className="flex items-center -space-x-0.75 shrink-0">
						<UserAvatar
							name={first.name || first.email}
							image={first.image}
							size="small"
							className="relative z-10 size-5 ring-1 ring-background border-0"
						/>
						{rest.length > 0 && (
							<AvatarGroupCount className="size-5 shrink-0 rounded-full bg-muted text-muted-foreground text-[10px] font-bold leading-none flex items-center justify-center select-none ring-1">
								+{rest.length}
							</AvatarGroupCount>
						)}
					</div>
				</TapTooltipTrigger>
				<TapTooltipContent className="flex flex-col gap-1.5">
					<div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Shared with</div>
					{editors.map(editor => (
						<div key={editor.email} className="flex items-center gap-2 justify-items-start w-full">
							<UserAvatar name={editor.name || editor.email} image={editor.image} size="small" />
							<span className="font-medium">{editor.name || editor.email}</span>
						</div>
					))}
				</TapTooltipContent>
			</TapTooltip>
		</TooltipProvider>
	)
}

// For gift-ideas lists with a defined recipient (user or dependent), the
// row's lead icon becomes the recipient's avatar with a thick teal ring so
// it reads as "this list is FOR this person" at a glance. Falls back to the
// list-type icon when the recipient is free-text or the type is not gift
// ideas.
function GiftIdeasLeadIcon({ list }: { list: MyListRowType }) {
	if (list.type === 'giftideas') {
		if (list.giftIdeasTargetDependent) {
			return (
				<DependentAvatar
					name={list.giftIdeasTargetDependent.name}
					image={list.giftIdeasTargetDependent.image}
					size="small"
					className="size-6 shrink-0 ring-2 ring-teal-500 border-0"
				/>
			)
		}
		if (list.giftIdeasTarget) {
			return (
				<UserAvatar
					name={list.giftIdeasTarget.name || list.giftIdeasTarget.email}
					image={list.giftIdeasTarget.image}
					size="small"
					className="size-6 shrink-0 ring-2 ring-teal-500 border-0"
				/>
			)
		}
	}
	return <ListTypeIcon type={list.type} className="size-6 shrink-0" />
}

// `showOwner` can describe a regular user owner OR a dependent subject.
// When a list has `subjectDependentId`, surfaces should pass the
// dependent shape so the row renders DependentAvatar / Sprout fallback
// instead of the guardian who created the list.
type RowOwner =
	| { kind?: 'user'; name: string | null; email: string; image: string | null }
	| { kind: 'dependent'; name: string; image: string | null }

type Props =
	| {
			role: 'recipient'
			list: MyListRowType
			showOwner?: RowOwner
	  }
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

function RecipientRow({ list, showOwner }: { list: MyListRowType; showOwner?: RowOwner }) {
	const editors = list.editors
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
				<GiftIdeasLeadIcon list={list} />
				<Link to="/lists/$listId/edit" params={{ listId: String(list.id) }} className="flex-1 font-medium leading-tight truncate">
					{list.name}
				</Link>
				{showOwner && (
					<TooltipProvider delayDuration={150}>
						<TapTooltip>
							<TapTooltipTrigger asChild>
								<div className="flex items-center -space-x-0.75 shrink-0">
									{showOwner.kind === 'dependent' ? (
										<DependentAvatar
											name={showOwner.name}
											image={showOwner.image}
											size="small"
											className="relative z-10 size-5 ring-1 ring-background border-0"
										/>
									) : (
										<UserAvatar
											name={showOwner.name || showOwner.email}
											image={showOwner.image}
											size="small"
											className="relative z-10 size-5 ring-1 ring-background border-0"
										/>
									)}
									{editors.length > 0 && (
										<AvatarGroupCount className="size-5 shrink-0 rounded-full bg-muted text-muted-foreground text-[10px] font-bold leading-none flex items-center justify-center select-none ring-1">
											+{editors.length}
										</AvatarGroupCount>
									)}
								</div>
							</TapTooltipTrigger>
							<TapTooltipContent className="flex flex-col gap-1.5">
								<div className="flex items-center gap-2 justify-items-start w-full">
									{showOwner.kind === 'dependent' ? (
										<>
											<DependentAvatar name={showOwner.name} image={showOwner.image} size="small" />
											<span className="font-medium">{showOwner.name}</span>
										</>
									) : (
										<>
											<UserAvatar name={showOwner.name || showOwner.email} image={showOwner.image} size="small" />
											<span className="font-medium">{showOwner.name || showOwner.email}</span>
											<Crown className="size-3 text-yellow-500 fill-yellow-500" aria-label="Owner" />
										</>
									)}
								</div>
								{editors.map(editor => (
									<div key={editor.email} className="flex items-center gap-2 justify-items-start w-full">
										<UserAvatar name={editor.name || editor.email} image={editor.image} size="small" />
										<span className="font-medium">{editor.name || editor.email}</span>
									</div>
								))}
							</TapTooltipContent>
						</TapTooltip>
					</TooltipProvider>
				)}
				{!showOwner && editors.length > 0 && <SharedWithAvatars editors={editors} />}
				{list.isPrimary && <Star className="size-4 text-yellow-500 fill-yellow-500 shrink-0" />}
				{!list.isActive && (
					<Badge variant="outline" className="gap-1 shrink-0 text-xs text-muted-foreground">
						<Archive className="size-3" />
						Archived
					</Badge>
				)}
				{list.isPrivate && (
					<TooltipProvider delayDuration={150}>
						<TapTooltip>
							<TapTooltipTrigger asChild>
								<span className="inline-flex shrink-0 text-muted-foreground" aria-label="Private list">
									<Lock className="size-3.5" />
								</span>
							</TapTooltipTrigger>
							<TapTooltipContent>Private list</TapTooltipContent>
						</TapTooltip>
					</TooltipProvider>
				)}
				<CountBadge count={list.itemCount} />
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="icon" className="size-7 shrink-0" aria-label="List actions">
							<MoreHorizontal className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem asChild>
							<Link to="/lists/$listId/edit" params={{ listId: String(list.id) }} search={{ settings: true }}>
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
				{list.isPrimary && <Star className="size-4 text-yellow-500 fill-yellow-500 shrink-0" />}
				<CountBadge count={list.itemsTotal} remaining={list.itemsRemaining} />
			</Link>
		</ListRowShell>
	)
}
