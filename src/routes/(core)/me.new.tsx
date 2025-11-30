import { createFileRoute } from '@tanstack/react-router'
import { ListPlus } from 'lucide-react'

export const Route = createFileRoute('/(core)/me/new')({
	component: NewListPage,
})

function NewListPage() {
	return (
		<div className="flex flex-col flex-1 w-full max-w-5xl px-2 animate-page-in">
			<main className="flex flex-col flex-1 gap-8 divide-y">
				{/* LISTS */}
				<div className="flex flex-col gap-8">
					{/* Header */}
					<div className="relative flex flex-row flex-wrap justify-between gap-2">
						<h1 className="flex flex-row items-center gap-2">Create New List</h1>
						<ListPlus className="size-18 text-yellow-500 opacity-30 absolute left-4 -top-4 -z-10" />
						{/* <div className="flex flex-row flex-wrap justify-end flex-1 gap-0.5 items-center md:justify-end shrink-0">
							{/* <NewListButton /> */}
						{/* </div> */}
					</div>
				</div>
			</main>
		</div>
	)
}
