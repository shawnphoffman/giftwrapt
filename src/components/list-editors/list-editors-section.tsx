import { useRouter } from '@tanstack/react-router'
import { UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import type { EditorOnList } from '@/api/list-editors'
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
	listId: number
	editors: Array<EditorOnList>
}

export function ListEditorsSection({ listId, editors }: Props) {
	const router = useRouter()
	const [addDialogOpen, setAddDialogOpen] = useState(false)
	const [removeTarget, setRemoveTarget] = useState<EditorOnList | null>(null)
	const [email, setEmail] = useState('')
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [removing, setRemoving] = useState(false)

	async function handleAdd() {
		if (!email.trim()) return
		setSubmitting(true)
		setError(null)
		try {
			const result = await addListEditor({ data: { listId, email: email.trim() } })
			if (result.kind === 'error') {
				switch (result.reason) {
					case 'user-not-found':
						setError('No user found with that email.')
						break
					case 'already-editor':
						setError('This user is already an editor.')
						break
					case 'cannot-add-self':
						setError("You can't add yourself as an editor.")
						break
					case 'not-owner':
						setError("You don't own this list.")
						break
					case 'list-not-found':
						setError('This list no longer exists.')
						break
				}
				return
			}
			toast.success(`${result.editor.user.name || result.editor.user.email} added as editor`)
			setAddDialogOpen(false)
			setEmail('')
			await router.invalidate()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to add editor')
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

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-row items-center justify-between">
				<h2 className="text-lg font-semibold">Editors</h2>
				<Button size="sm" variant="outline" onClick={() => setAddDialogOpen(true)}>
					<UserPlus className="size-4" />
					Add editor
				</Button>
			</div>

			{editors.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No editors yet. Add someone to let them manage items on this list.
				</p>
			) : (
				<div className="flex flex-col overflow-hidden border divide-y rounded-lg shadow-sm text-card-foreground bg-accent">
					{editors.map(editor => {
						const name = editor.user.name || editor.user.email
						return (
							<div key={editor.id} className="flex flex-row items-center gap-3 p-3 hover:bg-muted">
								<UserAvatar name={name} image={editor.user.image} size="small" />
								<div className="flex flex-col flex-1 min-w-0">
									<span className="text-sm font-medium truncate">{name}</span>
									{editor.user.name && (
										<span className="text-xs truncate text-muted-foreground">{editor.user.email}</span>
									)}
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

			{/* Add editor dialog */}
			<Dialog open={addDialogOpen} onOpenChange={o => { setAddDialogOpen(o); if (!o) { setEmail(''); setError(null) } }}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add an editor</DialogTitle>
						<DialogDescription>Enter the email of the person you want to grant edit access to this list.</DialogDescription>
					</DialogHeader>
					<form
						onSubmit={e => {
							e.preventDefault()
							handleAdd()
						}}
						className="space-y-4"
					>
						<div className="grid gap-2">
							<Label htmlFor="editor-email">Email</Label>
							<Input
								id="editor-email"
								type="email"
								placeholder="name@example.com"
								value={email}
								onChange={e => setEmail(e.target.value)}
								disabled={submitting}
							/>
							{error && <p className="text-destructive text-sm">{error}</p>}
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)} disabled={submitting}>
								Cancel
							</Button>
							<Button type="submit" disabled={submitting || !email.trim()}>
								{submitting ? 'Adding\u2026' : 'Add'}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* Remove editor confirm */}
			<AlertDialog open={!!removeTarget} onOpenChange={o => { if (!o) setRemoveTarget(null) }}>
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
							{removing ? 'Removing\u2026' : 'Yes, remove'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
