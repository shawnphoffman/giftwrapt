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
import { m } from '@/paraglide/messages.js'

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
					'user-not-found': m.lists_editors_error_user_not_found(),
					'already-editor': m.lists_editors_error_already_editor(),
					'cannot-add-self': m.lists_editors_error_cannot_add_self(),
					'user-is-child': m.lists_editors_error_user_is_child(),
					'user-is-restricted': m.lists_editors_error_user_is_restricted(),
					'not-owner': m.lists_editors_error_not_owner(),
					'list-not-found': m.lists_editors_error_list_not_found(),
				}
				toast.error(msg[result.reason])
				return
			}
			toast.success(m.lists_editors_added({ name: picked.name || picked.email }))
			setSelectedUserId('')
			await router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : m.lists_editors_add_failed())
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
				toast.error(result.reason === 'not-owner' ? m.lists_editors_error_not_owner() : m.lists_editors_error_editor_not_found())
				return
			}
			toast.success(m.lists_editors_removed({ name: removeTarget.user.name || removeTarget.user.email }))
			setRemoveTarget(null)
			await router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : m.lists_editors_remove_failed())
		} finally {
			setRemoving(false)
		}
	}

	const pickedIsChild = selectedUserId.length > 0 && addableUsers.find(u => u.id === selectedUserId)?.role === 'child'

	return (
		<div className="flex flex-col gap-3">
			<h2 className="text-lg font-semibold">{m.lists_editors_heading()}</h2>

			{/* Inline add row */}
			<div className="flex flex-col gap-2">
				<Label htmlFor="add-editor-select" className="text-sm font-medium">
					{m.lists_editors_add_label()}
				</Label>
				{addableUsers.length === 0 ? (
					<p className="text-sm text-muted-foreground">{m.lists_editors_none_available()}</p>
				) : (
					<div className="flex items-center gap-2">
						<Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={submitting}>
							<SelectTrigger id="add-editor-select" className="w-full flex-1">
								<SelectValue placeholder={m.lists_editors_select_placeholder()} />
							</SelectTrigger>
							<SelectContent>
								{addableUsers.map(u => {
									const display = u.name || u.email
									const isChild = u.role === 'child'
									const optionLabel = isChild
										? m.lists_editors_option_child({ name: display })
										: u.name
											? m.lists_editors_option_with_email({ name: display, email: u.email })
											: display
									return (
										<SelectItem key={u.id} value={u.id} disabled={isChild}>
											<UserAvatar name={display} image={u.image} size="small" />
											<span className="truncate">{optionLabel}</span>
										</SelectItem>
									)
								})}
							</SelectContent>
						</Select>
						<Button type="button" size="sm" onClick={handleAdd} disabled={submitting || !selectedUserId || pickedIsChild}>
							<UserPlus className="size-4" />
							{submitting ? m.lists_editors_add_busy() : m.action_add()}
						</Button>
					</div>
				)}
			</div>

			{editors.length === 0 ? (
				<p className="text-sm text-muted-foreground">{m.lists_editors_empty()}</p>
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
									variant="outline"
									onClick={() => setRemoveTarget(editor)}
									title={m.lists_editors_remove_title()}
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
						<AlertDialogTitle>{m.lists_editors_remove_confirm_title()}</AlertDialogTitle>
						<AlertDialogDescription>
							{m.lists_editors_remove_confirm_description({ name: removeTarget?.user.name || removeTarget?.user.email || '' })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={removing}>{m.action_cancel()}</AlertDialogCancel>
						<AlertDialogAction onClick={handleRemove} disabled={removing}>
							{removing ? m.lists_editors_remove_busy() : m.lists_editors_remove_confirm_button()}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
