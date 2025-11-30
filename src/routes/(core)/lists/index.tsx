import { Skeleton } from '@/components/ui/skeleton'
import { createFileRoute } from '@tanstack/react-router'
import { ListChecks } from 'lucide-react'

export const Route = createFileRoute('/(core)/lists/')({
	component: ListsPage,
})

export default function ListsPage() {
	// await new Promise(resolve => setTimeout(resolve, 5000))
	return (
		<div className="flex flex-col flex-1 w-full max-w-5xl px-2 animate-page-in">
			<div className="relative flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<h1 className="flex flex-row items-center gap-2">Wish Lists</h1>
				<ListChecks className="size-18 text-green-500 opacity-30 absolute left-4 -top-4 -z-10" />
				{/* DESCRIPTION */}
				{/*  */}
				{/* CONTENT */}
				<Skeleton className="h-10 w-full" />
				{/* <Suspense fallback={<FallbackRowsMultiple />}> */}
				{/* <ListsByUser /> */}
				{/* </Suspense> */}
			</div>
		</div>
	)
}
