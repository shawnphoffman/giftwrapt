import { createFileRoute } from '@tanstack/react-router'
import { User } from 'lucide-react'

import { EditUserForm } from '@/components/admin/edit-user-form'

export const Route = createFileRoute('/(core)/admin/user/$id')({
	component: UserDetailsPage,
})

function UserDetailsPage() {
	const { id } = Route.useParams()

	return (
		<div className="flex flex-col flex-1 w-full max-w-2xl px-2 animate-page-in">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2 text-red-500">Edit User</h1>
					<User className="size-22 -left-4 -top-6 text-red-500/30 absolute -z-10" />
				</div>
				<EditUserForm userId={id} />
			</div>
		</div>
	)
}
