import { useEffect, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'
import { todosCollection } from '@/db-collections/todos'
import type { Todo } from '@/db-collections/todos'

// Sync client collection with server via API
function useSyncTodos() {
	const syncedRef = useRef(false)

	useEffect(() => {
		if (syncedRef.current) return
		syncedRef.current = true

		const syncTodos = async () => {
			try {
				const response = await fetch('/demo/drizzle-api')
				if (!response.ok) {
					throw new Error('Failed to fetch todos')
				}
				const todosData = await response.json()

				// Remove all existing todos and insert new ones
				// We need to get all existing keys first
				const existingKeys = new Set<number>()
				for (const [_key, _value] of todosCollection.state) {
					existingKeys.add(_key)
				}

				// Delete existing todos
				for (const key of existingKeys) {
					todosCollection.delete(key)
				}

				// Insert new todos
				for (const todo of todosData) {
					todosCollection.insert(todo)
				}
			} catch (error) {
				console.error('Failed to sync todos:', error)
			}
		}

		syncTodos()
	}, [])
}

export const Route = createFileRoute('/demo/drizzle')({
	component: DemoDrizzle,
})

function DemoDrizzle() {
	// Sync collection with server on mount
	useSyncTodos()

	// Use useLiveQuery to reactively query the collection
	const { data: todos = [] } = useLiveQuery(q =>
		q
			.from({ todo: todosCollection })
			.select(({ todo }) => ({
				...todo,
			}))
			.orderBy(({ todo }) => [todo.createdAt, 'desc'])
	)

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		const formData = new FormData(e.target as HTMLFormElement)
		const title = formData.get('title') as string

		if (!title) return

		try {
			const response = await fetch('/demo/drizzle-api', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title }),
			})

			if (!response.ok) {
				throw new Error('Failed to create todo')
			}

			const newTodo = await response.json()
			// Insert into collection - useLiveQuery will automatically update
			todosCollection.insert(newTodo)
			;(e.target as HTMLFormElement).reset()
		} catch (error) {
			console.error('Failed to create todo:', error)
		}
	}

	return (
		<div
			className="flex items-center justify-center min-h-screen p-4 text-white"
			style={{
				background: 'linear-gradient(135deg, #0c1a2b 0%, #1a2332 50%, #16202e 100%)',
			}}
		>
			<div
				className="w-full max-w-2xl p-8 rounded-xl shadow-2xl border border-white/10"
				style={{
					background: 'linear-gradient(135deg, rgba(22, 32, 46, 0.95) 0%, rgba(12, 26, 43, 0.95) 100%)',
					backdropFilter: 'blur(10px)',
				}}
			>
				<div
					className="flex items-center justify-center gap-4 mb-8 p-4 rounded-lg"
					style={{
						background: 'linear-gradient(90deg, rgba(93, 103, 227, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
						border: '1px solid rgba(93, 103, 227, 0.2)',
					}}
				>
					<div className="relative group">
						<div className="absolute -inset-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 rounded-lg blur-lg opacity-60 group-hover:opacity-100 transition duration-500"></div>
						<div className="relative bg-gradient-to-br from-indigo-600 to-purple-600 p-3 rounded-lg">
							<img
								src="/drizzle.svg"
								alt="Drizzle Logo"
								className="w-8 h-8 transform group-hover:scale-110 transition-transform duration-300"
							/>
						</div>
					</div>
					<h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-indigo-300 text-transparent bg-clip-text">
						Drizzle Database Demo
					</h1>
				</div>

				<h2 className="text-2xl font-bold mb-4 text-indigo-200">Todos</h2>

				<ul className="space-y-3 mb-6">
					{todos.map((todo: Todo) => (
						<li
							key={todo.id}
							className="rounded-lg p-4 shadow-md border transition-all hover:scale-[1.02] cursor-pointer group"
							style={{
								background: 'linear-gradient(135deg, rgba(93, 103, 227, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%)',
								borderColor: 'rgba(93, 103, 227, 0.3)',
							}}
						>
							<div className="flex items-center justify-between">
								<span className="text-lg font-medium text-white group-hover:text-indigo-200 transition-colors">{todo.title}</span>
								<span className="text-xs text-indigo-300/70">#{todo.id}</span>
								<span>{todo.creator?.displayName}</span>
							</div>
						</li>
					))}
					{todos.length === 0 && <li className="text-center py-8 text-indigo-300/70">No todos yet. Create one below!</li>}
				</ul>

				<form onSubmit={handleSubmit} className="flex gap-2">
					<input
						type="text"
						name="title"
						placeholder="Add a new todo..."
						className="flex-1 px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 transition-all text-white placeholder-indigo-300/50"
						style={{
							background: 'rgba(93, 103, 227, 0.1)',
							borderColor: 'rgba(93, 103, 227, 0.3)',
							// focusRing: 'rgba(93, 103, 227, 0.5)',
						}}
					/>
					<button
						type="submit"
						className="px-6 py-3 font-semibold rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 active:scale-95 whitespace-nowrap"
						style={{
							background: 'linear-gradient(135deg, #5d67e3 0%, #8b5cf6 100%)',
							color: 'white',
						}}
					>
						Add Todo
					</button>
				</form>

				<div
					className="mt-8 p-6 rounded-lg border"
					style={{
						background: 'rgba(93, 103, 227, 0.05)',
						borderColor: 'rgba(93, 103, 227, 0.2)',
					}}
				>
					<h3 className="text-lg font-semibold mb-2 text-indigo-200">Powered by Drizzle ORM</h3>
					<p className="text-sm text-indigo-300/80 mb-4">Next-generation ORM for Node.js & TypeScript with PostgreSQL</p>
					<div className="space-y-2 text-sm">
						<p className="text-indigo-200 font-medium">Setup Instructions:</p>
						<ol className="list-decimal list-inside space-y-2 text-indigo-300/80">
							<li>
								Configure your <code className="px-2 py-1 rounded bg-black/30 text-purple-300">DATABASE_URL</code> in .env.local
							</li>
							<li>
								Run: <code className="px-2 py-1 rounded bg-black/30 text-purple-300">npx drizzle-kit generate</code>
							</li>
							<li>
								Run: <code className="px-2 py-1 rounded bg-black/30 text-purple-300">npx drizzle-kit migrate</code>
							</li>
							<li>
								Optional: <code className="px-2 py-1 rounded bg-black/30 text-purple-300">npx drizzle-kit studio</code>
							</li>
						</ol>
					</div>
				</div>
			</div>
		</div>
	)
}
