// Minimal todo-list surface for lists of type='todos'. Branches off the
// shared list detail page. No spoiler filtering: any viewer sees the
// claimer immediately. Claim ≡ done; clicking the row toggles state.
//
// This is the v1 surface - a richer one (priority badges, drag-to-
// reorder, markdown notes preview) can layer on top once the basic
// CRUD flow is shipped and validated.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { createTodo, deleteTodo, listTodos, type TodoRow, toggleTodoClaim, updateTodo } from '@/api/todos'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import { MarkdownTextarea } from '@/components/common/markdown-textarea'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const todosQueryKey = (listId: number) => ['todos', listId] as const

function useTodos(listId: number) {
	return useQuery({
		queryKey: todosQueryKey(listId),
		queryFn: async () => {
			const result = await listTodos({ data: { listId } })
			if (result.kind === 'error') throw new Error(result.reason)
			return result.todos
		},
	})
}

export function TodoList({ listId, canEdit }: { listId: number; canEdit: boolean }) {
	const { data: todos, isLoading } = useTodos(listId)

	if (isLoading) return <div className="text-sm text-muted-foreground">Loading...</div>
	if (!todos || todos.length === 0) {
		return (
			<div className="flex flex-col gap-3">
				{canEdit && <AddTodoDialog listId={listId} />}
				<p className="text-sm text-muted-foreground">No todos yet.</p>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-3">
			{canEdit && <AddTodoDialog listId={listId} />}
			<ul className="flex flex-col gap-2">
				{todos.map(todo => (
					<TodoRowItem key={todo.id} todo={todo} listId={listId} canEdit={canEdit} />
				))}
			</ul>
		</div>
	)
}

function TodoRowItem({ todo, listId, canEdit }: { todo: TodoRow; listId: number; canEdit: boolean }) {
	const qc = useQueryClient()
	const done = todo.claimedByUserId !== null
	const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
	const [editOpen, setEditOpen] = useState(false)

	const toggle = useMutation({
		mutationFn: async () => {
			const result = await toggleTodoClaim({ data: { todoId: todo.id } })
			if (result.kind === 'error') throw new Error(result.reason)
			return result.todo
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: todosQueryKey(listId) }),
		onError: err => toast.error(err instanceof Error ? err.message : 'Failed to update todo'),
	})

	const remove = useMutation({
		mutationFn: async () => {
			const result = await deleteTodo({ data: { todoId: todo.id } })
			if (result.kind === 'error') throw new Error(result.reason)
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: todosQueryKey(listId) }),
		onError: err => toast.error(err instanceof Error ? err.message : 'Failed to delete todo'),
	})

	return (
		<li className="relative z-10 flex items-start gap-2 p-2 ps-4 ring-1 ring-inset ring-border rounded-lg bg-card shadow-sm">
			<button
				type="button"
				onClick={() => toggle.mutate()}
				disabled={toggle.isPending}
				className={`mt-0.5 size-5 shrink-0 rounded border-2 ${done ? 'border-primary bg-primary' : 'border-muted-foreground/30 bg-transparent'}`}
				aria-label={done ? 'Mark not done' : 'Mark done'}
			/>
			<div className="flex-1 min-w-0">
				<p className={`font-medium ${done ? 'line-through text-muted-foreground' : ''}`}>{todo.title}</p>
				{todo.notes && <MarkdownNotes content={todo.notes} className="text-sm text-muted-foreground" />}
				{done && todo.claimedByName && <p className="text-xs text-muted-foreground">Done by {todo.claimedByName}</p>}
			</div>
			{canEdit && (
				<>
					<Button variant="outline" size="icon-xs" onClick={() => setEditOpen(true)} aria-label="Edit todo">
						<Pencil />
					</Button>
					<Button
						variant="destructive"
						size="icon-xs"
						onClick={() => setConfirmDeleteOpen(true)}
						disabled={remove.isPending}
						aria-label="Delete todo"
					>
						<Trash2 />
					</Button>
					<TodoFormDialog mode="edit" listId={listId} todo={todo} open={editOpen} onOpenChange={setEditOpen} />
					<ConfirmDialog
						open={confirmDeleteOpen}
						onOpenChange={setConfirmDeleteOpen}
						title="Delete this todo?"
						description={`"${todo.title}" will be permanently removed. This can't be undone.`}
						confirmLabel="Delete"
						confirmBusyLabel="Deleting…"
						destructive
						onConfirm={() => remove.mutateAsync()}
					/>
				</>
			)}
		</li>
	)
}

function AddTodoDialog({ listId }: { listId: number }) {
	const [open, setOpen] = useState(false)
	return (
		<>
			<Button variant="default" size="sm" className="self-end" onClick={() => setOpen(true)}>
				<Plus className="size-4" /> <span className="xs:hidden">Add</span>
				<span className="hidden xs:inline">Add ToDo</span>
			</Button>
			<TodoFormDialog mode="create" listId={listId} open={open} onOpenChange={setOpen} />
		</>
	)
}

type TodoFormDialogProps =
	| { mode: 'create'; listId: number; open: boolean; onOpenChange: (open: boolean) => void; todo?: undefined }
	| { mode: 'edit'; listId: number; todo: TodoRow; open: boolean; onOpenChange: (open: boolean) => void }

function TodoFormDialog({ mode, listId, todo, open, onOpenChange }: TodoFormDialogProps) {
	const qc = useQueryClient()
	const [title, setTitle] = useState(todo?.title ?? '')
	const [notes, setNotes] = useState(todo?.notes ?? '')

	const save = useMutation({
		mutationFn: async () => {
			const trimmedTitle = title.trim()
			const trimmedNotes = notes.trim()
			if (mode === 'create') {
				const result = await createTodo({
					data: { listId, title: trimmedTitle, notes: trimmedNotes || undefined },
				})
				if (result.kind === 'error') throw new Error(result.reason)
				return result.todo
			}
			const result = await updateTodo({
				data: { todoId: todo.id, title: trimmedTitle, notes: trimmedNotes ? trimmedNotes : null },
			})
			if (result.kind === 'error') throw new Error(result.reason)
			return result.todo
		},
		onSuccess: () => {
			onOpenChange(false)
			qc.invalidateQueries({ queryKey: todosQueryKey(listId) })
		},
		onError: err => toast.error(err instanceof Error ? err.message : `Failed to ${mode === 'create' ? 'create' : 'update'} todo`),
	})

	useEffect(() => {
		if (open) {
			setTitle(todo?.title ?? '')
			setNotes(todo?.notes ?? '')
		}
	}, [open, todo?.title, todo?.notes])

	const isCreate = mode === 'create'
	const titleId = `todo-title-${isCreate ? 'new' : todo.id}`
	const notesId = `todo-notes-${isCreate ? 'new' : todo.id}`

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{isCreate ? 'Add ToDo' : 'Edit ToDo'}</DialogTitle>
					<DialogDescription>Markdown rendered in notes. URLs go in notes.</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={titleId}>Title</Label>
						<Input id={titleId} value={title} onChange={e => setTitle(e.target.value)} maxLength={500} autoFocus />
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={notesId}>Notes</Label>
						<MarkdownTextarea id={notesId} value={notes} onChange={setNotes} maxLength={10000} rows={4} />
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={() => save.mutate()} disabled={!title.trim() || save.isPending}>
						{save.isPending ? (isCreate ? 'Adding...' : 'Saving...') : isCreate ? 'Add' : 'Save'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
