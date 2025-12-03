import { createFileRoute } from '@tanstack/react-router'
import { User } from 'lucide-react'

export const Route = createFileRoute('/(core)/admin/user/$id')({
	component: RouteComponent,
})

function RouteComponent() {
	const { id } = Route.useParams()
	return (
		<div className="flex flex-col flex-1 w-full max-w-2xl px-2 animate-page-in">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2 text-red-500">User Details</h1>
					<User className="size-18 text-red-500/30 absolute left-4 -top-4 -z-10" />
				</div>
				<div> {id}</div>
			</div>
		</div>
	)
}
