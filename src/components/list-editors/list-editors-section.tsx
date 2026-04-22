import { useRouter } from '@tanstack/react-router'
import { UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import type { AddableEditorUser, EditorOnList } from '@/api/list-editors'
import { addListEditor, removeListEditor } from '@/api/list-editors'
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
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Props = {
	listId: number
	editors: Array<EditorOnList>
	addableUsers: Array<AddableEditorUser>
}

export function ListEditorsSection({ listId, editors, addableUsers }: Props) {
	const router = useRouter()
	const [selectedUserId, setSelectedUserId] = useState<string>('')
	const [submitting, setSubmitting] = useState(false)
	const [removeTarget, setRemoveTarget] = useState<EditorOnList | null>(null)
	const [removing, setRemoving] = useState(false)

	async function handleAdd() {
		const picked = addableUsers.find(u => u.id === selectedUserId)
		if (!picked || picked.role === 'child') return
		setSubmitting(true)
		try {
			const result = await addListEditor({ data: { listId, userId: picked.id } })
			if (result.kind === 'error') {
				const msg: Record<typeof result.reason, string> = {
					'user-not-found': 'That user no longer exists.',
					'already-editor': 'This user is already an editor.',
					'cannot-add-self': "You can't add yourself as an editor.",
					'user-is-child': "Child accounts can't be editors.",
					'not-owner': "You don't own this list.",
					'list-not-found': 'This list no longer exists.',
				}
				toast.error(msg[result.reason])
				return
			}
			toast.success(`${picked.name || picked.email} added as editor`)
			setSelectedUserId('')
			await router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to add editor')
		} finally {
			setSubmitting(false)
		}
	}

	async function handleRemove() {
		if (!removeTarget) return
		setRemoving(true)
		try {
			const result = await removeListEditor({ data: { editorId: removeTarget.id } })
			if (result.kind === 'error') {
				toast.error(result.reason === 'not-owner' ? "You don't own this list." : 'Editor not found.')
				return
			}
			toast.success(`${removeTarget.user.name || removeTarget.user.email} removed as editor`)
			setRemoveTarget(null)
			await router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to remove editor')
		} finally {
			setRemoving(false)
		}
	}

	const pickedIsChild = selectedUserId.length > 0 && addableUsers.find(u => u.id === selectedUserId)?.role === 'child'

	return (
		<div className="flex flex-col gap-3">
			<h2 className="text-lg font-semibold">Editors</h2>

			{/* Inline add row */}
			<div className="flex flex-col gap-2">
				<Label htmlFor="add-editor-select" className="text-sm font-medium">
					Add an editor
				</Label>
				{addableUsers.length === 0 ? (
					<p className="text-sm text-muted-foreground">No other users are available to add.</p>
				) : (
					<div className="flex items-center gap-2">
						<Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={submitting}>
							<SelectTrigger id="add-editor-select" className="w-full flex-1">
								<SelectValue placeholder="Choose a user…" />
							</SelectTrigger>
							<SelectContent>
								{addableUsers.map(u => {
									const display = u.name || u.email
									const isChild = u.role === 'child'
									const suffix = isChild ? ' (child)' : u.name ? ` — ${u.email}` : ''
									return (
										<SelectItem key={u.id} value={u.id} disabled={isChild}>
											{display}
											{suffix}
										</SelectItem>
									)
								})}
							</SelectContent>
						</Select>
						<Button type="button" size="sm" onClick={handleAdd} disabled={submitting || !selectedUserId || pickedIsChild}>
							<UserPlus className="size-4" />
							{submitting ? 'Adding…' : 'Add'}
						</Button>
					</div>
				)}
			</div>

			{editors.length === 0 ? (
				<p className="text-sm text-muted-foreground">No editors yet. Add someone to let them manage items on this list.</p>
			) : (
				<div className="flex flex-col overflow-hidden divide-y rounded-xl bg-card shadow-sm ring-1 ring-foreground/10 text-card-foreground">
					{editors.map(editor => {
						const name = editor.user.name || editor.user.email
						return (
							<div key={editor.id} className="flex flex-row items-center gap-3 p-3 hover:bg-muted">
								<UserAvatar name={name} image={editor.user.image} size="small" />
								<div className="flex flex-col flex-1 min-w-0">
									<span className="text-sm font-medium truncate">{name}</span>
									{editor.user.name && <span className="text-xs truncate text-muted-foreground">{editor.user.email}</span>}
								</div>
								<Button
									size="sm"
									variant="ghost"
									onClick={() => setRemoveTarget(editor)}
									title="Remove editor"
									className="text-destructive hover:text-destructive"
								>
									<X className="size-4" />
								</Button>
							</div>
						)
					})}
				</div>
			)}

			{/* Remove editor confirm */}
			<AlertDialog
				open={!!removeTarget}
				onOpenChange={o => {
					if (!o) setRemoveTarget(null)
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove editor?</AlertDialogTitle>
						<AlertDialogDescription>
							{removeTarget?.user.name || removeTarget?.user.email} will no longer be able to edit this list.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleRemove} disabled={removing}>
							{removing ? 'Removing…' : 'Yes, remove'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
