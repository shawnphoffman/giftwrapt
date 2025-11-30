import { Skeleton } from '@/components/ui/skeleton'
import { createFileRoute } from '@tanstack/react-router'
import { MessagesSquare } from 'lucide-react'

export const Route = createFileRoute('/(core)/recent/comments')({
	component: RecentCommentsPage,
})

function RecentCommentsPage() {
	return (
		<div className="flex flex-col flex-1 w-full max-w-5xl px-2 animate-page-in">
			<div className="relative flex flex-col flex-wrap justify-between gap-2">
				{/* HEADING */}
				<h1 className="flex flex-row items-center gap-2">Recent Comments</h1>
				<MessagesSquare className="size-18 text-teal-500 opacity-30 absolute left-4 -top-4 -z-10" />
				{/* DESCRIPTION */}
				{/* <div className="text-sm leading-tight text-muted-foreground">
					This page is a special request because Madison treats this like a social media site...
				</div> */}
				{/* CONTENT */}
				<Skeleton className="h-10 w-full" />
				{/* <Suspense fallback={<FallbackRowsMultiple />}>
					<MyPurchases />
				</Suspense> */}
			</div>
		</div>
	)
}
