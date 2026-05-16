// Minimal todo-list surface for lists of type='todos'. Branches off the
// shared list detail page. No spoiler filtering: any viewer sees the
// claimer immediately. Claim ≡ done; clicking the row toggles state.
//
// This is the v1 surface - a richer one (priority badges, drag-to-
// reorder, markdown notes preview) can layer on top once the basic
// CRUD flow is shipped and validated.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { createTodo, deleteTodo, listTodos, type TodoRow, toggleTodoClaim } from '@/api/todos'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

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
				{todo.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{todo.notes}</p>}
				{done && todo.claimedByName && <p className="text-xs text-muted-foreground">Done by {todo.claimedByName}</p>}
			</div>
			{canEdit && (
				<>
					<Button variant="destructive" size="xs" onClick={() => setConfirmDeleteOpen(true)} disabled={remove.isPending}>
						Delete
					</Button>
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
	const qc = useQueryClient()
	const [open, setOpen] = useState(false)
	const [title, setTitle] = useState('')
	const [notes, setNotes] = useState('')

	const create = useMutation({
		mutationFn: async () => {
			const result = await createTodo({
				data: { listId, title: title.trim(), notes: notes.trim() || undefined },
			})
			if (result.kind === 'error') throw new Error(result.reason)
			return result.todo
		},
		onSuccess: () => {
			setTitle('')
			setNotes('')
			setOpen(false)
			qc.invalidateQueries({ queryKey: todosQueryKey(listId) })
		},
		onError: err => toast.error(err instanceof Error ? err.message : 'Failed to create todo'),
	})

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="default" size="sm" className="self-end">
					<Plus className="size-4" /> <span className="xs:hidden">Add</span>
					<span className="hidden xs:inline">Add ToDo</span>
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add ToDo</DialogTitle>
					<DialogDescription>Markdown rendered in notes. URLs go in notes.</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="todo-title">Title</Label>
						<Input id="todo-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={500} autoFocus />
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="todo-notes">Notes</Label>
						<Textarea id="todo-notes" value={notes} onChange={e => setNotes(e.target.value)} maxLength={10000} rows={4} />
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button onClick={() => create.mutate()} disabled={!title.trim() || create.isPending}>
						{create.isPending ? 'Adding...' : 'Add'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
