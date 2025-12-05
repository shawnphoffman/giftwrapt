import { createFileRoute } from '@tanstack/react-router'
import { FlaskConical } from 'lucide-react'
import { toast } from 'sonner'

import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/(core)/test/styles')({
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<div className="flex flex-col flex-1 w-full max-w-5xl px-2 animate-page-in">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Test Styles</h1>
					<FlaskConical className="size-22 -left-4 -top-6 text-blue-500 opacity-30 absolute -z-10" />
				</div>
				{/* CONTENT */}
				<LoadingSkeleton />
				<div className="flex flex-row gap-2">
					<Button variant="default" onClick={() => toast.success('Success')}>
						default
					</Button>
					<Button variant="outline" onClick={() => toast.success('Success')}>
						outline
					</Button>
					<Button variant="secondary" onClick={() => toast.success('Success')}>
						secondary
					</Button>
					<Button variant="ghost" onClick={() => toast.success('Success')}>
						ghost
					</Button>
					<Button variant="link" onClick={() => toast.success('Success')}>
						link
					</Button>
					<Button variant="destructive" onClick={() => toast.success('Success')}>
						destructive
					</Button>
				</div>
			</div>
		</div>
	)
}
