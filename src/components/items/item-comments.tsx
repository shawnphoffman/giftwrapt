import { useQuery } from '@tanstack/react-query'
import { MessageSquare, Pencil, Trash2 } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { type KeyboardEvent, useState } from 'react'
import { toast } from 'sonner'

import { type CommentWithUser, createItemComment, deleteItemComment, getCommentsForItem, updateItemComment } from '@/api/comments'
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
import { Textarea } from '@/components/ui/textarea'
import { useSession } from '@/lib/auth-client'

type Props = {
	itemId: number
	commentCount?: number
}

function isSubmitShortcut(e: KeyboardEvent) {
	return (e.metaKey || e.ctrlKey) && e.key === 'Enter'
}

export function ItemComments({ itemId, commentCount = 0 }: Props) {
	const [expanded, setExpanded] = useState(false)
	const session = useSession()
	const currentUserId = session.data?.user.id
	const prefersReducedMotion = useReducedMotion()
	const duration = prefersReducedMotion ? 0 : 0.18

	const { data: comments, refetch } = useQuery({
		queryKey: ['item-comments', itemId],
		queryFn: () => getCommentsForItem({ data: { itemId } }),
		enabled: expanded,
	})

	const [newComment, setNewComment] = useState('')
	const [submitting, setSubmitting] = useState(false)

	const handleSubmit = async () => {
		if (!newComment.trim()) return
		setSubmitting(true)
		try {
			const result = await createItemComment({ data: { itemId, comment: newComment.trim() } })
			if (result.kind === 'ok') {
				setNewComment('')
				await refetch()
				toast.success('Comment added')
			}
		} catch {
			toast.error('Failed to add comment')
		} finally {
			setSubmitting(false)
		}
	}

	const displayCount = comments?.length ?? commentCount

	return (
		<div className="flex flex-col gap-2">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-fit"
			>
				<MessageSquare className="size-3.5" />
				{displayCount > 0 ? `${displayCount} comment${displayCount !== 1 ? 's' : ''}` : 'Add comment'}
			</button>

			<AnimatePresence initial={false}>
				{expanded && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration, ease: 'easeOut' }}
						className="overflow-hidden"
					>
						<div className="flex flex-col gap-2 pl-2 border-l-2 border-muted">
							<AnimatePresence initial={false}>
								{comments?.map(c => (
									<motion.div
										key={c.id}
										layout
										initial={{ opacity: 0, y: -4 }}
										animate={{ opacity: 1, y: 0 }}
										exit={{ opacity: 0, y: -4 }}
										transition={{ duration, ease: 'easeOut' }}
									>
										<CommentRow comment={c} currentUserId={currentUserId} onDeleted={refetch} />
									</motion.div>
								))}
							</AnimatePresence>

							<div className="flex gap-2">
								<Textarea
									placeholder="Write a comment..."
									rows={2}
									value={newComment}
									onChange={e => setNewComment(e.target.value)}
									onKeyDown={e => {
										if (isSubmitShortcut(e)) {
											e.preventDefault()
											void handleSubmit()
										}
									}}
									disabled={submitting}
									className="text-sm"
								/>
								<div className="flex flex-col items-end gap-1">
									<Button size="sm" onClick={handleSubmit} disabled={submitting || !newComment.trim()}>
										{submitting ? '...' : 'Post'}
									</Button>
									<kbd className="hidden sm:inline-flex text-[10px] text-muted-foreground font-mono">⌘↵</kbd>
								</div>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}

function CommentRow({
	comment,
	currentUserId,
	onDeleted,
}: {
	comment: CommentWithUser
	currentUserId: string | undefined
	onDeleted: () => void
}) {
	const [editing, setEditing] = useState(false)
	const [editText, setEditText] = useState(comment.comment)
	const [saving, setSaving] = useState(false)
	const [deleteOpen, setDeleteOpen] = useState(false)
	const prefersReducedMotion = useReducedMotion()
	const duration = prefersReducedMotion ? 0 : 0.15

	const isOwn = comment.user.id === currentUserId
	const name = comment.user.name || comment.user.email

	const handleSave = async () => {
		if (!editText.trim()) return
		setSaving(true)
		try {
			const result = await updateItemComment({ data: { commentId: comment.id, comment: editText.trim() } })
			if (result.kind === 'ok') {
				setEditing(false)
				onDeleted() // refetch
				toast.success('Comment updated')
			}
		} catch {
			toast.error('Failed to update')
		} finally {
			setSaving(false)
		}
	}

	const handleDelete = async () => {
		const result = await deleteItemComment({ data: { commentId: comment.id } })
		if (result.kind === 'ok') {
			onDeleted()
			toast.success('Comment deleted')
		}
		setDeleteOpen(false)
	}

	return (
		<>
			<div className="flex gap-2 text-sm group">
				<UserAvatar name={name} image={comment.user.image} size="small" />
				<div className="flex-1 min-w-0">
					<div className="flex items-baseline gap-1.5">
						<span className="font-medium text-xs">{name}</span>
						<span className="text-xs text-muted-foreground">{new Date(comment.createdAt).toLocaleDateString()}</span>
					</div>
					<AnimatePresence mode="wait" initial={false}>
						{editing ? (
							<motion.div
								key="editor"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration }}
								className="flex gap-1 mt-1"
							>
								<Textarea
									value={editText}
									onChange={e => setEditText(e.target.value)}
									onKeyDown={e => {
										if (isSubmitShortcut(e)) {
											e.preventDefault()
											void handleSave()
										}
									}}
									rows={2}
									disabled={saving}
									className="text-sm"
								/>
								<div className="flex flex-col gap-1">
									<Button size="sm" variant="ghost" onClick={handleSave} disabled={saving}>
										Save
									</Button>
									<Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
										Cancel
									</Button>
								</div>
							</motion.div>
						) : (
							<motion.p
								key="display"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration }}
								className="text-foreground/80 whitespace-pre-wrap"
							>
								{comment.comment}
							</motion.p>
						)}
					</AnimatePresence>
				</div>
				{isOwn && !editing && (
					<div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
						<Button variant="ghost" size="icon" className="size-6" onClick={() => setEditing(true)}>
							<Pencil className="size-3" />
						</Button>
						<Button variant="ghost" size="icon" className="size-6" onClick={() => setDeleteOpen(true)}>
							<Trash2 className="size-3" />
						</Button>
					</div>
				)}
			</div>

			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete comment?</AlertDialogTitle>
						<AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
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
