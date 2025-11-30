import { Skeleton } from '@/components/ui/skeleton'
import { createFileRoute } from '@tanstack/react-router'
import { Lock } from 'lucide-react'

export const Route = createFileRoute('/(core)/admin/')({
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<div className="flex flex-col flex-1 w-full max-w-5xl px-2 animate-page-in">
			<div className="relative flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<h1 className="flex flex-row items-center gap-2 text-red-500">Admin</h1>
				<Lock className="size-18 text-red-500 opacity-30 absolute left-4 -top-4 -z-10" />
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
