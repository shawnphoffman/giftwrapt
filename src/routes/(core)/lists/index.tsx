import { createFileRoute } from '@tanstack/react-router'
import { ListChecks } from 'lucide-react'
import { ListsByUser } from '@/components/lists/lists-by-user'

export const Route = createFileRoute('/(core)/lists/')({
	component: ListsPage,
})

export default function ListsPage() {
	return (
		<div className="flex flex-col flex-1 w-full max-w-5xl px-2 animate-page-in">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Wish Lists</h1>
					<ListChecks className="size-18 text-green-500 opacity-30 absolute left-4 -top-4 -z-10" />
				</div>
				{/* DESCRIPTION */}
				{/*  */}
				{/* CONTENT */}
				<ListsByUser />
			</div>
		</div>
	)
}
