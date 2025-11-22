import { createFileRoute } from '@tanstack/react-router'
// import { Suspense } from 'react'

export const Route = createFileRoute('/')({ component: App })

function App() {
	return (
		<div className="">
			<header className="top-0 z-10 flex items-center h-12 gap-2 shrink-0">
				<div className="flex items-center gap-2 px-4">
					<h1>TanStack Start Starter</h1>
				</div>
			</header>
			<div className="flex flex-col items-center flex-1 gap-4 p-4 pt-2">
				<h1>TanStack Start Starter</h1>
			</div>
		</div>
	)
}
