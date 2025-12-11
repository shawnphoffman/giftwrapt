import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'

import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/(core)/admin/test')({
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<>
			<Card className="bg-accent animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Test Styles</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col flex-1 gap-6">
						{/* CONTENT */}
						<LoadingSkeleton />
						<div className="flex flex-row gap-2 flex-wrap">
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
				</CardContent>
			</Card>
		</>
	)
}
