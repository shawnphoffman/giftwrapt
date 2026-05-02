import { createFileRoute } from '@tanstack/react-router'
import { ListChecks } from 'lucide-react'

import { ListsByUser } from '@/components/lists/lists-by-user'
import { PrimaryListNudge } from '@/components/lists/primary-list-nudge'

export const Route = createFileRoute('/(core)/')({
	component: ListsPage,
})

export default function ListsPage() {
	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Wish Lists</h1>
					<ListChecks className="text-green-500 wish-page-icon" />
				</div>
				{/* CONTENT */}
				<PrimaryListNudge />
				<ListsByUser />
			</div>
		</div>
	)
}
