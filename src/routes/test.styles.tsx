import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { createFileRoute } from '@tanstack/react-router'
import { FlaskConical } from 'lucide-react'

export const Route = createFileRoute('/test/styles')({
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<div className="flex flex-col flex-1 w-full max-w-5xl px-2 animate-page-in">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Test Styles</h1>
					<FlaskConical className="size-18 text-blue-500 opacity-30 absolute left-4 -top-4 -z-10" />
				</div>
				{/* CONTENT */}
				<LoadingSkeleton />
			</div>
		</div>
	)
}
