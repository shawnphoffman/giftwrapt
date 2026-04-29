import { Card, CardContent, CardHeader } from '../ui/card'
import { Skeleton } from '../ui/skeleton'

export default function ListsByUserSkeleton() {
	return (
		<Card className="gap-2 py-4">
			<CardHeader className="px-4">
				<div className="flex items-center gap-3">
					<Skeleton className="h-10 w-10 rounded-full" />
					<Skeleton className="h-6 w-48" />
				</div>
			</CardHeader>
			<CardContent>
				<Skeleton className="h-8 w-full mt-3" />
			</CardContent>
		</Card>
	)
}
