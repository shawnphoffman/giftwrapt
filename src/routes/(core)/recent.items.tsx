import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { createFileRoute } from '@tanstack/react-router'
import { Inbox } from 'lucide-react'

export const Route = createFileRoute('/(core)/recent/items')({
	component: RecentItemsPage,
})

function RecentItemsPage() {
	return (
		<div className="flex flex-col flex-1 w-full max-w-5xl px-2 animate-page-in">
			<main className="flex flex-col flex-1 gap-8 divide-y">
				{/* LISTS */}
				<div className="flex flex-col gap-8">
					{/* Header */}
					<div className="relative flex flex-row flex-wrap justify-between gap-2">
						<h1 className="flex flex-row items-center gap-2">Create New List</h1>
						<Inbox className="size-18 text-purple-500 opacity-30 absolute left-4 -top-4 -z-10" />
						{/* DESCRIPTION */}
						{/* <div className="text-sm leading-tight text-muted-foreground">
							This page is a special request because Madison treats this like a social media site...
						</div> */}
						{/* CONTENT */}
						<LoadingSkeleton />
						{/* <Suspense fallback={<FallbackRowsMultiple />}>
							<MyPurchases />
						</Suspense> */}
					</div>
				</div>
			</main>
		</div>
	)
}
