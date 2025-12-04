import { Card, CardContent, CardHeader } from '../ui/card'
import { Skeleton } from '../ui/skeleton'

export default function ListsByUserSkeleton() {
	return (
		<Card>
			<CardHeader>
				<div className="flex items-center gap-3">
					<Skeleton className="h-10 w-10 rounded-full" />
					<Skeleton className="h-5 w-32" />
				</div>
			</CardHeader>
			<CardContent>
				<div className="space-y-2">
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-3/4" />
				</div>
			</CardContent>
		</Card>
	)
}
